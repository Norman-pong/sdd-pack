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
- commit gate 由 `/sdd-gate-review` slash command 检查 `.sdd/review/staged.reviewer.json` 产物（reviewer agent step 8 写入），`/sdd-gate-commit` 调 lore commit 完成提交
- arch/sdd-reviewer 由用户手动 `task(agent="arch-reviewer")` / `task(agent="sdd-reviewer")` 触发，或通过 gate.json `reviewers` 字段纳入 gate 流水线

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

**状态**: Superseded by [ADR-018](#adr-018-强状态流转--metajson-事实源) (2026-07-16,v1.8.0)
**决策人**: norman

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

**状态**: Superseded by [ADR-018](#adr-018-强状态流转--metajson-事实源) (2026-07-16,v1.8.0)
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

## ADR-012: sdd-gate 门禁流水线（slash command 替代独立 CLI）

**状态**: Accepted(2026-07-13)
**决策人**: norman
**触发**: 用户要求把门禁做成 CLI 标准化检测，不任由 LLM 自我约束；lint 命令动态注入，不指定则阻塞流程
**影响**: 新增 `src/cli/lib/gate-config.ts` + `gate-runner.ts` + 5 个 `/sdd-gate-*` slash command；reviewer agent 新增 step 8 写 review 产物；hooks/sdd commit 拦截改为引导走流水线

### 背景

sdd-pack 原有门禁依赖三层防线（rule 文本 / omp hook sendMessage / api-runner CI），但在 omp session 内（LLM 编码场景）没有进程级阻断。omp hook 只能发 message，LLM 可无视消息直接提交。

用户定义了完整流程：`编码 → lint → 功能验证 → reviewer → lint（再跑）→ lore commit`，要求：
1. lint 全周期触发
2. lint 命令动态注入，不指定则阻塞
3. 第三方安装后零额外安装

### 决策

**采用 omp slash command 作为执行入口，而非独立 CLI（`bun run gate-runner.ts`）。**

原因：独立 CLI 的路径（`plugins/sdd-pack/src/cli/gate-runner.ts`）在第三方用户项目里不存在——插件代码在 `~/.omp/plugins/node_modules/sdd-pack/` 下。slash command 通过 omp extension 机制在进程内直接 import lib 函数，`process.cwd()` 自动解析为用户项目根。

### 方案

1. **5 阶段 slash command**：`/sdd-gate-lint` → `/sdd-gate-test` → spawn reviewer → `/sdd-gate-review` → `/sdd-gate-precommit` → `/sdd-gate-commit`
2. **动态 lint 注入**：`.sdd/gate.json` 显式配置 > 项目类型自动检测（vite-plus / rust / go / bun）> 阻塞（exit 2）
3. **review 产物契约**：reviewer agent 执行后写 `.sdd/review/staged.json`，`/sdd-gate-review` 检查产物存在且 verdict 通过
4. **hook 引导**：`hooks/sdd/index.ts` 拦截 `git/lore commit`，发消息引导走 `/sdd-gate-*` 流水线

### 拒绝的方案

- **独立 CLI 入口（`gate-runner.ts`）**: 第三方用户项目里无此路径，仅在 sdd-pack 自家仓库有效。已删除。
- **git pre-commit hook**: 需要 git hooks 已启用，且 omp session 内的提交不经过 git hooks（omp 内部处理）。用户选择 omp hook + CI 入口。
- **CLI 直接 spawn reviewer agent**: omp agent spawn 需要 omp session 上下文，CLI 无法提供。改用文件契约。

### 后续

- 详见 `docs/architecture/sdd-gate.md`
- tsconfig.json + @types/node + @types/bun 在本次引入（之前项目无类型检查）


## ADR-013: sdd-pack omp 5 类资产分工契约

**状态**: Accepted (2026-07-14, v1.5.1)
**决策人**: norman
**触发**: 用户审查 sdd-pack 定位时反馈"sdd-pack 在 skill/rule/agent/extension/hook 五类 omp 资产之间分工不清，README 把所有资产塞进一行 changelog 堆叠、没有权威清单"。需要把每类资产的"在哪、做什么、谁触发"一次性固化。
**影响**: `.omp-plugin/marketplace.json` 新增 `assets` 字段（全部 5 类）；`plugins/sdd-pack/README.md` 头部新增 §0/§0.1/§0.2/§0.3 段；后续添加新资产时按本契约选择最适合的 omp 资产类型，不再"全塞 extension"。

### 背景

sdd-pack 作为 omp marketplace plugin，同时使用了 omp 全部 5 类资产（skill/rule/agent/extension/hook），但仓库文档未对每类资产的职责边界做权威说明，导致：
1. 新贡献者难以判断"新增能力应该走 skills 还是 rules 还是 extension"。
2. 用户误以为"5 个 rule 是硬门禁"（实际全部为 TTSR 软门禁）。
3. README 第一行用 changelog 堆叠充当定位介绍，信息密度过低。

此外 omp marketplace 索引（`.omp-plugin/marketplace.json`）只声明了 agents 字段，缺失 skills/rules/commands/hooks 声明，导致 catalog 信息不全。

### 决策

**5 类 omp 资产各司其职，互不替代**：

| omp 资产 | 落地目录 | 提供方 | 消费方 | 触发点 |
| --- | --- | --- | --- | --- |
| Skills | `plugins/sdd-pack/skills/` | sdd-pack | 主 agent（看到 description 自主 read SKILL.md） | description 触发 |
| Rules | `plugins/sdd-pack/rules/` | sdd-pack | omp 规则管线 → hook 注入 system 提示 → 主 agent 自觉遵守 | `condition` + `scope` 前缀匹配 |
| Agents | `plugins/sdd-pack/agents/` | sdd-pack | 主 agent 通过 `task()` 手动 spawn | 手动或 `/sdd-gate-review` 派生 |
| Extensions | `plugins/sdd-pack/extensions/` | sdd-pack | omp slash command，主 agent 在 session 内调用 | `omp --extension` 装载 |
| Hooks | `plugins/sdd-pack/hooks/` | sdd-pack | omp tool_call 拦截器 | `omp --hook <path>` 装载 |

### 方案

1. **.omp-plugin/marketplace.json assets 字段**：列出全部 skills / rules / agents / commands（20 个 /sdd-* 与 /openspec-*）+ hooks（2 个）路径。元数据列表式，供 omp catalog 展示。
2. **README §0 重写**：把第一行的 changelog 堆叠替换为标准 omp 插件 README 结构——§0 插件定位 / §0.1 组件矩阵 / §0.2 三层守门 agent / §0.3 软门禁 vs 硬门禁对照。
3. **后续添加新能力的判断流程**：
   - 需要 LLM 主动加载的流程知识 → 新 skill
   - 需要在特定 tool_call 路径上注入提示 → 新 rule
   - 需要独立子线程跑多步审查 → 新 agent
   - 需要用户在 omp session 里手动触发特定流程 → 新 slash command（新增到对应 extension）
   - 需要在 tool_call 前后拦截执行 → 新 hook

### 拒绝的方案

- **README 沿用 changelog 风格继续堆叠**：信息密度低，新贡献者入门成本高。改为标准结构化 README。
- **把所有能力都加到 extension 当 slash command**：违反 omp 设计意图——slash command 是 LLM 主动调用的入口，不是被动触发的机制。TTSR 提示应该走 rule，程序级阻断应该走 slash + runner。
- **为 sdd-pack 建 `plugins/sdd-pack/plugin.json`**：omp 用 `.omp-plugin/marketplace.json` 做 catalog，插件根走目录约定（agents/skills/rules/extensions/hooks）发现，plugin 级 manifest 与 omp loader 冲突。

### 后续

- v1.6.0 起，新增 skill/rule/agent 必须先在本 ADR 的判断流程中归类后才允许提交。
- ADR-014 锁定"三层守门 agent 触发契约"（与本 ADR 互补，本 ADR 解决"什么资产类型"，014 解决"agent 何时触发"）。

## ADR-014: 三层守门 agent 触发契约（sdd-reviewer 按需触发，非 commit gate）

**状态**: Accepted (2026-07-14, v1.5.1)
**决策人**: norman
**触发**: 用户反馈"sdd-pack 在提交时没有触发 sdd-reviewer agent"。排查发现：sdd-reviewer 在自己 frontmatter 里自我标注 `Spawned on demand, not bound to commit gate`，且 `gate-runner.ts` 的 `loadRequiredReviewers` 默认只返回 `["reviewer"]`——这并非 bug，但是设计契约未在 ADR 显式固化，新用户难以判断何时触发哪个 agent。
**影响**: 本 ADR 固化三层守门 agent 的触发边界。后续添加新 reviewer 时，按本契约决定是否绑定 commit gate；若绑定则需在 `.sdd/gate.json` 的 `reviewers` 字段显式声明。

### 背景

sdd-pack 当前有 3 个守门 agent，定位清晰但分散在多文件未集中归档：

| Agent | 文件 | frontmatter self-positioning | 是否默认启用 |
| --- | --- | --- | --- |
| `reviewer` | `plugins/sdd-pack/agents/reviewer.md` | Layer 1 commit gate | 是（默认） |
| `arch-reviewer` | `plugins/sdd-pack/agents/arch-reviewer.md` | Layer 2 PR/plan gate | 否 |
| `sdd-reviewer` | `plugins/sdd-pack/agents/sdd-reviewer.md` | `Spawned on demand, not bound to commit gate` | 否 |

且门禁检查点由两层控制：
1. **`extensions/sdd-extension/index.ts:340-373` 的 slash command 注册表**——只有 `/sdd-gate-review` 一个审查门禁阶段。
2. **`src/cli/lib/gate-runner.ts:390-400` 的 `loadRequiredReviewers()`**——默认 `["reviewer"]`，通过读取 `<项目根>/.sdd/gate.json` 的 `reviewers` 字段可扩展为 `["reviewer", "arch-reviewer", "sdd-reviewer"]`，但需每个 reviewer 都有 `.sdd/review/<sha>.<name>.json` 产物落盘才不 block。

用户"提交时不触发 sdd-reviewer"的反馈根因：这两个机制叠加导致 sdd-reviewer 默认既不在 slash 流水线被 spawn，也不在 gate-runner 被检查。需要把契约固化。

### 决策

**三层守门 agent 分工如下，sdd-reviewer 不是 commit gate**：

| 层 | Agent | 触发 | blocking | 触发场景 | 启用条件 |
| --- | --- | --- | --- | --- | --- |
| Layer 1 commit gate | `reviewer` | `/sdd-gate-review` 阶段 3 spawn | 是 | 每次 commit | 默认启用 |
| Layer 2 PR/plan gate | `arch-reviewer` | 手动 `task()` spawn | 否 | PR / 架构决策前 | `.sdd/gate.json` 配 `"reviewers": ["reviewer", "arch-reviewer"]` |
| Layer 3 merge/phase gate | `sdd-reviewer` | 手动 `task()` spawn | 否 | phase 收尾 / merge 前 | `.sdd/gate.json` 配 `"reviewers": ["reviewer", "sdd-reviewer"]` |

`/sdd-gate-review` 的运行时行为：
- `loadRequiredReviewers()` 返回列表
- 对列表中每个 reviewer，检查 `.sdd/review/<sha>.<reviewer>.json` 产物存在 + staged_hash 匹配 + verdict 不在 {incorrect, incorrect_with_minor_defects}（ADR-020 起两者都判 fail）
- 任一缺失或过期 → `status: "block"`（`exitCode: 2`）

### 方案

1. **保留默认不变**：`loadRequiredReviewers` 仍默认 `["reviewer"]`，不引入 sdd-reviewer 强制 check。这样大多数用户（只跑 commit gate）不会被 phase gate 拖累。
2. **README §0.2 显式标注三层分工**：在 sdd-pack README 新加一节说明每个 agent 的触发场景、启用条件、产物路径。
3. **市场索引同步**：`.omp-plugin/marketplace.json` 的 `assets.agents` 列名 + `reviewer_layers` 字段明示三层关系。
4. **添加触发入口（可选 P3 任务）**：为 sdd-reviewer / arch-reviewer 各加一个 `/sdd-gate-sdd-review` 与 `/sdd-gate-arch-review` slash command，使 layer 2/3 不必依赖手动 `task()`，但不在本 ADR 范围内实施。

### 拒绝的方案

- **直接把 sdd-reviewer 提升为 commit gate**：每次 commit 都要跑 PRD 验收开关 / Phase 覆盖 / ADR compliance / docs-sync 7 项检查，违背 sdd-reviewer 定位为 phase-completion / merge gate 的初衷。前端开发每 commit 一次的频次下成本过高。
- **改 `loadRequiredReviewers` 默认值为 `["reviewer", "sdd-reviewer"]`**：直接让所有未配置 `reviewers` 字段的用户突然被 block，因为他们的项目里没有 `.sdd/review/<sha>.sdd-reviewer.json` 产物。
- **依赖 omp rulebook 的 `permissionDecision: deny` 把 sdd-reviewer 强制绑入**：当前 omp rulebook 是否有此机制尚未在本仓库确认；且即使有，把按需 agent 转硬门禁与 LLM agent 工作流所需的"提示 → 自决"循环相悖。

### 后续

- 后续若用户要求"每次 commit 自动 spawn sdd-reviewer"，需要单独 ADR 决策（可能引入 on-demand spawn + 异步产物落盘机制，不复用本次 gate-runner 文件契约的同步模式）。
- ADR-013 规定"什么资产类型用什么 omp 资产"（本 ADR 互补，013 解决"资产类型"，014 解决"agent 触发"）。

---

## ADR-015: hook 逻辑合并进 extension module + 主装载方式改走 omp plugin link

**状态**: Accepted (2026-07-15)
**决策人**: norman
**触发**: 用户反馈 sdd-pack 装完后 hook/rule/extension 全不生效。根因：marketplace install 路径下 omp 不装载 extension module，且 omp-plugins provider 过滤 marketplace cache 路径的 rules/。
**影响**: hooks/sdd/index.ts + hooks/openspec/index.ts 删除,tool_call 拦截逻辑合并进 extensions/sdd-extension/index.ts + extensions/openspec-extension/index.ts。README §1 改推 omp plugin link 为主装载方式。

### 背景

sdd-pack v1.5.2 通过 omp plugin install（marketplace install）安装后实测:
- omp ttsr list 27 条无 sdd-pack rule（5 个 TTSR rule 0 条装载）
- git commit 2 次都通过（hook 不生效）
- log 无 sdd-pack extension 装载记录（/sdd-gate-* 8 个 slash command 不可用）

根因: omp 官方文档明确"Marketplace cache installs do not feed extension modules - they surface skills/commands/hooks/tools/MCP only"。omp-plugins provider 的 listOmpExtensionRoots 把 marketplace install 路径过滤掉(L196-208 filter),claude-plugins provider 只扫 commands/ + agents/ + skills/ + hooks/(pre/post shell),不扫 rules/ 和 TS extension module。

### 决策

1. hook 拦截逻辑合并进 extension module: hooks/sdd/index.ts 的 pi.on("tool_call",...) 搬进 extensions/sdd-extension/index.ts,与 pi.registerCommand 共存于同一 ExtensionAPI factory。OpenSpec 同理。
2. 主装载方式改走 omp plugin link: link 装到 ~/.omp/plugins/node_modules/ 后:
   - extension module 通过 package.json#omp.extensions 装载(pi.registerCommand + pi.on 全部生效)
   - omp-plugins provider 扫到 plugin 根的 rules/ + skills/ + commands/(自动发现)
3. tool_call 拦截升级为 {block: true, reason} 硬拦截: git commit 无条件 block; lore commit 非 amend 走 runReview 检查; lore commit --amend 放行。

### 拒绝的方案

- 改 hook 形态为 hooks/pre/X.sh（shell script）: sdd-pack 的 commit 校验逻辑(runReview / runSddValidate)复杂,shell 实现成本高且无法 in-process 调 TS lib。
- 保留 hooks/sdd/index.ts 独立文件 + 用户加 --hook flag: 依赖用户手动配置,违反"harness 化"目标。
- 改发布流程为 npm publish: breaking change,需要重大版本号。

### 后续

- agents/ 目录不被 omp-plugins provider 自动发现:用户需手动 `omp agents unpack` 或 cp 到 ~/.omp/agent/agents/。README §1 说明。
- marketplace install 路径仍保留兼容(用户可用 omp plugin install sdd-pack@sdd-pack),但仅 skills 生效,hook/rule/extension 不生效。README §1 明确标注此限制。

## ADR-016: PRD 状态机重构（6 状态 + 已归档终态 + ArchiveReason 子态）

**状态**: Accepted (2026-07-16)
**决策人**: norman
**触发**: 5 个历史 PRD 并发维护（SDD Pack / sdd CLI / sdd Extension / OpenSpec / 双范式）造成 validate 频繁报错与状态机语义不清：草稿/评审中重叠、已发布/已替换/已归档/已废弃 4 个终态语义重叠。整合为单总 PRD（`docs/prd/2026-07-16-sdd-pack.md`）需要明确的状态机支持。
**影响**: `plugins/sdd-pack/src/cli/lib/prd-state-machine.ts` 重构为 6 状态 + ArchiveReason；`validator` 接受列表更新；5 个历史 PRD 全部归档（移入 `docs/prd/archive/`），由 v1.7 总览 PRD 替代。

### 背景

v1.6 及之前的 PRD 状态机为 7 状态：

- 草稿 / 评审中 / 已评审 / 已发布 / 已替换 / 已归档 / 已废弃

实战暴露三类问题：

1. **草稿 vs 评审中 语义重叠**：用户无法区分"概念先行的自由态"与"已沟通后待评审的较正式态"
2. **4 个终态语义混乱**：已发布/已替换/已归档/已废弃 各自含义不清，实际运维中混用
3. **缺计划/执行阶段**：项目从"已评审"直接跳到"已发布"，无法表达"任务已拆解到 phase/"和"phase 正在执行"两个独立阶段

### 决策

6 状态 + 1 终态 + 2 ArchiveReason 模型：

| PrdStatus | 中文标签 | 终态？ | 说明 |
|-----------|---------|--------|------|
| Draft | 草稿 | 否 | 概念先行，无任何约束，可自由修改 |
| PendingReview | 待评审 | 否 | 经过多轮沟通，格式/规范已正式，可灵活回退草稿 |
| Reviewed | 已评审 | 否 | 评审通过，等待任务规划 |
| Planned | 已规划任务 | 否 | 任务已拆解到 `phase/`，待开始执行 |
| InProgress | 进行中 | 否 | phase 任务正在执行 |
| Archived | 已归档 | **是** | 唯一终态，文件已移入 `archive/` 目录。归档原因见 ArchiveReason |

| ArchiveReason | 中文标签 | 说明 |
|---------------|---------|------|
| Completed | 已完成 | 项目完成，所有 phase 全部通过 |
| Abandoned | 已中止 | 项目中止，不再继续推进 |

迁移规则（核心）：

- 草稿 ↔ 待评审（双向灵活切换）
- 待评审 → 已评审 / 草稿（打回继续改）/ 已归档
- 已评审 → 已规划任务 / 已归档（不可回退草稿）
- 已规划任务 → 进行中 / 已归档
- 进行中 → 已归档（带 ArchiveReason：已完成 或 已中止）
- 已归档 → 任何状态都禁止（终态）

### 关键变化

1. **草稿/待评审 拆分**：用语义区分"自由修改"与"较正式"，灵活度保留但语义清晰
2. **已替换/已废弃/已发布 删除**：合并入 已归档 终态，通过 ArchiveReason 子属性区分归档原因
3. **已规划任务/进行中 新增**：明确表达"任务拆解完成"与"执行中"两个独立阶段
4. **已完成/已中止 不再作为独立 PrdStatus**：作为 ArchiveReason 子态嵌入 已归档
5. **已归档 唯一终态**：4 个终态收敛为 1 个 + 2 个子原因，简化心智模型

### 拒绝的方案

- **保留 7 状态 + 文档化区分草稿/评审中**：治标不治本，状态机层面语义依然模糊。
- **8 状态（Completed/Abandoned 作为独立状态 + Archived 终态）**：增加冗余 — Archived 与 Completed/Abandoned 含义重叠（"已完成/已中止 等归档"），不如用 ArchiveReason 子属性表达。
- **6 状态（删 草稿/待评审 二选一）**：用户明确要求两个并存（草稿 = 无约束概念先行，待评审 = 多轮沟通后正式），不可合并。

### 后续

- 5 个历史 PRD 全部归档（`docs/prd/archive/`），由 `docs/prd/2026-07-16-sdd-pack.md` v1.7 总览 PRD 整合替代
- `validator.validPrdStatuses` 列表更新为 6 状态（草稿/待评审/已评审/已规划任务/进行中/已归档）
- 后续 v1.8+ 新需求在 `2026-07-16-sdd-pack.md` 上做 supersedes 链或 delta merge

## ADR-017: Phase 状态机 + 文档类型门禁分层

**状态**: Accepted (2026-07-16)
**决策人**: norman
**触发**: ADR-016 完成 PRD 状态机重构后，用户提出"phase/architecture/reference 是否也需要 CLI 更新和门禁机制？"的扩展需求。
**影响**: 新增 PhaseStatus enum + 迁移表；新增 `sdd archive-phase` CLI 命令；validator 补 phase 状态机校验；architecture/reference 维持无状态（不加状态机）。

### 背景

ADR-016 只重构了 PRD 状态机。docs/ 下还有 3 类文档：

1. **Phase**（`docs/phase/`）：已有 validator 规则（`validPhaseStatuses = ["未开始","进行中","已完成","已废弃"]`），但无独立状态机 enum、无 CLI 归档命令、无迁移规则
2. **Architecture**（`docs/architecture/`）：无状态、无 validator、无 CLI — 本质是参考材料
3. **Reference**（`docs/reference/`）：无状态、无 validator、无 CLI — 本质是参考材料

### 决策

**分层门禁策略**：

| 文档类型 | 状态机 | CLI 归档 | validator | hook 守卫 |
----------|--------|---------|-----------|---------|
| PRD | PrdStatus (6 + ArchiveReason) | `sdd archive` | ✓ | ✓ |
| Phase | PhaseStatus (4) | `sdd archive-phase` | ✓ | ✓ |
| Architecture | 无 | 无 | 结构校验 only | 写入提示 |
| Reference | 无 | 无 | 结构校验 only | 写入提示 |

**Phase 状态机（PhaseStatus）**：

| PhaseStatus | 中文 | 终态？ | 说明 |
|-------------|------|--------|------|
| NotStarted | 未开始 | 否 | 任务待执行 |
| InProgress | 进行中 | 否 | 任务正在执行 |
| Completed | 已完成 | 是 | 所有任务验收通过 |
| Abandoned | 已废弃 | 是 | 任务废弃不再执行 |

迁移规则：

- 未开始 → 进行中 / 已废弃
- 进行中 → 已完成 / 已废弃
- 已完成 → 终态（无出边）
- 已废弃 → 终态（无出边）

**Architecture / Reference 不加状态机**：

- 它们是参考材料，生命周期由 ADR 链（architecture）和人工维护（reference）管理
- 加状态机会增加维护负担而无实际收益（没有人会"归档"一个 reference 文档）
- hook 只做写入提示（检测到写 architecture/ 或 reference/ 时提示走 sdd-core 流程），不做状态机校验

### 拒绝的方案

- **全文档类型加状态机**：architecture/reference 是参考材料，状态机是过度工程
- **Phase 不加状态机，只加 CLI 归档**：validator 已有 phase 状态列表但无迁移规则，半成品状态，不如补全
- **Phase 复用 PrdStatus**：Phase 和 PRD 生命周期不同（Phase 无"草稿/待评审"阶段），不应复用

### 后续

- `prd-state-machine.ts` 新增 PhaseStatus enum + PHASE_TRANSITION_MATRIX
- `api.ts` 新增 `archivePhase()` 函数
- `validator.ts` 的 `validPhaseStatuses` 改为引用 PhaseStatus enum
- `sdd-extension/index.ts` 新增 `sdd-archive-phase` slash command

## ADR-018: 强状态流转 + meta.json 事实源

**状态**: Accepted (2026-07-16)
**决策人**: norman
**触发**: v1.6 / v1.7 在 omp session 内通过 LLM 自觉遵守 + 软提示维护文档状态,但实践中暴露:markdown 状态行可被任意 edit 篡改、状态机解析依赖 markdown 脆弱的多格式混排、PRD 前 4 个状态(草稿→待评审→已评审→已规划任务)完全没有命令覆盖、PRD↔Phase 关联松散。
**影响**: 替代 v1.7 `docs/prd/2026-07-16-sdd-pack.md` 的「软门禁 + 状态行解析」路径;新建 `plugins/sdd-pack/src/cli/lib/meta-store.ts`(状态唯一事实源);`api.ts` 新增 4(Phase 001:init/review/approve/back)+ 5(Phase 002:plan/start/archive + phaseTransition + getStatusPanel)+ 2(Phase 003:sync + rebuildMeta)共 11 个强状态流转函数,辅助命令 list/why/apply/gate/validate 复用现有 api;`sdd-extension` 改用 `/sdd <subcommand>` 主命令 + 子命令路由;Phase 按 PRD ID 分组目录(`docs/phase/<prd-id>/`);OpenSpec 双范式移除;`session_start` 注入 `/sdd` 命令清单(F14)。

### 背景

v1.6/v1.7 暴露三类根因:

1. **状态行解析脆弱**: `doc-parser.ts` 同时处理单行格式与堆叠格式,validator `checkStateMachine` 注释明确写「堆叠行跳过状态检查」(validator.ts §5);`/sdd-migrate` 命令的存在本身就是格式混乱的补救。
2. **状态可被任意篡改**: LLM 或人可 edit `> 状态:` 行把「已归档」改回「草稿」,validator 不拦截(只校验字符串合法性,不校验迁移合法性)。
3. **PRD 前 4 状态无命令覆盖**: 14 个 `/sdd-*` 命令只覆盖 CRUD / 查询 / 门禁,`草稿→待评审→已评审→已规划任务→进行中→已归档` 这条链没有命令强制流转,`/sdd-propose` 创建时直接写死「进行中」,跳过前 4 态。

附带的 PRD↔Phase 关联问题:conventions.md §2.2 要求「Phase 与 PRD 一一对应」,但 PRD 拆多份 Phase 是常见需求;命名规范靠日期前缀匹配,无程序级关联校验;supersedes / 引用链靠 markdown 链接易断裂。

### 决策

7 条核心决策作为 Accepted 落地,后续 v1.9 不再回退:

1. **meta.json 为状态唯一事实源**,markdown 状态行降级为展示层,由 meta.json 单向生成。`/sdd <transition>` 命令写 meta.json 后再调 `generateStatusLine(meta)` 覆盖 markdown 状态行。
2. **全局单例 PRD**:`docs/prd/` 同时只 1 份非归档 PRD;`/sdd init` 在有活跃 PRD 时 block,`/sdd init --force` 仅覆盖空草稿(`status === Draft && transitions.length === 0`)。
3. **`/sdd <subcommand>` 主命令体系**替代 14 个分散的 `/sdd-*` slash command。extension 注册 1 个 `/sdd` 主命令 + 子命令路由(18 个子命令);旧 14 个 deprecated alias 已于 v1.8.0 移除(clean cutover,原计划 v1.10.0 删除,提前执行)。
4. **tool_call 硬拦截状态行**: extension `pi.on("tool_call")` 检测 `write` / `edit` 指向 `docs/prd/**` 或 `docs/phase/**` 内 `> 状态:` 行 → `return { block: true, reason: "/sdd <transition> 命令强制流转" }`。`docs/index.md` 不在拦截范围。分层精确检测:write 工具 `content` 含 `^>\s*状态[：:]` 行 → block;edit 工具 `body` 行匹配 `^>\s*状态[：:]` 前缀 → block,正文「状态」一词放行。
5. **meta.json 不进 git**: `.sdd/meta/` 加入 `.gitignore`(本地缓存);clone 后 `/sdd sync` 从 markdown 重建 meta.json(`rebuildMetaFromMarkdown`:`docs/prd/` 下唯一非归档 .md = active PRD;0 份 → null;>1 份 → block)。
6. **Phase 按 PRD ID 分组目录**: `docs/phase/<prd-id>/<seq>-<name>.md`(吸收 OpenSpec `changes/` 目录内聚的精华);`prd-meta.phaseIds[]` 维护 1:N 关联;Phase ID 嵌入 PRD seq 防全局碰撞(`phs-<prdSeq>-NNN`,如 `phs-001-002` ≠ `phs-002-002`)。
7. **移除 OpenSpec 双范式**(吸收 3 个精华到 SDD):
   - **吸收精华 1**: Phase 分组目录(`docs/phase/<prd-id>/`)— OpenSpec `changes/<change-id>/` 的目录内聚设计。
   - **吸收精华 2**: 跨文件命名空间隔离(PRD ID 作命名空间)— OpenSpec `specs/<capability>/spec.md` 的分层。
   - **吸收精华 3**: 跨 Phase 引用强制(`> 对应阶段:` 链)— OpenSpec `tasks.md` 的引用契约。
   - **删除**:`plugins/sdd-pack/extensions/openspec-extension/` 整个目录、`src/cli/openspec-api.ts` + test、`src/cli/openspec-api-runner.ts`、`src/cli/lib/orchestration/openspec-cli.ts` / `openspec-project.ts`、`.omp-plugin/marketplace.json` 中 OpenSpec 命令声明、extension `session_start` OpenSpec reminder。
   - **ADR-010 / ADR-011 标记 Superseded**(被 v1.8 单范式吸收;OpenSpec 不再作为 sdd-pack 选项分发)。

### 方案

#### 模块拓扑(Phase 001 落地)

```
plugins/sdd-pack/
├── src/cli/
│   ├── api.ts                       # 11 个强状态流转函数(init/review/approve/back/plan/start/archive/phase/sync/status/list/why/apply/gate/validate)
│   └── lib/
│       ├── meta-store.ts            # 新增：9 个函数 + 3 个类型(PrdMeta/PhaseMeta/MetaIndex)
│       ├── doc-parser.ts            # 新增：generatePrdStatusLine / generatePhaseStatusLine
│       ├── prd-state-machine.ts     # 既有(ADR-016/017)
│       └── validator.ts             # 既有(checkStateMachine 读 meta.json,F13)
└── extensions/
    └── sdd-extension/
        └── index.ts                 # /sdd 主命令 + 11 个子命令 handler;tool_call 硬拦截状态行
```

#### meta.json schema(PRD §2.2.3 / §2.2.5)

```typescript
interface PrdMeta {
  id: string;              // prd-YYYYMMDD-NNN
  title: string;
  status: PrdStatus;       // 6 状态
  archiveReason?: ArchiveReason; // 仅 status===Archived
  transitions: { from: PrdStatus | null; to: PrdStatus; at: string; by: string }[];
  phaseIds: string[];      // 1:N 关联
  nextPhaseSeq: number;    // 自增 Phase 序号
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
  filePath: string;        // docs/prd/<id>.md 相对路径
  version: string;         // v1.8.0
}

interface PhaseMeta {
  id: string;              // phs-<prdSeq>-NNN
  parentId: string;        // PRD id
  title: string;
  status: PhaseStatus;     // 4 状态
  seq: number;             // 在 PRD 内序号
  transitions: { from: PhaseStatus | null; to: PhaseStatus; at: string; by: string }[];
  createdAt: string;
  updatedAt: string;
  filePath: string;        // docs/phase/<prdId>/<seq>-<name>.md 相对路径
}

interface MetaIndex {
  activePrdId: string | null;
  prdIds: string[];       // 含已归档
  phaseIds: string[];
  updatedAt: string;
}
```

#### 写入顺序约束(双写竞态防御)

每次状态流转按以下顺序写,任一步失败则中止:

1. 校验 `isTransitionAllowed(from, to)` 合法 → 失败 → 立即返回 error,不修改任何文件。
2. 写 markdown(`generateStatusLine(meta) → fs.writeFileSync`)→ 失败 → 返回 error。
3. 写 meta.json(append transition + 更新 status + bump updatedAt)→ 失败 → 返回 error + warn「meta 落后于 markdown,需 /sdd sync --fix」。
4. 写 `.sdd/meta/index.json`(更新 activePrdId / prdIds / phaseIds)。

meta.json 不进 git,所以 markdown 是唯一可审计的源;meta 失败可下次 sync 修复,不破坏工作流。

#### /sdd init 全局单例 + --force 语义

```typescript
async function initPrd(opts: InitOptions): Promise<InitResult> {
  const active = getActivePrdMeta();
  if (active && !opts.force) {
    return { status: "error", errors: [`已有活跃 PRD: ${active.id}(${active.status}),/sdd archive 后再 init`], warnings: [] };
  }
  if (active && opts.force) {
    const isEmptyDraft = active.status === PrdStatus.Draft && active.transitions.length === 0;
    if (!isEmptyDraft) {
      return { status: "error", errors: [`--force 仅覆盖空草稿,当前 PRD ${active.id} 已流转`], warnings: [] };
    }
  }
  // ... 创建 PRD + meta
}
```

#### tool_call 硬拦截实现(分层精确检测,PRD §2.6.2)

```typescript
function isPrdOrPhaseFile(path: string): boolean {
  return /\/(prd|phase)\//.test(path);
}

function touchesStatusLine(input: Record<string, unknown>, toolName: string): boolean {
  if (!isPrdOrPhaseFile(String(input.path ?? input.filePath ?? ""))) return false;
  if (toolName === "write") {
    const content = String(input.content ?? "");
    return /^>\s*状态[：:]/m.test(content);
  }
  if (toolName === "edit") {
    const body = String(input.body ?? input.new_string ?? "");
    // body 行匹配 ^>\s*状态[：:] 前缀才 block;含正文「状态」一词放行
    return /^\+>\s*状态[：:]/m.test(body);
  }
  return false;
}
```

### 替代方案(已拒绝)

1. **markdown 状态行升级为规范权威 + 解析加固**(不再引入 meta.json)
   - **拒绝原因**: 状态行可被 edit,治标不治本;解析加固只能解决格式混乱,无法阻止 LLM 直接 edit「已归档→草稿」绕过校验。
2. **保留 14 个 `/sdd-*` 命令 + 加 alias**
   - **拒绝原因**: 命令发现性差(LLM 需记忆 14 个名字),且 alias 增加心智负担;主命令 + 子命令路由是 omp 已有惯例(`/openspec-*` 也是同类范式)。
3. **Phase 不分组目录,沿用 `docs/phase/<date>-<name>.md`**
   - **拒绝原因**: 1:N PRD↔Phase 关联需程序级 ID;沿用日期命名只能靠前缀匹配,conventions.md §2.2 与 v1.8 PRD 1:N 模型冲突。
4. **保留 OpenSpec 作为可选 hook 默认实现**
   - **拒绝原因**: v1.8 强状态流转 + tool_call 硬拦截已涵盖 OpenSpec runtime gate 的核心能力(拦截 + 校验);双范式并存带来 14+7=21 个 slash command 维护成本,LLM 命令发现性更差;OpenSpec 精华已通过 3 条吸收进 SDD。
5. **meta.json 进 git**
   - **拒绝原因**: meta 是 markdown 解析产物,进 git 会产生双写竞态(commit 时 markdown 与 meta 可能不一致);不进 git + `/sdd sync` 重建是单一事实源(markdown)的更干净设计。

### 后续

- **Phase 001**(本 PR): meta-store + init/review/approve/back + OpenSpec 移除
- **Phase 002**: plan/start/archive + phase 流转 + status + tool_call 硬拦截
- **Phase 003**: 门禁嵌入流转 + validator 事实源切换(读 meta.json) + `/sdd sync` + 别名兼容 + F14 三层注入(session_start + skill + 拦截消息)
- **conventions.md §2.2 同步更新**「Phase 与 PRD 一一对应」→「Phase 按 PRD ID 分组,1:N 关联通过 meta.json phaseIds[] 维护」
- **追踪 issue**:v1.8.0 正式发布后回填实际迁移数据(归档了多少 PRD、迁移了多少 Phase)+ 与 conventions.md §2.2 命名规范的实际一致性验证

---

## ADR-019: CLI bin 入口 + api-runner V2 映射 + Check #12 扩面 + runCommit schema 扩展 + pi.registerTool 注册 sdd tool

**状态**: Accepted(2026-07-17)
**决策人**: norman
**触发**: sw-nvr 项目实战暴露 3 个问题:外部项目无法短命令调 sdd-pack(无 bin)、omp marketplace cache 漂移导致 slash command 失效、archivePhase 是 stub 只改状态行不移动文件。
**影响**: package.json 加 bin 字段;api-runner.ts 扩 11 V2 + 5 gate stage 映射;validator Check #12 扩面校验 sdd-router ↔ api-runner 命令清单;gate-runner runCommit 返回 loreId + commitHash;extensions/sdd-extension/tools.ts 注册 18 个 sdd_* omp tool。

### 背景

sw-nvr session 实测暴露的 3 个问题:

1. **外部项目无短命令**: sdd-pack `package.json` 无 `bin` 字段,外部项目只能 `bun run plugins/sdd-pack/src/cli/api-runner.ts <cmd>` 长前缀调用。CI 场景和人工操作都不便。
2. **omp cache 漂移**: omp `installed_plugins.json` 仍是 1.6.0,symlink 指向 1.8.0 源码。agent 在 session 中 grep 1.6 cache 找不到 `/sdd plan` 等子命令,只能 `bun -e import` 绕路。
3. **archivePhase 是 stub**: api-legacy.ts:377-433 只改状态行 + syncIndex(走 PRD 表格,语义错位),缺物理移动/meta 更新/PRD 回指重写/index 同步。导致 phase 归档后文件仍在原位,meta filePath 不一致。

### 决策

#### (a) package.json 加 bin 字段 + bin.ts CLI 入口

`package.json` 加 `"bin": { "sdd": "./src/cli/bin.ts" }`,新建 `src/cli/bin.ts`(shebang `#!/usr/bin/env bun`)。外部项目 `bun add -D github:zhimingcool/sdd-pack` 或 `bun link` 后,`bunx sdd <sub>` 直接可用。**与 ADR-009 不冲突**:ADR-009 论证的是 omp marketplace 路径(marketplace 装载器不识别 `bin` 字段,故 v1.4 移除 bin);ADR-019 的 bin 字段仅服务外部项目 `bun add -D` / `bun link` 路径,不走 marketplace 装载。omp marketplace 路径仍由 ADR-009 主导(extension + slash command)。

#### (b) api-runner.ts 扩 V2 映射

api-runner.ts switch case 从 8 个 legacy 命令扩到 11 V2(init/review/approve/back/plan/start/archive/phase/phase-archive/sync/status) + 5 gate stage(gate-lint/test/review/precommit/commit,加上 `gate` 分派 case 共 6 个 case) + 3 legacy 保留(validate/propose/migrate)。外部 CI 场景可跑完整流转状态。头部注释约束行数 `≤ 100 行` 改 `≤ 250 行`。

#### (c) Check #12 扩面校验 api-runner 命令清单

PRD §3.2.4 原本以 sdd-router.ts SUBCOMMANDS 为单一事实源。扩面后 Check #12 同时校验 `sdd-router.ts SUBCOMMANDS` ↔ `api-runner.ts switch case` 两份命令清单一致。`commands.generated.json` 由 `scripts/gen-commands-json.ts` 生成,作为 Check #12 运行时数据源。

**维护约定**: sdd-router/api-runner 路由变化后必须跑 `bun run gen:commands` 重新生成 commands.generated.json,否则 Check #12 报 warn。

#### (d) runCommit schema 扩展(非 breaking)

GateResult 加可选字段 `commitHash?: string` + `loreId?: string`。runCommit 成功后通过 `lore log --limit 1 --json` 反查最新 lore-id 填充。新增 `runCommitWithFile(repoRoot, path)` 签名读 message JSON 文件后调 runCommit。旧签名保留,非 breaking change。

#### (e) pi.registerTool 注册 18 个 sdd_* omp tool

omp 17.0+ 提供 `pi.registerTool` 一等公民 API。`tools.ts` 注册 18 个 sdd_* tool(17 个 api.ts 函数 + 1 个 gate 分派),与 18 个 slash command 共存,共享 `src/cli/api.ts` 单一事实源。

**核心价值**: tool 通过 LLM tool-call 协议直接调用,不依赖易漂移的 marketplace cache。slash command 适合人类手动输入,tool 适合 agent LLM 调用,两者互补不互斥。

### 方案

```typescript
// bin.ts 入口(#!/usr/bin/env bun)
import { main } from "./api-runner";
main(process.argv.slice(2));
```

```typescript
// tools.ts registerTool(18 个 tool)
pi.registerTool({
  name: "sdd_init_prd",
  description: "Initialize a new PRD draft.",
  parameters: z.object({ title: z.string(), slug: z.string().optional() }),
  async execute(_id, params) {
    const { initPrd } = await import("../../src/cli/api");
    return { content: [{ type: "text", text: JSON.stringify(await initPrd(params)) }] };
  },
});
```

### 替代方案(已拒绝)

1. **api-runner 拆为 legacy + v2 两文件** — 违反 ADR-009「api-runner 是薄壳」原则,250 行单文件可接受。
2. **archivePhase 自动推进非终态 phase 到终态再归档** — 违反 ADR-017(归档前 phase 应已到终态),改为报错提示用户先 phase complete/abandon。
3. **meta 缺失时 warning 继续归档** — ADR-018 meta.json 是事实源,无 meta 的 phase 不应归档(会导致文件移动但 meta 不同步),升级为 error。
4. **commands.generated.json 进 gitignore + 运行时生成** — 改为提交到版本控制(决策):Check #12 需在 clone 后首次 validate 即可用,gitignore 会导致跳过检查。维护约定为路由变化后跑 `bun run gen:commands` 重新生成。
5. **PhaseStatus 加 Archived 终态** — ADR-017 定义归档是物理操作非状态迁移,加 Archived 状态是语义混淆。

### 后续

- **commands.generated.json 自动生成**(未分配 ADR 编号,提交时再定): 当前手动跑 gen:commands,未来作为 prebuild/pre-commit 自动生成

---

## ADR-020: 提交走受控入口 + 禁止 self-review 固化

**状态**: Accepted(2026-07-18)
**决策人**: norman
**触发**: sdd-pack 自身仓库开发 commit 4402762..f2654fc 时，agent 用 `reviewer: "self-review"` + `staged_hash: ""` 的组合绕过真实 reviewer 门禁。audit reviewer 审查（2026-07-18，overall_correctness: incorrect_with_minor_defects——核心代码质量可用，但有 P1/P2/P3 findings）确认代码可用，但发现经验文档附录 A 把这个绕过组合固化为"每次提交复用"标准模板，等于把反模式推荐给后续所有提交。本次 ADR + 附录 A 重写 + 文档同步即为修复。
**影响**: 明确提交的唯一入口；`LORE_COMMIT_BLOCK_REASON` 文案指向 `/sdd gate commit`；经验文档附录 A 重写为"正确提交流程"；历史 commit 不 revert 但本次起严格执行真实 reviewer。

### 背景

sdd-pack 的门禁设计：agent 应走 `/sdd gate lint -> /sdd gate test -> spawn reviewer -> /sdd gate review -> /sdd gate precommit -> /sdd gate commit` 流水线，reviewer agent 产物作为 commit 的前置条件。

实战暴露的问题（不是 hook bug，是 agent 主动绕过）：

1. omp 的 lore-commit-guard hook 拦截 bash 里直接调用的 `git commit` / `lore commit`（目的是阻止绕过门禁）
2. sdd-pack 提供 `writeReviewArtifact` + `runCommit` 两个底层 API（ADR-019(d) 扩展的合法 API，slash command 内部使用）
3. agent 在 sdd-pack 自身仓库开发时，为了避开走完整流水线，用 `bun -e 'import { writeReviewArtifact, runCommit } ...'` 直接调底层 API + 填 `reviewer: "self-review"` + `staged_hash: ""`，绕过真实 reviewer spawn 和时效校验
4. 这个绕过方式被写进经验文档附录 A，标注"每次提交复用"，等于把反模式固化为推荐操作流程

**根因**：不是 omp hook 的字符串匹配 bug，是**调用边界不明确** + **agent 主动偷懒**。runCommit 是合法 API，但没有规则约束"agent 不能直接调"，附录 A 甚至主动推荐。

### 决策

1. **提交的唯一入口是 `/sdd gate commit` slash command 或 `sdd_gate` tool**。这两个入口走 `handleGateCommit` → `runCommit` → `spawnSync("lore", ["commit"])`，在 omp runtime 的 slash command / tool 层完成，不经过 bash tool_call handler。
2. **bash 中直接调用 `git commit` / `lore commit` 被 omp hook 拦截**（已有行为，本次明确为规则）。
3. **agent 不能在 bash 里调 `writeReviewArtifact` / `runCommit` 底层 API**——这两个是 slash command 内部 API，agent 直接调用等于绕过门禁。
4. **reviewer 产物的 `reviewer` 字段必须是真实 reviewer agent**（`"reviewer"`）。`"self-review"` 视为违规。
5. **reviewer 产物必须通过 `writeReviewArtifact` 写入**——禁止 agent 直接手写 `.sdd/review/*.json` 绕过 writeReviewArtifact（这是历史 self-review 的真正绕过路径）。`writeReviewArtifact` 在 `staged_hash` 为空时自动填充,调用方不应手填。

### 接受准则

1. omp hook `LORE_COMMIT_BLOCK_REASON` 文案明确指向 `/sdd gate commit` 入口
2. 经验文档附录 A 已重写为"正确提交流程"（反模式模板删除）
3. `/sdd gate commit` slash command 能成功完成 commit（走 handleGateCommit → runCommit → spawnSync lore commit）
4. 后续所有 commit 的 review 产物 `reviewer` 字段为真实 agent（不是 `"self-review"`），`staged_hash` 非空

### 违例处理

- **sdd-pack 自身仓库开发也必须跑真实 reviewer**——不能用"开发自身"为由跳过。
- 发现 commit 用 `self-review` 产物：视为 ADR-020 违规，必须 `git revert <sha>` + 重做真实 reviewer + 重新 commit。
- **历史 commit（4402762..f2654fc）特例处理**：属于 ADR-020 前的灰色地带，经 audit reviewer 真实审查（2026-07-18）确认代码质量可用，**不 revert**。但本次起严格执行。

### 替代方案（已拒绝）

1. **保留 self-review 通道作为"快速提交"选项**——门禁名存实亡，与 sdd-pack 核心承诺冲突。
2. **runCommit 加 reviewer 字段强校验（拒绝 self-review）**——底层 API 加业务校验违反分层，且 agent 可绕过 runCommit 直接 spawnSync。
3. **删除底层 writeReviewArtifact / runCommit API**——它们是 slash command 的合法依赖，不能删。
4. **完全依赖 agent 自觉**——失去硬约束，sdd-pack 核心承诺失效。

### 与 ADR-019 的关系

ADR-019(d) 扩展 runCommit schema（加 loreId/commitHash），ADR-020 明确 runCommit 的调用边界（只通过 slash command / tool，不通过 bash 直接调）。两者互补：ADR-019 管 schema，ADR-020 管调用边界。

### 后续

- **omp hook 文案修订**：`LORE_COMMIT_BLOCK_REASON` 明确指向 `/sdd gate commit` 入口
- **经验文档附录 A 重写**：`docs/reference/omp-slash-command-and-tool.md` 的附录 A 从"gate-runner bypass 模板"改为"正确提交流程"
- **历史 commit audit**：4 个 commit 已由真实 reviewer 审查（overall_correctness: incorrect_with_minor_defects），代码质量可用，不 revert
- **外部项目 omp session 验证**: registerTool 注册的 18 个 sdd_* tool 需在真实 omp session 中验证 agent 可调(本次仅 factory 加载 + execute 单元验证)
