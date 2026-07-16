# AGENTS.md — sdd-pack 仓库

> 修改记录：`lore log AGENTS.md`
> 本文件是项目根上下文入口。详细设计溯源见末尾「权威文档索引」。

## 项目定位

sdd-pack 是 **omp marketplace 插件**，把 SDD 范式（正本）+ OpenSpec 范式（可选）的需求/阶段/审查/提交门禁端到端工作流打包成 omp 全部 5 类资产分发。

- **仓库**：`zhimingcool/sdd-pack`
- **版本**：v1.6.0（marketplace.json）
- **插件根**：`plugins/sdd-pack/`
- **runtime**：bun（omp 通过 bun 加载 extension `.ts`）

## omp 插件机制理念

omp 插件提供 **5 类资产**，各有触发机制，**不互相替代**：

| 资产 | sdd-pack 内路径 | 触发机制 | 核心约束 |
| --- | --- | --- | --- |
| **Skills** | `skills/sdd-{core,input,prd,phase}/` | 主 agent 看 description 自主加载 SKILL.md | description 质量决定触发率 |
| **Rules** | `rules/*.md`（5 个） | TTSR 软门禁：hook 注入 system 提示，agent 自觉遵守 | **全部是软门禁，无程序级拦截** |
| **Agents** | `agents/{reviewer,arch-reviewer,sdd-reviewer}.md` | `task()` 手动 spawn，不绑 commit gate | 产物落 `.sdd/review/<sha>.<agent>.json` |
| **Extensions** | `extensions/{sdd,openspec}-extension/index.ts` | `pi.registerCommand` 注册 slash command + `pi.on("tool_call")` 硬拦截 | **唯一的程序级硬门禁来源** |
| **Hooks** | v1.6.0 起合并进 extension | 已废弃独立装载 | ADR-011 |

### link vs install（关键区别）

- **`omp plugin link`**（推荐）：5 类资产全部生效（skills + rules + extensions + hooks 拦截）
- **`omp plugin install`**（marketplace cache）：**仅 skills 生效**，extension module 不装载、rules 0 条装载、hook 不拦截

> 溯源：ADR-006（hook extension 替代 static rules）· ADR-009（extension 替代独立 CLI）· ADR-011（双范式架构）

### 门禁模型：软 vs 硬

| 层次 | 机制 | 提供者 |
| --- | --- | --- |
| 软门禁 | 注入 system 提示，agent 自觉遵守 | 5 个 rules |
| 硬门禁 | `pi.on("tool_call")` 返回 `{block: true, reason}` | `extensions/sdd-extension/index.ts` |
| 硬门禁 | `/sdd-gate-*` slash command 5 阶段流水线 | `gate-runner.ts`（lint→test→review→precommit→commit） |

> **没有 rule 是程序级硬门禁**——所有 rule 都是 TTSR 软门禁。

## SDD 范式核心

### 文档驱动

```
docs/
├── prd/YYYY-MM-DD-<name>.md       # 产品需求文档（6 PrdStatus 状态机, ADR-016）
├── phase/YYYY-MM-DD-<name>.md     # 阶段任务文档（4 PhaseStatus 状态机, ADR-017）
├── architecture/decisions.md      # ADR 集中存储
└── reference/                     # 外部系统/API 文档
```

- **模板由代码内联生成**（`template-engine.ts`），不依赖 `_template.md` 文件（已删除）
- **PRD 状态机**：草稿 → 发布候选:评审中 → 已评审 → 已发布 → 已归档/已替换/已废弃（ADR-016）
- **Phase 状态机**：未开始 → 进行中 → 已完成/已废弃（ADR-017，终态不可回退）
- architecture/reference **不加状态机**（参考材料，ADR-017）

### lore commit 协议

- **禁止 `git commit`**（extension 硬拦截）→ 改用 `lore commit`
- commit message 走 JSON trailer：`intent`（必填）+ `Constraint` / `Rejected` / `Tested` / `Scope-risk` / `Reversibility`
- 查历史：`lore log <path>`（替代 `git log`）· `lore why <file>:<line>` · `lore context <path>`

### 双范式（SDD / OpenSpec 互斥）

- **SDD**（正本）：守 `docs/prd/`，14 个 `/sdd-*` slash command
- **OpenSpec**（可选）：守 `openspec/changes/`，7 个 `/openspec-*` slash command
- 同一时间只装载一个 hook 路径（ADR-011）

## 开发工作流

### 编辑循环

```bash
cd plugins/sdd-pack

# 改代码后即时验证（编码后 lint 门禁）
bunx tsc --noEmit          # 类型检查
bun test                   # 全量测试（应 0 fail）

# 改 skills/rules/agents → 纯文档，无需编译
# 改 extensions/hooks → 重启 omp 生效
# 改 src/cli/api.ts → 跑测试 + tsc
```

### 提交流水线（5 阶段硬门禁）

```bash
# 方式 1：slash command（omp TUI 内）
/sdd-gate-lint && /sdd-gate-test && /sdd-gate-review && /sdd-gate-precommit && /sdd-gate-commit

# 方式 2：gate-runner（脚本）
bun -e 'import {runLint,runTest,runReview,runPrecommit,runCommit} from "./plugins/sdd-pack/src/cli/lib/gate-runner"; ...'
```

退出码：`pass=0` · `warn=0` · `error=1` · `block=2`

### 关键约束

- **单文件 ≤ 400 行**（phase doc T002 硬上限，适用 extension/hook）
- **extension 不用 `@oh-my-pi/pi-coding-agent` 类型**——unknown 兜底，跟 hook 同构
- **`pi.on()` 同 event 多次注册后者覆盖前者**——每个 event 只 on 一次，内部分发
- **.working/ 临时目录**：阶段 4 完成后必须清理（conventions.md §1.4）

## 目录结构

```
sdd-pack/                         # 仓库根
├── AGENTS.md                     # 本文件
├── .omp-plugin/marketplace.json  # omp 插件清单
├── docs/                         # SDD 文档体系（正本）
│   ├── index.md
│   ├── prd/                      # PRD（+ archive/）
│   ├── phase/                    # Phase（+ archive/）
│   ├── architecture/             # ADR + 架构专题
│   └── reference/                # 外部资料
└── plugins/sdd-pack/             # omp 插件本体
    ├── skills/                   # 4 skills（sdd-core/input/prd/phase）
    ├── rules/                    # 5 TTSR rules
    ├── agents/                   # 3 守门 agent
    ├── extensions/               # 2 extension（sdd + openspec）
    ├── src/cli/                  # API + gate-runner + template-engine
    └── package.json
```

## 权威文档索引

| 主题 | 文档 | 关键 ADR |
| --- | --- | --- |
| 插件全貌 | `plugins/sdd-pack/README.md` | — |
| 架构决策 | `docs/architecture/decisions.md` | ADR-006/009/011/016/017 |
| 门禁流水线 | `docs/architecture/sdd-gate.md` | — |
| SDD 规范 | `plugins/sdd-pack/skills/sdd-core/SKILL.md` | — |
| PRD 状态机 | `plugins/sdd-pack/src/cli/lib/prd-state-machine.ts` | ADR-016/017 |
| omp extension API | `docs/reference/omp-extension-api.md` | — |
| 当前 PRD | `docs/prd/2026-07-16-sdd-pack.md` | — |
