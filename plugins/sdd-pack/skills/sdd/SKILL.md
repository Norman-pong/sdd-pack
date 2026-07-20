---
name: sdd
description: |
  sdd-pack CLI 的使用指引技能。CLI 是执行引擎（生成模板、校验、状态流转、归档），本技能是指引：告诉 agent 何时触发、何时调哪个 CLI 命令、产物格式如何。

  触发场景（任一即触发）：
  - 初始化 docs/ 目录、写 PRD/Phase/Architecture/Reference 文档、文档结构管理、lore commit 文档变更
  - 从口语化想法/需求材料产出 spec（"我想做 X"、"立项"、"整理需求"、"把这段访谈纪要整理成 spec"）
  - 从 spec 提纯为 PRD（"从 spec 写 PRD"、"审视/提纯 PRD"、"写需求文档"）
  - 从 PRD 拆解为 Phase（"写 phase"、"拆任务"、"排里程碑"、"创建阶段任务"）
  - PRD/Phase 状态流转（"PRD 评审"、"归档 PRD"、"phase 流转"、"/sdd"）
  - buf generate / yarn genApi 代码生成失败调试（"codegen 失败"、"buf generate 报错"、"手写 http stub"）

  即使用户只说"更新架构文档"、"补上索引"等局部动作，只要涉及 docs/ 都应触发。

  不适用：只读不改文档（用 Read 工具）；改代码（用 Edit 工具）；非 buf/protobuf 的代码生成。
---

# sdd-pack CLI 使用指引

## 1. 架构定位

**CLI 是执行引擎**，本技能是指引：

| 职责 | 由谁承担 |
|---|---|
| 生成 PRD 模板 | CLI `sdd propose`（`template-engine.ts` 内联生成） |
| 校验文档 | CLI `sdd validate`（12 项检查） |
| 状态流转 | CLI `sdd init/review/approve/...` |
| 归档 | CLI `sdd archive/phase-archive` |
| 门禁 | CLI `sdd gate` |
| Phase 模板 + 阶段产物模板 | `templates/`（CLI 不生成，本技能提供） |
| 方法论指引 | 本 SKILL.md + `references/` |

## 2. CLI 命令清单

### PRD 状态流转
- `sdd init --title <name>` - 创建新 PRD（草稿）
- `sdd review` - 草稿 -> 待评审
- `sdd approve` - 待评审 -> 已评审
- `sdd plan --phase <title>` - 已评审 -> 已规划任务
- `sdd start` - 已规划任务 -> 进行中
- `sdd back --to <draft|pending>` - 回退
- `sdd archive --reason <completed|abandoned>` - 归档 PRD（终态）

### Phase 流转
- `sdd phase <start|complete|abandon> [--id <phase-id>]` - Phase 流转
- `sdd phase-archive <phase-path> --reason <completed|abandoned>` - 归档 Phase

### 文档生成与校验
- `sdd propose --title <name> [--type full|delta]` - 生成 PRD 模板（**CLI 只生成 PRD，不生成 Phase**）
- `sdd validate [--path] [--severity warn|error|block]` - 校验 docs/（12 项）
- `sdd migrate <prd-path>` - 迁移旧 PRD 格式

### 查询
- `sdd status` - PRD/Phase 状态总览
- `sdd list [--type prd|phase|spec]` - 文档列表
- `sdd why <file>:<line>` - 查询 lore 决策上下文
- `sdd apply <prd-path>` - PRD 验收 checklist

### 门禁与同步
- `sdd gate <lint|test|review|precommit|commit>` - 门禁流水线
- `sdd sync [--fix]` - meta↔markdown 同步

> 外部项目优先用 `bunx sdd <sub>`（真 CLI，不依赖 omp cache）。omp session 内可用 `/sdd <sub>` slash command 或 `sdd_*` omp tool。

## 3. 文档体系结构

```
docs/
├── index.md                    # 文档总入口
├── CONTRIBUTING.md             # 贡献指南
├── spec/                       # 结构化需求输入（idea -> spec 产出）
│   └── YYYY-MM-DD-<name>.md
├── prd/                        # 产品需求文档（spec -> PRD 产出）
│   ├── YYYY-MM-DD-<name>.md
│   └── archive/                # 已归档 PRD
├── phase/                      # 阶段任务文档（PRD -> Phase 产出）
│   ├── YYYY-MM-DD-<phase>.md
│   └── archive/
├── architecture/               # 架构文档
│   ├── overview.md             # 架构总览（必须存在）
│   └── <topic>.md              # 按主题拆分
└── reference/                  # 参考资料
    └── README.md
```

