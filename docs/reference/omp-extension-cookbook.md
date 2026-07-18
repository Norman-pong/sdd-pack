# omp Extension 实战

> 修改记录：执行 `lore log docs/reference/omp-extension-cookbook.md`
>
> 来源：合并原 `omp-extension-api.md` + `omp-slash-command-and-tool.md`（2026-07-18 归档）的有效内容，剔除已被 ADR 反向修订的决策。机制分层见 [omp 架构分层](omp-architecture-layers.md)。

适用场景：开发 omp marketplace 插件，同时暴露 slash command（人类入口）与 omp tool（LLM 入口）。

## 1. Extension API 接口摘要

权威源：[官方 extensions.md](https://github.com/can1357/oh-my-pi/blob/refs/heads/main/docs/extensions.md)。以下为 sdd-pack 实际用到的子集。

### 1.1 ExtensionAPI（顶层）

```typescript
interface ExtensionAPI {
  registerCommand(name: string, options: {
    description?: string;
    handler?: (args: string, ctx: ExtensionCommandContext) => any | Promise<any>;
    getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
  }): void;

  registerTool(definition: ToolDefinition): void;

  on(event: EventName, handler: (...args: any[]) => any): void;

  sendMessage(message: string | CustomMessage, options?: {
    deliverAs?: "steer" | "followUp" | "nextTurn";  // 默认 "steer"
    triggerTurn?: boolean;
  }): void;
  sendUserMessage(message: string): void;

  registerMessageRenderer(customType: string, renderer: (msg: CustomMessage) => ReactNode): void;
  registerShortcut(key: string, options: ShortcutOptions): void;
  registerFlag(name: string, options: FlagOptions): void;
  registerProvider(name: string, config: ProviderConfig): void;
  unregisterProvider(name: string): void;

  getActiveTools(): string[];
  getAllTools(): string[];
  setActiveTools(names: string[]): void;
  getCommands(): Command[];
  setLabel(label: string): void;
  appendEntry(entry: SessionEntry): void;

  getSessionName(): string | undefined;
  setSessionName(name: string): void;
  setModel(modelId: string): void;
  getThinkingLevel(): ThinkingLevel;
  setThinkingLevel(level: ThinkingLevel): void;

  registerBeforeInstall(handler: () => void): void;
  registerAfterInstall(handler: () => void): void;
  registerBeforeRemove(handler: () => void): void;
  registerAfterRemove(handler: () => void): void;

  exec(cmd: string, args: string[], opts?: ExecOptions): Promise<{ stdout; stderr; exitCode }>;
  cwd: string;
  ui: ExtensionUIContext;
  hasUI: boolean;
  zod: typeof import("zod").z;  // omp 运行时注入
  typebox: any;
}
```

### 1.2 ToolDefinition

```typescript
interface ToolDefinition<TParams, TDetails> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string;
  parameters: ZodSchema | TypeBoxSchema;
  execute: (
    toolCallId: string,
    params: TParams,
    signal: AbortSignal,
    onUpdate: (partial: any) => void,
    ctx: ExtensionContext,
  ) => Promise<{ content: any; details?: TDetails }>;
  renderCall?: (params, ctx) => ReactNode;
  renderResult?: (result, ctx) => ReactNode;
  hidden?: boolean;
  defaultInactive?: boolean;
  deferrable?: boolean;
  approval?: "always" | "never" | { predicate: (params) => boolean };
  onSession?: (session, ctx) => void;
}
```

- Tool 是 **LLM 触发**（agent 在 turn 中按 description 自主调用）
- Command 是 **用户触发**（`/name` 由用户输入）
- sdd-pack 现为 **1 个 `/sdd` 主命令 + 18 个 `sdd_*` tool 共存**（ADR-019e），共享 `src/cli/api.ts` 单一事实源；破坏性 tool（如 `sdd_archive_prd`）用 `approval: "always"` 保留人工确认。

### 1.3 ExtensionContext（Command/Event 共用）

```typescript
interface ExtensionContext {
  ui: ExtensionUIContext;  // notify / confirm / select / input
  hasUI: boolean;
  cwd: string;
  sessionManager: SessionManager;
  modelRegistry: ModelRegistry;
  memory: MemoryStore;
  hasPendingMessages(): boolean;
  abort(): void;
  shutdown(): Promise<void>;
  getSystemPrompt(): string;
  compact(): Promise<void>;
  isIdle(): boolean;
  getContextUsage(): { tokens: number; budget: number };
}
```

### 1.4 ExtensionCommandContext（Command 专属）

```typescript
interface ExtensionCommandContext extends ExtensionContext {
  waitForIdle(): Promise<void>;
  newSession(opts?: { setup?: (...) => any }): Promise<Session>;
  fork(entryId: string): Promise<Session>;
  navigateTree(targetId: string, opts?: { summarize?: boolean }): Promise<void>;
  switchSession(sessionPath: string): Promise<void>;
  reload(): Promise<void>;
  branch(entryId: string): Promise<void>;
}
```

## 2. Slash Command vs Tool 机制对照

### 2.1 Slash Command（人类入口）

```
用户输入 /sdd init --title X
    ↓
omp runtime 拦截 "/sdd" 前缀
    ↓
查 marketplace cache（~/.omp/plugins/cache/.../extensions/.../index.ts）
    ↓
调 registerCommand 注册的 handler(args: string, ctx)
    ↓
handler 内部 splitArgs → tokens[] → parseArgs → 路由到子命令
    ↓
调 src/cli/api.ts 函数
```

关键特征：依赖 marketplace cache；参数是 `args: string`（自行解析）；人类触发；可注册 `getArgumentCompletions` tab 补全。

### 2.2 Tool（LLM 入口）

```
LLM 在 turn 中决定调用 sdd_init_prd({title: "X"})
    ↓
omp runtime 查 tool 注册表（extension factory 执行时同步注册）
    ↓
pi.registerTool 的 execute(toolCallId, params, signal, ...)
    ↓
execute 内部直接 import + 调 src/cli/api.ts 函数
```

关键特征：**不依赖 cache**（factory 同步注册，结果在 omp runtime 内存）；参数是 `params: object`（zod schema 解析，`pi.zod.z` 注入）；LLM 触发；返回 `{ content, details }` 与 read/write/bash 同协议。

### 2.3 对照速查

| 维度 | Slash Command | Tool |
|---|---|---|
| 触发方 | 人类（`/sdd <sub>`） | LLM（agent tool-call） |
| 参数形态 | `args: string`（需自行解析） | `params: object`（zod 解析） |
| 注册 API | `pi.registerCommand(name, {handler})` | `pi.registerTool({name, parameters, execute})` |
| 依赖 marketplace cache | **是**（cache 漂移会导致命令失效） | **否**（factory 同步注册） |
| 补全 | `getArgumentCompletions` | 由 LLM 根据 description 推断 |
| 适合场景 | 人类手动操作 | agent 自动化调用 |

### 2.4 共存策略（ADR-019e）

v1.4 决策"只 Command 不 Tool"被实战推翻：cache 漂移让 slash command 在外部项目脆弱（§3），agent 又需要稳定 tool-call 入口。共存原则：

- **共享单一事实源**——`api.ts` 的函数，command 和 tool 各自做参数适配后都调它，零逻辑重复。
- **破坏性操作仍需确认**——`sdd_archive_prd` 等 tool 的 `approval` 设 `"always"`；非破坏性的 `sdd_get_status` / `sdd_list_prds` 设 `"never"`。

## 3. marketplace cache 漂移

### 症状

外部项目装了 plugin 后，新版子命令报"未知子命令"，但源码路由表明明注册了。

### 根因

omp 装载 slash command 走 marketplace cache（`~/.omp/plugins/installed_plugins.json` + `~/.omp/plugins/cache/...`），不是 symlink 指向的源码：

```
~/.omp/plugins/installed_plugins.json        # 记录版本 1.6.0（旧）
~/.omp/plugins/node_modules/sdd-pack -> /源码/sdd-pack   # symlink 指向 1.8.0 源
```

cache 目录里是旧版本 extension module，新子命令不可见。

### 验证

```sh
cat ~/.omp/plugins/installed_plugins.json | grep -A 2 sdd-pack   # 记录版本
readlink ~/.omp/plugins/node_modules/sdd-pack                    # symlink 实际指向
grep -c "SUBCOMMAND" ~/.omp/plugins/cache/sdd-pack/*/extensions/sdd-extension/sdd-router.ts
grep -c "SUBCOMMAND" /源码/sdd-pack/plugins/sdd-pack/extensions/sdd-extension/sdd-router.ts
# 两个数字不一致 = cache 漂移
```

### 解法

- 短期：`omp plugin install sdd-pack --force` 刷新 cache。
- 长期：关键 API 同时注册为 tool（不依赖 cache），slash command 失效时 agent 仍可用 `sdd_*` tool。

### 下次怎么做

- 新增 slash command 后**立即在 omp session 里验证 `/sdd <新命令>` 可用**，别只测 `api-runner.ts`。
- slash command 是人类入口，tool 是 agent 入口——互补，不二选一。

## 4. zod 注入与 fallback

### 症状

`pi.registerTool` 的 `parameters` 需要 zod schema，但 plugin `package.json` 不依赖 zod——zod 是 omp runtime 在 factory 执行时注入的（`pi.zod.z`）。开发时 `import { z } from "zod"` 报 `Cannot find package 'zod'`。

### 解法

```typescript
interface ZApi {
  object(_shape: Record<string, unknown>): unknown;
  string(): ZChain;
  boolean(): ZChain;
  enum(_vals: readonly string[]): ZChain;
}

function isZApi(v: unknown): v is ZApi {
  return v !== null && typeof v === "object" &&
    "object" in (v as object) && "string" in (v as object) &&
    "boolean" in (v as object) && "enum" in (v as object);
}

function zodFallback(): ZApi { /* 占位 chainable */ }

const zRaw = pi.zod?.z ?? zodFallback();
const z: ZApi = isZApi(zRaw) ? zRaw : zodFallback();
```

### 下次怎么做

- **永远不要 `import { z } from "zod"`**——用宽松 interface + type guard 接 `pi.zod.z`。
- 单测时模拟注入：`const pi = { registerTool: ..., zod: { z: (await import("zod")).z } }`（测试环境装 zod devDep），或用 fallback 测注册数量。
- params 转交 api 函数时 `as unknown as X` 双重 cast 是必要的（zod 解析出 `Record<string, unknown>`，api 函数要强类型 Options）。

## 5. command 与 tool 执行路径分离

| 入口 | 参数形态 | 路由 |
|---|---|---|
| `/sdd init --title X`（command） | `args: string` → splitArgs → tokens → parseArgs | sdd-router.ts handler → api.ts |
| `sdd_init_prd({title: "X"})`（tool） | `params: Record<string, unknown>`（zod 解析后） | tools.ts execute → **直接 import api.ts** |

错误做法：让 tool 也走 router handler——需要把 object 序列化成 tokens 再 parse 回来，有损且多余。正确做法（ADR-019）：

```typescript
// tools.ts execute 直接调 api.ts，跳过 sdd-router
async execute(_id, params) {
  const { initPrd } = await import("../../src/cli/api");
  const r = await initPrd(params as unknown as Parameters<typeof initPrd>[0]);
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], details: r };
}
```

## 6. 归档与状态机实战

### 6.1 归档不是状态迁移

**症状**：`archivePhase` 调 `isPhaseTransitionAllowed(Completed, Completed)` 返回 false，归档失败。

**根因**：ADR-017 定义 `Completed`/`Abandoned` 是终态（无出边）。但归档（移文件到 archive/）是**物理操作**，不是状态迁移。

**解法**：前置校验改为"是否已达终态"：

```typescript
const isTerminal = meta.status === PhaseStatus.Completed || meta.status === PhaseStatus.Abandoned;
if (!isTerminal) return error("归档前必须先 /sdd phase complete|abandon");
```

**下次怎么做**：区分状态迁移（生命周期推进，走状态机）与物理操作（归档/重命名/移动文件，不走状态机）。

### 6.2 phase meta id ≠ 文件名

**症状**：用文件名 `001-foundation.md` 解出 `001-foundation` 当 phaseId 查 meta，返回 null。

**根因**：phase meta id 格式是 `phs-NNN-NNN`（planPrd 分配），文件名是 `<seq>-<title-slug>.md`，两者格式不同。

**解法**：通过 filePath 反查 meta：

```typescript
const metaIndex = readMetaIndex();
let meta: PhaseMeta | null = null;
for (const pid of metaIndex.phaseIds) {
  const m = readPhaseMeta(pid);
  if (m && (m.filePath === phaseRel || m.filePath === opts.phasePath)) { meta = m; break; }
}
```

**下次怎么做**：meta.json 是事实源（ADR-018）。拿 meta 用 `readMetaIndex()` + `readPhaseMeta(id)`，不从文件名反推 id。

### 6.3 archivePrdV2 + archivePhase 交互：ENOTEMPTY

**症状**：phase 先归档（移走单文件）后，PRD 再归档（移整个 group 目录）报 `ENOTEMPTY: directory not empty, rename ...`。

**根因**：`renameSync(源目录, 目标目录)` 在目标已存在且非空时抛错。archivePhase 移走文件后源目录变空、目标目录已存在，archivePrdV2 的 `renameSync(空目录, 非空目标)` 触发 ENOTEMPTY。

**解法**：移动前检查源目录状态 + 目标是否存在：

```typescript
if (existsSync(phaseGroupDir)) {
  const entries = readdirSync(phaseGroupDir);
  if (entries.length === 0) {
    rmdirSync(phaseGroupDir);  // 空目录：删，不 move
  } else if (existsSync(phaseArchiveDir)) {
    for (const entry of entries) {  // 目标已存在：逐文件合并，记录 fileMoves 供回滚
      renameSyncWithTestHook(resolve(phaseGroupDir, entry), resolve(phaseArchiveDir, entry));
      fileMoves.push({ from: resolve(phaseGroupDir, entry), to: resolve(phaseArchiveDir, entry) });
    }
    rmdirSync(phaseGroupDir);
  } else {
    renameSyncWithTestHook(phaseGroupDir, phaseArchiveDir);
    fileMoves.push({ from: phaseGroupDir, to: phaseArchiveDir });
  }
}
```

**下次怎么做**：任何 `renameSync(A, B)` 前检查 A 是否为空、B 是否已存在；合并时每个文件 move 都加入 fileMoves；空目录用 `rmdirSync`。

### 6.4 插件仓库自身是 sdd 项目：测试污染

**症状**：在 sdd-pack 仓库跑 sdd API 测试后，真实 `docs/prd/`、`docs/index.md` 被修改，`.sdd/meta/` 出现测试产物。

**根因**：sdd-pack 仓库自身就是 sdd 项目（有 `docs/prd/` + `.sdd/meta/`）。`findRepoRoot()` 往上遍历找到 `docs/prd/` 就停，`process.chdir(tmpRoot)` 不够——findRepoRoot 不依赖 cwd。

**解法**：测试临时目录必须包含 `docs/prd/` 子目录，让 findRepoRoot 停在临时目录：

```typescript
const tmpRoot = pathResolve(import.meta.dir, "../../.test-tmp-xxx");
mkdirSync(pathResolve(tmpRoot, "docs/prd"), { recursive: true });  // 关键
// ...
finally {
  process.chdir(originalCwd);
  rmSync(tmpRoot, { recursive: true, force: true });
}
```

已污染的恢复：

```sh
git checkout docs/index.md docs/prd/*.md
rm -rf docs/phase/prd-20260717-XXX/
bun -e 'import { syncMeta } from "./src/cli/api"; await syncMeta({});'
```

**下次怎么做**：sdd API 测试一律用含 `docs/prd/` 的临时目录；`finally` 块必须清理；发现 `docs/` 不明修改先 `git diff docs/` 怀疑测试污染。

## 7. 命令清单一致性校验（commands.generated.json）

**症状**：新增 `/sdd <新命令>` 后 `validate` 的 Check #12 报 warn"api-runner 缺失: <新命令>"。

**根因**：sdd-router.ts（command 路由）和 api-runner.ts（CLI switch case）是两份独立命令清单。Check #12 比对两者一致性，数据源是 `commands.generated.json`。新增子命令后没重新生成，Check #12 用旧数据。

**解法**：

```sh
cd plugins/sdd-pack && bun run gen:commands
```

**下次怎么做**：sdd-router.ts 或 api-runner.ts 路由变更后立即跑 `gen:commands`；`commands.generated.json` 提交到版本控制（Check #12 运行时数据源）；Check #12 报 warn 先跑 `gen:commands` 再看是否消失。

## 8. 正确提交流程（/sdd gate commit，ADR-020）

omp 的 commit 拦截（extension `pi.on('tool_call')` `{block:true}`）拦截 bash 里直接调用的 `git commit` / `lore commit`。正确入口是 `/sdd gate commit` slash command 或 `sdd_gate` tool——走 `handleGateCommit` → `runCommit` → `spawnSync("lore", ["commit"])`，链路在 slash command / tool 层完成，不经过 bash tool_call handler。

### 标准流程

```sh
# 1. lint 门禁
/sdd gate lint
# 2. 功能验证(可选)
/sdd gate test
# 3. spawn 真实 reviewer agent 审查 staged diff
#    产物路径: .sdd/review/staged.reviewer.json
#    必须用 reviewer: "reviewer"
#    staged_hash 不能留空(留空 = 绕过时效校验 = 违规)
# 4. 检查 review 产物
/sdd gate review
# 5. 再跑 lint + lore 约束检查
/sdd gate precommit
# 6. 提交(唯一入口)
/sdd gate commit --message '{"intent":"...","trailers":{...}}'
```

### 关键约束

- **reviewer 字段必须是真实 reviewer agent**（`reviewer: "reviewer"`）。
- **reviewer 产物必须通过 writeReviewArtifact 写入**——禁止 agent 直接手写 `.sdd/review/*.json`。writeReviewArtifact 在 staged_hash 为空时自动填充。
- **不要在 bash 里调 runCommit / writeReviewArtifact**——这两个 API 是 `/sdd gate` 内部使用，agent 直接调用会绕过门禁。

## 9. bunx sdd CLI 端到端验证流程

新增 sdd 功能后，用临时 git 仓库跑完整流转验证。不要在插件仓库自身测（污染真实 docs/，见 §6.4）。

### 标准流程

```sh
# 1. 创建临时仓库（必须含 docs/prd/ 让 findRepoRoot 停在临时目录）
rm -rf /tmp/sdd-e2e && mkdir /tmp/sdd-e2e && cd /tmp/sdd-e2e
git init -q
mkdir -p docs/prd docs/phase
cat > docs/index.md <<'EOF'
# 项目文档索引

## 产品需求文档（PRD）

| 日期 | 文档名称 | 状态 | 对应 Phase | 说明 |
| ---- | -------- | ---- | ---------- | ---- |

## 阶段文档（Phase）

| 日期 | 阶段名称 | 状态 | 对应 PRD | 说明 |
| ---- | -------- | ---- | -------- | ---- |
EOF

# 2. 跳过 gate（空项目无 lint/test）
mkdir -p .sdd
echo '{"lint":"true","test":"true","build":"true"}' > .sdd/gate.json

# 3. 跑完整流转
bunx sdd init --title "E2E" --slug e2e --json | jq .status   # pass
bunx sdd review  --json | jq .status                          # pass/warn
bunx sdd approve --json | jq .status                          # pass
bunx sdd plan --phase Foundation --json | jq .status          # pass
bunx sdd start   --json | jq .status                          # pass
bunx sdd phase --action start --id phs-001-001 --json | jq .status   # pass
bunx sdd phase --action complete --id phs-001-001 --json | jq .status  # pass

# 4. 验证归档
bunx sdd phase-archive docs/phase/prd-*/001-foundation.md --reason completed --no-commit --json | jq .operations
# 应有 4 个 operation: 状态行/物理移动/meta.filePath/PRD回指

# 5. 验证文件状态
ls docs/phase/prd-*/          # 应为空
ls docs/phase/archive/prd-*/  # 应有归档文件
grep "对应阶段" docs/prd/*.md  # 链接应重写到 archive/

# 6. PRD 归档（测 ENOTEMPTY 场景）
bunx sdd archive --reason abandoned --no-commit --json | jq .status  # pass

# 7. 整体一致性校验
bunx sdd validate --json | jq '.checks[] | select(.severity=="error") | .passed'  # 全 true
```

### 关键点

- 临时仓库必须含 `docs/prd/`——否则 findRepoRoot 穿透到上级仓库。
- 用 `--no-commit`——归档不触发 lore commit（临时仓库无 lore）。
- gate.json 配 `"true"` 跳过 lint/test/build。
- 测完清理 `rm -rf /tmp/sdd-e2e*`。

## 10. 生态参考项目

| 项目 | 路径 | 借鉴点 |
| --- | --- | --- |
| `Dwsy/pi-extensions-skill` | `https://github.com/Dwsy/pi-extensions-skill/blob/main/guides/01-quickstart.md` | 最小完整 extension 示例（greet command） |
| `salesforce/sf-pi` | `https://github.com/salesforce/sf-pi/blob/main/lib/common/safe-command-handler.ts` | command handler 异常安全包装 |
| `screenfluent/omp-semantic-grep` | `https://github.com/screenfluent/omp-semantic-grep` | hybrid tool + ui.notify |
| `usr-bin-roygbiv/omp-cmux-browser-tools` | `https://github.com/usr-bin-roygbiv/omp-cmux-browser-tools` | extension + marketplace 双重发布 |
| `pi-mono` examples | `https://app.unpkg.com/@oh-my-pi/pi-coding-agent@16.1.11/files/examples/extensions/reload-runtime.ts` | 综合性 extension / reload-runtime / 列表 + arg completion |
| `@aliou/pi-dev-kit` | `https://cdn.jsdelivr.net/npm/@aliou/pi-dev-kit@0.8.0/src/skills/pi-extension/references/messages.md` | persistent vs ephemeral 消息区分 |

## 11. 关联文档

- [omp 架构分层](omp-architecture-layers.md) — 装载/注册表/运行时/宿主四层机制
- [架构决策记录](../architecture/decisions.md) — ADR-015（extension 合并）/ ADR-019（command+tool 共存）/ ADR-020（真实 reviewer）
- 归档旧文（历史参考）：`docs/reference/archive/omp-extension-api.md`、`docs/reference/archive/omp-slash-command-and-tool.md`
