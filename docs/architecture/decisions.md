# Architecture Decision Records (ADR)

> 仓库 `zhimingcool/sdd-pack` 的架构决策记录
> 命名: ADR-NNN(顺序编号)
> 状态: Proposed / Accepted / Superseded

---

## ADR-006: hook extension 替代 static rules(CLI flag 装载)

**状态**: Accepted(2026-06-24,v1.1.0)
**决策人**: norman
**触发**: B1.2 实测 omp v16.1.16 plugin 装载器不识别 `omp.hooks` manifest 字段(`docs/phase/.working/2026-06-24-sdd-pack/v1.1-decision.md`)
**影响**: 替代 PRD §3.2.4 中"hook extension fallback"方案;改变 0.9.0-rc 中 4 个 rule 仅作为静态资产不自动加载的状态

### 背景

sdd-pack 0.9.0-rc 的 4 个 rule(`lore-protocol` / `docs-update-guard` / `lore-commit-guard` / `sdd-doc-edit-guard`)作为静态 markdown 文件打包,但 omp v16.1.16 在 marketplace install 与 local link 两种 plugin 装载模式下都不自动发现这些 rule(详见 `docs/prd/2026-06-24-sdd-pack.md` §11.3 验证报告)。

PRD §3.2.4 提出的 fallback 方案是:把 rule 改写为 hook extension,通过 `pi.on("tool_call", ...)` 拦截工具调用实现等价功能。

### 决策