命名规范详见 `references/conventions.md`。

## 4. 工作流总览

```
idea -> spec -> PRD -> Phase -> 实施 -> 归档
 追问    提纯    拆解   (agent)   sdd archive
```

### 4.1 idea -> spec（对话式追问）

**触发**：用户提"我想做 X"、"立项"、"整理需求"、"把访谈纪要整理成 spec"

**4 阶段**：澄清（对话追问具象化）-> 定边界（v1 范围）-> 显性化假设（找出隐藏前提）-> 交付（结构化 spec）

**产物**：`docs/spec/YYYY-MM-DD-<name>.md`（用 `templates/spec-template.md`）

**详细方法论**：`references/input-workflow.md`

### 4.2 spec -> PRD（质量审视）

**触发**：用户提"从 spec 写 PRD"、"审视/提纯 PRD"、"写需求文档"

**4 阶段**：自审 spec 矛盾 -> 深审选型质疑 -> 增量约束集 -> 精简提交

**产物**：`docs/prd/YYYY-MM-DD-<name>.md`

**模板**：`sdd propose --title <name>` 生成 PRD 框架（CLI 内联生成），然后追加 §0 目标声明/验收开关

**详细方法论**：`references/prd-workflow.md`

### 4.3 PRD -> Phase（任务分解）

**触发**：用户提"写 phase"、"拆任务"、"排里程碑"、"创建阶段任务"

**4 阶段**：自审 PRD 边界 -> 深审任务分解 -> 增量里程碑 -> 精简提交

**产物**：`docs/phase/YYYY-MM-DD-<phase>.md`

**模板**：`templates/phase-outline.md`（**CLI 不生成 Phase**，本模板是唯一来源）

**详细方法论**：`references/phase-workflow.md`

### 4.4 实施 -> 归档

- PRD 目标达成 -> `sdd archive --reason completed`
- Phase 完成 -> `sdd phase complete` -> `sdd phase-archive <path> --reason completed`

**详细**：`references/archival.md`

## 5. lore 协议

所有文档变更走 `lore commit`（禁止裸 `git commit`，由 `lore-commit-guard` 拦截）。

### 修改前查询

```bash
lore constraints <path> --json
lore rejected <path> --json
lore directives <path> --json
```

- **Constraint**：硬规则，必须遵守
- **Rejected**：已尝试被否决的方案，不要重复
- **Directive**：团队约定，应当遵循

### 提交

```bash
echo '{
  "intent": "<简短描述，≤72 字符>",
  "body": "<详细说明>",
  "trailers": {
    "Constraint": ["<本次变更引入的硬规则>"],
    "Rejected": ["<被否决方案 | 原因>"],
    "Tested": ["<已验证内容>"]
  }
}' | lore commit
```

## 6. codegen 调试

buf generate / yarn genApi 失败时触发。

**硬约束**：
- 禁止手写 codegen 产物（`src/api/<scope>/<version>/*.http.ts` 由 genApi 生成）
- 禁止覆盖根 `buf.gen.yaml`（用临时模板配置）
- 禁止给 BaseApi 加 patchJson/deleteJson（codegen 会生成 5 种方法）

**详细**：`references/codegen-debug.md`

## 7. 参考资源

### references/（方法论，按需加载）

- `conventions.md` - 命名规范、必填章节、状态管理、索引维护
- `input-workflow.md` - idea -> spec 4 阶段详细方法论
- `prd-workflow.md` - spec -> PRD 4 阶段详细方法论
- `phase-workflow.md` - PRD -> Phase 4 阶段详细方法论
- `archival.md` - 归档机制、状态机、归档操作
- `codegen-debug.md` - buf/genApi 调试流程

### templates/（CLI 不生成的填空式模板）

- `spec-template.md` - Spec 文档模板
- `phase-outline.md` - Phase 框架模板（CLI 不生成 Phase，本文件是唯一来源）
- `problem-list.md` - 问题清单（自审产物，通用）
- `adr-template.md` - ADR 记录模板
- `constraint-set.md` - 约束集模板
- `task-breakdown.md` - 任务分解模板
- `milestone-set.md` - 里程碑/风险/依赖模板
- `assumptions.md` - 假设清单模板
- `questions-checklist.md` - 追问问题清单

> templates/ 只含填空式模板。方法论指引（自检清单、写法规则、反模式）在 references/ 中。