**采用 hook extension 方案,但装载方式改为 CLI flag 而非 plugin manifest**。原因:omp v16.1.16 的 plugin 装载器未实现 `omp.hooks` 字段(issue #677 历史反馈,#1496 修复后未确认),但 `--hook <file>` CLI flag 能直接加载 hook 文件,hook runtime 本身工作。

### 方案

#### Hook 装载

```bash
# 启动 omp 时显式加载 hook
omp --hook <plugin-root>/hooks/index.ts [其他命令...]

# alias 持久化(写入 ~/.zshrc 或 ~/.bashrc)
alias omp='omp --hook /path/to/sdd-pack/plugins/sdd-pack/hooks/index.ts'
```

#### 4 个 rule → hook 映射

| 原 rule                 | alwaysApply | condition              | scope                      | hook 实现                                                                     | 行为                                       |
| ----------------------- | ----------- | ---------------------- | -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| `lore-protocol.md`      | `true`      | —                      | —                          | `pi.on("session_start")` 注入 lore reminder                                   | 启动 omp 时系统提示含 lore commit 协议摘要 |
| `docs-update-guard.md`  | —           | `(git\|lore)\s+commit` | `tool:bash`                | `pi.on("tool_call")` 匹配 `git\|lore commit`,`pi.sendMessage` 提示走 sdd-core | 不拦截,仅提示                              |
| `lore-commit-guard.md`  | —           | `(git\|lore)\s+commit` | `tool:bash`                | `pi.on("tool_call")` 匹配,`return { block: true, reason }` 硬拦截             | 强制用 lore commit                         |
| `sdd-doc-edit-guard.md` | —           | —                      | `tool:write/edit(docs/**)` | `pi.on("tool_call")` 匹配 `docs/`,`return { block: true, reason }`            | docs/ 写入走 sdd-core skill                |

#### 副作用与权衡

- **正面**: 4 个 rule 真正激活,功能等价 native rules
- **代价**:
  - 用户启动 omp 必须加 `--hook` flag(或配 alias),增加一步
  - hook 是 TS 文件,需 Node.js + bun(omp runtime 通过 bun 加载)
  - `lore-protocol` 始终应用通过 `session_start` 注入消息,时机与原生 `alwaysApply` 不同(原生是 system prompt 字段,本方案是运行时 sendMessage)
- **风险**:
  - 0.9.0-rc 期间 `~/.omp/agent/rules/` 下的 native rules 保留;v1.1 验证通过后才移除(B1.7)
  - 移除 native rules 前必须先 B1.6 hook 验证通过,否则直接破坏 lore 提交工作流(与 `fallback-decision.md` §3 一致的风险)

### 替代方案(已拒绝)

1. **patch 路径**(发 0.9.1 占位 release,v1.1 推迟): hook runtime 实际工作,推迟浪费
2. **等 omp 上游修复 plugin manifest**: 不可控,等不及
3. **保留 native rules + 不实施 hook**: 0.9.0-rc 当前状态,功能受限
4. **重写为 npm package + omp.extension**: 引入 `npm install` 依赖,违反 PRD §4.1「不依赖 npm 包」原始约束;且 omp 16.1.16 extension 装载同样未实测

### 后续

- v1.2(若启动): 评估 omp 上游 `omp.hooks` 字段支持进度;若已实现,plugin manifest 路径替换 CLI flag 路径
- 跟踪 issue: https://github.com/Norman-pong/sdd-pack/issues/1(v1.1 完成后关闭)

### 状态更新(2026-06-29,v1.2.4 实测 + 官方文档核验)

**触发事实**:

- omp v16.2.4 官方文档(`docs/rulebook-matching-pipeline.md` §2 + `docs/skills.md` "Built-in skill providers and precedence")明确:`omp-plugins` provider(priority 90)**设计上即扫描** plugin 的 `rules/*.{md,mdc}` 与 `skills/<name>/SKILL.md`,与 `native` provider 共存去重
- PR #1498 "fix(discovery): wire extension package sub-dirs"(2026-05-29,已合入)修复了 `omp plugin install`/`omp plugin link` 注册的包的子目录发现(Fixes #1496)
- 跟踪 issue:https://github.com/Norman-pong/sdd-pack/issues/1 v16.1.16 阶段开启,v16.2.x 起对应修复已合入上游

**本机实测**(2026-06-29,omp v16.2.4):

- 配置:`~/.omp/plugins/node_modules/sdd-pack` symlink 指向工作树;`omp-plugins.lock.json` 显示 `sdd-pack` 已 `enabled: true`;`omp plugin discover` 列出 `sdd-pack@1.2.3`
- 全新 omp 进程(`omp -p ... --no-session`)读 `rule://docs-update-guard` / `rule://prd-change-management` 均报 `Unknown rule`;available 列表仅含 19 个 native rules(`rs-*`/`ts-*`/`frontend-use-vp`),**0 个 plugin rule**
- 同样方式读 `skill://sdd-core` 报 `Unknown skill`,available 列表仅含本机 managed-skills,**0 个 plugin skill**

**结论**:**官方文档说支持,本机实测不工作**——根因待查(provider 加载时序 / 缓存 / 配置开关均可能),不在本 ADR 范围内

**对本 ADR 决策的影响**:

- ADR-006 决策**保持 Accepted,不变**(历史决策如实记录;前提"omp 不发现 plugin rules"在 v16.1.16 成立)
- 但**当前 hook 仍需保留**——hook 提供 `lore-commit-guard` 的 `block: true` 硬拦截能力(强制 `git commit` 改走 `lore commit`),这是 omp rule 体系**做不到**的能力(`rule.interruptMode` 仅控制 steering 队列,不拦截工具调用,详见 `docs/hooks.md` 与 `docs/rulebook-matching-pipeline.md`)
- 因此 hook 当前的定位**不是"过渡方案的待退役代码",而是"提供 rule 不可替代拦截能力的运行时层"**

**迁移路线**(待触发条件满足):

1. 触发条件:omp-plugins provider 在本机实测能发现 plugin rules/skills(全新 omp 进程 `read rule://docs-update-guard` 返回规则内容而非 `Unknown`)
2. 阶段 a:把 `lore-protocol` 改用 `alwaysApply: true`(去掉 session_start sendMessage)
3. 阶段 b:把 `docs-update-guard` / `sdd-doc-edit-guard` 改用 `scope` + `condition`(去掉 tool_call 提示分支)
4. 阶段 c:`lore-commit-guard` 硬拦截能力需等 omp 提供 rule-level tool blocking(目前无此能力)——届时**该 rule 的功能可能需要保留为 hook 或重新设计**
5. 阶段 d:hooks/ 目录移除;README §5 "与 native rules 的共存" 章节删除;CHANGELOG 标注 hook 退役

---

## ADR-007: 代码评审拆为三层守门 agent(非单体 reviewer)

**状态**: Accepted(2026-06-25,v1.2.0)
**决策人**: norman
**触发**: sdd-pack v1.2.0 引入代码评审能力;单体 reviewer vs 三层分离的设计选择
**影响**: 新增 `plugins/sdd-pack/agents/` 目录(reviewer/arch-reviewer/sdd-reviewer);reviewer 覆盖 bundled 同名;arch/sdd-reviewer 为手动 task() 触发

### 背景

omp 内置一个 bundled `reviewer` agent(commit gate)。sdd-pack 需要补充架构评审(arch)和文档一致性(sdd)两个维度。可选方案:扩展现有 reviewer 为多模式 agent,或拆为三个单一 persona 的 agent。

### 决策

**采用三层分离,而非单体多模式**。三个 agent 各有独立的 persona、触发时机、severity 体系、output schema:

| 层      | Agent         | 触发                   | blocking | 认知模式               | verdict             |
| ------- | ------------- | ---------------------- | -------- | ---------------------- | ------------------- |
| Layer 1 | reviewer      | commit gate 自动       | true     | 局部、演绎、patch 锚定 | overall_correctness |
| Layer 2 | arch-reviewer | PR/milestone/plan 手动 | false    | 全局、归纳、趋势感知   | overall_quality     |
| Layer 3 | sdd-reviewer  | phase/merge 手动       | false    | 文档交叉引用、契约比对 | overall_conformance |

### 方案

#### 发现与触发

- 三个 agent 放 `plugins/sdd-pack/agents/*.md`,由 omp task-agent discovery 从 plugin `agents/` 子目录发现(优先级 3)
- `reviewer` 覆盖 bundled 同名(first-wins:plugin 源优先于 bundled)
- `arch-reviewer`/`sdd-reviewer` 为新增名,无冲突
- commit gate 仍由 `commit-review.ts` 扩展自动调用 `reviewer`(通过 `[omp-review:ok]` token,不解析 verdict JSON)
- arch/sdd-reviewer 由用户手动 `task(agent="arch-reviewer")` / `task(agent="sdd-reviewer")` 触发

#### 职责边界(防重叠)

- **reviewer** 不做全仓架构扫描或完整 docs/ 树读取(那是 Layer 2/3 的活)
- **arch-reviewer** 不报 runtime bug(那是 reviewer 的活);支持 code mode + plan mode 双模式
- **sdd-reviewer** 不评审代码质量(那是 reviewer/arch-reviewer 的活),不写文档(那是 sdd-core/prd/phase 的活)

#### 副作用与权衡

- **正面**: 每个 agent 单一 persona,LLM 表现力集中;commit gate 保持快速(只跑 reviewer);PR/phase gate 可慢但彻底
- **代价**: 三个 agent 文件需分别维护;用户需记住何时调哪个 agent(有 skill://omp-three-layer-reviewer 指导)

### 替代方案(已拒绝)

1. **单体多模式 reviewer**: 一个 agent 同时处理 commit/PR/phase 三种评审 — LLM 在多模式间稀释表现力;commit gate 被慢审查拖累;小补丁被过度评审。三层认知模式差异大(局部演绎 vs 全局归纳 vs 文档比对),不适合塞进一个 prompt
2. **仅扩展 bundled reviewer,不新增 arch/sdd**: 缺少架构和文档一致性维度,评审覆盖不全
3. **用 rule 实现代码评审**: rule 是文本拦截,无 LLM 推理能力,无法做 patch 锚定的 bug 分析或架构趋势判断

### 后续

- v1.2.1: sdd-reviewer 增加三态判定(体系不存在/已初始化未启用/部分启用/完整启用),避免无 PRD 时的越界误报
- 评估:是否需要 Layer 4(security-reviewer 安全评审)或 Layer 0(lint 快速门)
- agent 数量增长后的管理:考虑 agent 发现性能与 prompt 维护成本

---

## ADR-008: sdd CLI 工作流

**状态**: Superseded by [ADR-009](#adr-009-sdd-extension替代独立-cli) (2026-06-30,v1.3.0-rc.1 起 1 周内 v1.4.0-alpha 替换)
**决策人**: norman
**触发**: sdd-pack v1.2.3 PRD 状态行堆叠问题暴露文档生命周期操作缺乏自动化工具;`prd-change-management` rule 解决了判断逻辑但未解决执行落地。
**影响**: `plugins/sdd-pack/src/cli/` 新增 ~800–1200 行 TS(含测试);`plugins/sdd-pack/bin/sdd` 新增 ~10 行 wrapper;`hooks/index.ts` 修改 ~30 行;`docs/prd/_template.md` 新增 Δ 段

### 背景

sdd-pack v1.2.3 验证中发现 PRD 状态行堆叠（5 个版本功能挤在一条状态行）是文档管理的主要痛点。`prd-change-management` rule 提供了"是否要拆版本"的判断逻辑，但 rule 无法执行文件操作（移动、重命名、批量链接更新）。`sdd-core`/`sdd-prd` skill 依赖 agent 正确执行操作步骤，agent 可能遗漏步骤。

### 决策

构建 `sdd` CLI（TypeScript + bun），定位为 sdd-pack 文档生命周期的权威入口。提供 `propose` / `validate` / `archive` 三个核心子命令 + 4 个辅助子命令 `status` / `list` / `migrate` / `why` / `apply`。

### 方案

1. CLI 位于 `plugins/sdd-pack/src/cli/`，随 plugin 分发
2. `bin/sdd` 是 bash 薄壳 wrapper，转发到 bun + TS 入口
3. 7 个子命令: validate(10 项检查)/propose/archive/status/list/migrate/why/apply
4. 核心库: prd-state-machine(状态机)/doc-parser/validator/template-engine/index-sync/lore-wrapper
5. hook 集成: `hooks/index.ts` 在 commit 时调用 `sdd validate --staged --json`
6. CLI 做结构化检查（可程序化），三层守门 agent 做语义检查（需 LLM）

### 替代方案(已拒绝)

1. **等 omp 原生支持** — 不可控
2. **沿用纯 rule + skill 模式** — 已在 v1.2.3 验证不足
3. **引入 OpenSpec 产品** — `changes/` 目录与 sdd-pack 现有 `prd/` 结构冲突
4. **用 Python/Rust/Go 写 CLI** — 违反「TypeScript + bun」决策

### 后续

- v1.3.0-rc.1: Phase A 完成 → 内部 dogfooding
- v1.3.0-rc.2: Phase B 完成 → 小范围测试
- v1.3.0: Phase C 完成 → 正式发布

---

## ADR-009: sdd Extension 替代独立 CLI

**状态**: Accepted (2026-06-30,v1.4.0-alpha)
**决策人**: norman
**触发**: [ADR-008](#adr-008-sdd-cli-工作流) v1.3.0-rc.1 提交后发现第三方用户安装体验问题（`alias sdd='bun .../bin/sdd'` 手工配置不可持续），需重新审视分发形态
**影响**: 替代 ADR-008；删除 `bin/sdd`、`src/cli/index.ts`、`src/cli/lib/arg-parser.ts`、`src/cli/commands/*.ts`；新增 `src/cli/api.ts`、`src/cli/api-runner.ts`、`extensions/sdd-extension/index.ts`；修改 `hooks/index.ts`（in-process 化）、`package.json`（新增 `omp.extensions` manifest、移除 `bin` 字段）；ADR-008 进入 Superseded

### 背景

ADR-008 选择的「独立 bash wrapper + bun + TS CLI 入口」形态在第三方市场安装路径下存在三个一致性问题：

1. **`package.json#bin` 字段对 omp 是 noop** — omp marketplace 不识别 npm `bin` 字段，不会把 plugin 注册到用户 PATH；`bin` 字段仅 npm install 时生效
2. **用户必须手工配置 alias** — 实际使用路径是 `alias sdd='bun ~/.omp/plugins/node_modules/sdd-pack/bin/sdd'`，依赖 bun runtime + 准确路径，与 omp marketplace「一键安装即用」承诺不符
3. **与 omp 生态已有扩展形态不一致** — omp 已有的命令/能力扩展（commands / agents / hooks / extension）都是 plugin 内联形态；独立 CLI 二进制是「自造形态」

2026-06-30 omp 生态市场调研结论（详见 [`docs/reference/omp-extension-api.md`](../../reference/omp-extension-api.md)）：

| omp 生态中已有的「命令」形态          | 例子                            | 限制                            |
| ------------------------------------- | ------------------------------- | ------------------------------- |
| omp 内部 slash command                | `/handoff`, `/notes`, `/commit` | 必须在 omp 会话内（人机交互）   |
| omp 自身子命令                        | `omp plugin ...`                | omp core 提供，非 plugin 可声明 |
| 独立 npm 全局 CLI                     | `@oh-my-pi/cli`                 | npm 路径，不走 marketplace      |
| marketplace plugin `package.json#bin` | 无 omp 端装载机制               | omp marketplace 不识别          |

**结论**：omp marketplace 没有 plugin 分发独立 CLI 二进制的官方机制。已有路径只有两条：slash command（omp 原生）或 npm 全局包（脱离 marketplace）。

### 决策

**采用 omp extension + slash command 作为 sdd-pack 文档生命周期的权威入口形态**：

1. **人机交互场景**：omp extension 在 `~/.omp/plugins/node_modules/sdd-pack/` 装载后，会话中敲 `/sdd-validate` / `/sdd-propose` / `/sdd-archive` 等 8 个 slash command
2. **自动化场景**（CI / hook / 脚本）：导出 `src/cli/api.ts` 程序化入口，纯函数调用，无 spawn subprocess
3. **CI 逃生通道**：`src/cli/api-runner.ts` 是 bun 一行入口（`bun -e` 形式），供 GitHub Actions / drone CI 使用——**不是新 CLI**，是 `api.ts` 的薄壳
4. **hook 保留**：`hooks/index.ts` 仍存在，但 `runSddValidate` 从 spawn subprocess 改为 in-process 调用 `api.validateDocs()`

### 方案

#### 模块拓扑

```
plugins/sdd-pack/
├── src/
│   └── cli/
│       ├── api.ts                  # 8 个程序化函数（CI/hook/slash 共用）
│       ├── api-runner.ts           # CI 逃生通道（薄壳）
│       └── lib/                    # 核心库（零业务修改，提升为共用）
│           ├── prd-state-machine.ts
│           ├── doc-parser.ts
│           ├── validator.ts
│           ├── template-engine.ts
│           ├── index-sync.ts
│           └── lore-wrapper.ts
├── extensions/                     # 新增目录
│   └── sdd-extension/
│       └── index.ts                # extension factory,8 个 slash command 注册
├── hooks/
│   └── index.ts                    # 改 in-process 调用 api.ts
└── package.json                    # 新增 omp.extensions manifest,移除 bin 字段
```

#### 8 个 slash command 设计

| Command         | API 函数                 | UI 形态                                 |
| --------------- | ------------------------ | --------------------------------------- |
| `/sdd-validate` | `validateDocs(opts)`     | `setWidget` 多行 + `notify` 摘要        |
| `/sdd-propose`  | `proposePrd(opts)`       | `input`（缺 title 时）+ `notify`        |
| `/sdd-archive`  | `archivePrd(opts)`       | `select`（reason）+ `confirm`（破坏性） |
| `/sdd-migrate`  | `migratePrd(opts)`       | `confirm` + `notify`                    |
| `/sdd-status`   | `getStatus()`            | `setWidget`（状态总览）                 |
| `/sdd-list`     | `listPrds(opts)`         | `setWidget`（过滤列表）                 |
| `/sdd-why`      | `getWhy(target)`         | `notify`（lore 决策摘要）               |
| `/sdd-apply`    | `getApplyChecklist(prd)` | `setWidget`（checklist）                |

#### api.ts 边界约束（针对 arch-reviewer P1-3「God object」风险）

api.ts 的 8 个函数必须满足：

- **每个函数 ≤ 80 行**（不是 arch-reviewer 建议的 30 行——本仓库 commands/ 单文件平均 150 行,80 行足够容纳一个薄壳 adapter + 简单编排）
- **无新逻辑**：path 解析 / git staged 检测 / option validation / severity gating 等跨函数共享逻辑必须**先抽出**到 `src/cli/lib/orchestration/`（本次新增子目录），api.ts 仅做 lib 调用 + 结果组装
- **依赖方向**：`extensions/` → `api.ts` → `lib/orchestration/*` + `lib/*`；禁止反向上行 import

#### extensions/sdd-extension/index.ts 单文件约束（针对 arch-reviewer P1-4「C7 缺理由」）

单文件聚合的工程理由：

1. **omp loader 限制**：v16.2.x 后支持目录形式（PR #2714），但**单文件 entry** 是所有 omp 版本最稳的契约
2. **统一 arg 解析**：8 个 command 共享一个 `parseArgs(args: string): <Options>` 集中入口（避免每个 handler 重复 split 逻辑）
3. **统一 UI adapter**：8 个 command 共享一个 `notifyBySeverity(result, ctx)` 统一把 ValidateResult 映射到 `ctx.ui.notify/setWidget`
4. **避免 omp extension factory 的副作用分散**：单文件保证所有 `pi.registerCommand` 在同一个 factory 同步注册,避免 omp 分阶段装载时部分 command 不可用

如果未来单文件超过 400 行,可拆为 barrel index.ts + `commands/validate.ts` 等子文件,但需 PR 重新论证拆分的必要性（不是预先拆分）。

#### api-runner.ts 存在性（针对 arch-reviewer P1-5「重建 CLI 入口」）

api-runner.ts 的存在是**有意识的设计权衡**，不是 CLI 入口的回潮：

- **slash command 不能 CI 化**（必须在 omp 会话内）；如果不要 api-runner，CI 场景下用户必须自己写 `bun -e` 一行，违反「开箱即用」
- **api-runner 是「bun -e 模板」而非完整 CLI**：删去 `bin/sdd` wrapper、删去 arg-parser、删去 8 个 command switch；仅保留「接收进程参数 → 路由到 api.ts 函数 → 输出 JSON 到 stdout + exit code」
- **共享边界**：arg 解析复用 `src/cli/lib/parseArgs.ts`（本次新增），formatter 复用 `src/cli/lib/formatResult.ts`（本次新增），与 extension handler 共享

#### package.json 变更（针对 P2「manifest 缺失」）

```json
{
  "name": "sdd-pack",
  "version": "1.4.0-alpha",
  "files": ["skills", "rules", "hooks", "agents", "extensions", "src", "README.md"],
  "omp": {
    "extensions": ["./extensions/sdd-extension/index.ts"]
  }
}
```

关键变化：

- 删除 `"bin": { "sdd": "./bin/sdd" }`
- `files` 删除 `"bin"`、新增 `"extensions"`
- 新增 `"omp"` manifest 字段

### 替代方案（已拒绝）

1. **维持 ADR-008 现状（独立 CLI + alias 路径）** —— 已验证第三方安装体验差，不接受
2. **拆出独立 npm 包 `sdd`** —— 违反 marketplace 形态一致性,且与 plugin 更新节奏解耦
3. **只走 slash command, 不提供 api-runner** —— CI 场景失去开箱即用体验
4. **把 api-runner 当完整 CLI 重建** —— 与 ADR-009 的「去 CLI 化」目标冲突
5. **extensions 拆多文件（barrel index + per-command）** —— 偏离 omp 单文件 entry 最稳契约,可在未来 PR 重新论证

### 实施迁移路径（针对 ADR-008 历史用户）

ADR-008 的 `sdd` bash wrapper + alias 用户在 v1.4 发布时需迁移：

| v1.3（ADR-008）         | v1.4（ADR-009）                                 | 迁移命令           |
| ----------------------- | ----------------------------------------------- | ------------------ |
| `sdd validate`          | `/sdd-validate`（omp 会话内）                   | 改用 slash command |
| `sdd validate --json`   | `bun run src/cli/api-runner.ts validate --json` | 改用 api-runner    |
| `alias sdd='bun ...'`   | 从 `~/.zshrc` / `~/.bashrc` 删除                | 清理环境           |
| `package.json#bin` 字段 | 不再存在                                        | 无需操作           |

迁移指引写入 v1.4.0 CHANGELOG 与 README「Migration from v1.3」。

### 后续

- **v1.4.0-alpha**（T+0）：内部 dogfooding,`omp --extension` 验证 8 个 command 注册
- **v1.4.0-beta**（T+1 周）：hook 切换到 in-process,severity=warn 灰度
- **v1.4.0 正式**（T+2 周）：severity=error,marketplace 发布,ADR-008 完整退役

### 状态更新

无（v1.4.0 发布后回填）

---

## ADR-010: OpenSpec 作为 hook 默认实现 + 可选入口（修订）

**状态**: Revised (2026-07-01, 原始决策 Accepted 2026-06-30)
**决策人**: norman
**触发**: OpenSpec CLI 已能提供跨 agent 的规范生命周期，而纯 prompt / skill 缺乏对研发流程和提交门禁的强约束能力。

### 决策（修订后）

采用 **OpenSpec 作为 hook 默认实现 + 可选入口**：sdd-pack 的运行时层（hook）默认走 OpenSpec runtime gate 实现，但保留 SDD 范式作为 sdd-pack 的正本能力载体。OpenSpec 入口（`/openspec-*` slash command + CI runner）作为可选范式并存,不替代 SDD。

**原始决策（2026-06-30 Accepted，已修订）**：采用 OpenSpec 作为规范生命周期唯一权威入口,并以 `OMP extension + hook + CI gate` 提供运行时约束。

### 启用条件

- 当前目录为 Git 仓库
- 已检测到 OpenSpec 初始化产物，至少包含 `openspec/specs/` 与 `openspec/changes/`
- 用户显式装载 `hooks/openspec/`（默认 hook 实现）；未启用时回到 SDD 范式 hook

### 影响（修订后）

- `plugins/sdd-pack/skills/`、`rules/`、`agents/` 保留为 sdd-pack 核心能力载体（SDD 范式正本）
- `plugins/sdd-pack/src/cli/api.ts` 保留 SDD 范式 8 函数;OpenSpec 能力由独立的 `src/cli/openspec-api.ts` 承载
- `extensions/` 双范式并存：`extensions/sdd-extension/`(8 个 `/sdd-*` 命令) + `extensions/openspec-extension/`(7 个 `/openspec-*` 命令)
- `hooks/` 双范式并存：`hooks/sdd/`(SDD 范式 hook) + `hooks/openspec/`(OpenSpec runtime gate 默认实现)
- 共享 `src/cli/lib/` 核心库与 `orchestration/` 子模块
- OpenSpec 已初始化前不应误拦截，因此需采用 "Git + init 产物" 双条件启用

**已删除的原始影响项**（2026-07-01 修订）：

- ~~现有 `plugins/sdd-pack/skills/`、`rules/`、`agents/` 退役~~ —— 修订后恢复为 sdd-pack 核心能力载体
- ~~`plugins/sdd-pack/src/cli/api.ts` 改为 OpenSpec CLI 封装层~~ —— 修订后保留 SDD 范式 8 函数,OpenSpec 独立命名空间
- ~~`extensions/` 改为 `/openspec-*` slash command 入口~~ —— 修订后双范式并存

### 理由

1. 纯 prompt 只能引导，不能约束
2. OMP hook 是当前仓库里唯一可在工具调用时做实时拦截的运行时层
3. CI gate 是最终裁决层，可防止会话内绕过
4. OpenSpec 已初始化前不应误拦截，因此需采用 "Git + init 产物" 双条件启用

### 修订原因（2026-07-01）

- sdd-pack 是**双范式一体化工具**（SDD 正本 + OpenSpec 可选），见 [ADR-011](#adr-011-sdd-pack-双范式架构决策)
- ADR-010 走过头了，把"hook 默认实现"升格为"规范生命周期唯一权威入口",抹除了 SDD 范式的正本地位
- 修订日期：2026-07-01
- 与 [ADR-009](#adr-009-sdd-extension替代独立-cli) 的"omp extension + slash command"形态兼容：双范式都是 extension 注册

### 修订影响

- `agents/` / `skills/` / `rules/` 恢复为 sdd-pack 核心能力载体（SDD 范式正本）
- 保留 OpenSpec 作为可选 hook 默认实现（`hooks/openspec/`）—— 旧"hook runtime gate"定位有效
- 双范式并存（参见 [ADR-011](#adr-011-sdd-pack-双范式架构决策)）：SDD 范式 + OpenSpec 范式共享 `src/cli/lib/` 与 orchestration 子模块

### 状态更新

- 2026-07-01：修订为"hook 默认实现 + 可选入口",明确 SDD 范式仍为正本；新增 [ADR-011](#adr-011-sdd-pack-双范式架构决策) 描述双范式协同

---

## ADR-011: sdd-pack 双范式架构决策

**状态**: Accepted (2026-07-01)
**决策人**: norman
**触发**: [ADR-010](#adr-010-openspec-作为-hook-默认实现--可选入口修订) 走过头，sdd-pack 不应只支持 OpenSpec

### 背景

sdd-pack v1.1.0 起以 SDD 范式（`sdd-core`/`sdd-input`/`sdd-prd`/`sdd-phase` 4 skills + `lore-protocol`/`docs-update-guard`/`lore-commit-guard`/`sdd-doc-edit-guard`/`prd-change-management` 5 rules + `reviewer`/`arch-reviewer`/`sdd-reviewer` 3 agents + `lore commit` 提交协议）作为文档生命周期的正本能力载体。v1.4.0-alpha 引入 OpenSpec 范式作为 hook runtime gate 的可选实现，并在 2026-06-30 的 [ADR-010](#adr-010-openspec-作为-hook-默认实现--可选入口修订)（原始版本）中被升格为"规范生命周期唯一权威入口"，导致 SDD 范式正本地位被抹除。

v1.5.0-alpha 起对这一走过头进行纠偏：明确 sdd-pack 是 **SDD 范式 + OpenSpec 范式并存**的双范式一体化工具，SDD 为正本，OpenSpec 为可选 hook 默认实现 + 可选命令入口。

### 决策

**sdd-pack 是双范式一体化工具**：

- **SDD 范式为正本**：
  - 4 skills：`sdd-core` / `sdd-input` / `sdd-prd` / `sdd-phase`
  - 5 rules：`lore-protocol` / `docs-update-guard` / `lore-commit-guard` / `sdd-doc-edit-guard` / `prd-change-management`
  - 3 agents：`reviewer` / `arch-reviewer` / `sdd-reviewer`（三层守门）
  - 8 个 `/sdd-*` slash command：`/sdd-validate` / `/sdd-propose` / `/sdd-archive` / `/sdd-migrate` / `/sdd-status` / `/sdd-list` / `/sdd-why` / `/sdd-apply`
  - `plugins/sdd-pack/src/cli/api.ts` 暴露 8 个程序化函数：`validateDocs` / `proposePrd` / `archivePrd` / `migratePrd` / `getStatus` / `listPrds` / `getWhy` / `getApplyChecklist`
  - `plugins/sdd-pack/extensions/sdd-extension/index.ts` 注册 8 个 slash command

- **OpenSpec 范式为 hook 默认实现 + 可选入口**：
  - `plugins/sdd-pack/hooks/openspec/index.ts`：OpenSpec runtime gate hook（默认 hook 实现）
  - 7 个 `/openspec-*` slash command：`/openspec-init-check` / `/openspec-status` / `/openspec-validate` / `/openspec-list` / `/openspec-show` / `/openspec-instructions` / `/openspec-archive`
  - `plugins/sdd-pack/src/cli/openspec-api.ts` 暴露 7 个程序化函数
  - `plugins/sdd-pack/extensions/openspec-extension/index.ts` 注册 7 个 slash command

- **共享层**：
  - `plugins/sdd-pack/src/cli/lib/` 核心库：prd-state-machine / doc-parser / validator / template-engine / index-sync / lore-wrapper / api-types
  - `plugins/sdd-pack/src/cli/lib/orchestration/` 子模块：parseArgs / format / path / gates / scan / git / archive-ops / openspec-cli / openspec-project

### 方案

详见 plan v2 §2 目标架构（双范式模块拓扑、共享边界、装载选择、CI 双 runner）。

#### 双范式装载选择

```bash
# SDD 范式(默认推荐)：SDD hook + SDD extension
omp --hook <plugin-root>/hooks/sdd/index.ts \
    --extension <plugin-root>/extensions/sdd-extension/index.ts

# OpenSpec 范式(可选):OpenSpec hook + OpenSpec extension
omp --hook <plugin-root>/hooks/openspec/index.ts \
    --extension <plugin-root>/extensions/openspec-extension/index.ts

# 混合装载（实验性）：SDD extension + OpenSpec hook
omp --hook <plugin-root>/hooks/openspec/index.ts \
    --extension <plugin-root>/extensions/sdd-extension/index.ts
```

#### 共享边界

- `src/cli/lib/` 与 `src/cli/lib/orchestration/` 为**双范式共用**；SDD 范式与 OpenSpec 范式都可 import
- `src/cli/api.ts`（SDD）与 `src/cli/openspec-api.ts`（OpenSpec）**互不依赖**；同一份 `api-types.ts` 定义跨范式类型契约
- `extensions/sdd-extension/index.ts` 与 `extensions/openspec-extension/index.ts` **独立注册**，无交叉 import
- `hooks/sdd/index.ts` 与 `hooks/openspec/index.ts` **独立装载**,用户显式选择

#### 提交协议

- `lore commit` 协议（`lore-protocol` rule + `lore-commit-guard` hook）由 SDD 范式承载
- OpenSpec 范式 hook 复用 `lore-commit-guard` 的硬拦截能力（`block: true`）,不重新实现

### 替代方案（已拒绝）

1. **完全切 OpenSpec**（[ADR-010](#adr-010-openspec-作为-hook-默认实现--可选入口修订) 走过头版本）
   - 把 SDD 范式全部退役,只留 OpenSpec
   - **拒绝原因**: 抹除 sdd-pack 4 skills / 5 rules / 3 agents 的核心能力载体；用户已投入 SDD 工作流的迁移成本不可接受
2. **完全切回 SDD**（保留 v1.4 之前的纯 SDD 形态）
   - 删去 OpenSpec 范式入口,保留 SDD 范式
   - **拒绝原因**: 用户明确表示 OpenSpec hook 是合理实现——`pi.on("tool_call", ...)` 拦截能力是 omp rule 体系做不到的（rule 仅控制 steering 队列,不拦截工具调用,见 [ADR-006](#adr-006-hook-extension-替代-static-rulescli-flag-装载) 状态更新）

### 实施迁移路径

- **v1.5.0-alpha**（T+0）：内部 dogfooding
  - `src/cli/api.ts` 恢复 SDD 范式 8 函数
  - `src/cli/openspec-api.ts` 新增,OpenSpec 范式 7 函数
  - `extensions/sdd-extension/` + `extensions/openspec-extension/` 双目录
  - `hooks/sdd/` + `hooks/openspec/` 双目录
  - `package.json#omp.extensions` 数组含两个 entry
- **v1.5.0-beta**（T+1 周）：用户双范式 dogfooding
- **v1.5.0 正式**（T+2 周）：marketplace 发布,CHANGELOG 标注 [ADR-010](#adr-010-openspec-作为-hook-默认实现--可选入口修订) 修订 + [ADR-011](#adr-011-sdd-pack-双范式架构决策) 新增

### 后续

- **v1.5.0-beta**：用户双范式 dogfooding 收集反馈,决定 v1.6 是否引入"范式自动探测"（按仓库 `openspec/` 存在性自动选 hook）
- **v1.5.0 正式**：marketplace 发布,CHANGELOG 标注 [ADR-010](#adr-010-openspec-作为-hook-默认实现--可选入口修订) 修订 + [ADR-011](#adr-011-sdd-pack-双范式架构决策) 新增
- **跟踪**:`sdd-pack` 双范式装载是否在 omp 生态有更优形态（如 omp manifest 支持"必选 hook + 可选 extension"声明）
- **维护边界**:任一范式 bugfix 不影响另一范式；`src/cli/lib/` 跨范式共享代码变更需经 arch-reviewer 评审
