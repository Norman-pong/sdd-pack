# 项目文档索引

> 修改记录：执行 `lore log docs/index.md`

本文档是 sdd-pack 仓库的文档总入口。sdd-pack 是一个 omp marketplace 插件仓库，将 SDD 技能家族（sdd-core/sdd-input/sdd-prd/sdd-phase）、三层守门 agent、hook 守卫、slash command extension 一并打包分发，并在 v1.8.0 起移除 OpenSpec 双范式，转为 SDD 单范式 + meta.json 事实源 + 强状态流转。

## 快速导航

### 核心文档

| 文档类型 | 最新文档                                                    | 状态     | 说明                                                                                                                                          |
| -------- | ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD      | [sdd-pack PRD (v1.8 强状态流转)](prd/archive/2026-07-16-sdd-pack-v18.md) | 已归档 | v1.8: /sdd 主命令体系 + meta.json 事实源 + 全链路强状态流转 + tool_call 硬拦截 + 移除 OpenSpec 双范式 |
| Phase    | [v1.8 强状态流转(3 Phase)](phase/archive/prd-20260716-001/) | 已完成 | [001 基础设施](phase/archive/prd-20260716-001/001-foundation.md) · [002 命令体系](phase/archive/prd-20260716-001/002-commands.md) · [003 门禁集成](phase/archive/prd-20260716-001/003-gate-integration.md) |
| 架构总览 | [架构总览](architecture/overview.md)                        | v1.8.0  | marketplace 仓库结构、plugin 目录布局、SDD 单范式 extension + sdd-gate 门禁子系统集成                                           |
| 架构专题 | [sdd-gate 门禁流水线架构](architecture/sdd-gate.md)         | v1.5.0  | 5 阶段 slash command 门禁流水线（lint/test/review/precommit/commit）+ 动态 lint 注入 + review 产物契约                                       |

## 产品需求文档（PRD）

| 日期                                              | 文档名称                                                              | 状态     | 对应 Phase                                              | 说明                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------- | -------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [2026-07-16](prd/archive/2026-07-16-sdd-pack-v18.md)     | [sdd-pack PRD (v1.8 强状态流转)](prd/archive/2026-07-16-sdd-pack-v18.md)     | 已归档 | [3 Phase](phase/archive/prd-20260716-001/)  | v1.8: /sdd 主命令体系 + meta.json 事实源 + 全链路强状态流转 + tool_call 硬拦截 + 移除 OpenSpec 双范式 |
| [2026-07-16](prd/archive/2026-07-16-sdd-pack.md) | [sdd-pack 总览 PRD (v1.7 整合)（已归档）](prd/archive/2026-07-16-sdd-pack.md) | 已归档 | TBD | v1.7 整合 5 个历史 PRD + 6 PrdStatus 状态机重构 - 已被 v1.8 替代 |
| [2026-06-24](prd/archive/2026-06-24-sdd-pack.md)  | [SDD Pack (omp marketplace 插件) PRD（已归档）](prd/archive/2026-06-24-sdd-pack.md) | 已归档   | [阶段文档](phase/2026-06-24-sdd-pack.md)                | 一键安装、版本化管理、按需启用/禁用 SDD 技能家族 — 已被 v1.7 总览 PRD 整合                          |
| [2026-06-29](prd/archive/2026-06-29-sdd-cli.md)   | [sdd CLI PRD（已归档）](prd/archive/2026-06-29-sdd-cli.md)            | 已归档   | [阶段文档](phase/2026-06-29-sdd-cli.md)（已归档）       | 独立 CLI 形态已被 [ADR-009](architecture/decisions.md#adr-009-sdd-extension替代独立-cli) Superseded |
| [2026-06-30](prd/archive/2026-06-30-sdd-extension.md) | [sdd Extension PRD（已归档）](prd/archive/2026-06-30-sdd-extension.md) | 已归档 | [阶段文档](phase/2026-06-30-sdd-extension.md)（已替换） | sdd Extension（Omp Slash Commands）— 替代独立 CLI 形态                                            |
| [2026-07-01](prd/archive/2026-07-01-openspec-harness.md) | [OpenSpec Harness PRD（已归档）](prd/archive/2026-07-01-openspec-harness.md) | 已归档 | TBD | OpenSpec 作为 hook 默认实现的详细 PRD（init/validate/change/archive 工作流）                  |
| [2026-07-01](prd/archive/2026-07-01-sdd-dual-paradigm.md) | [双范式架构总览 PRD（已归档）](prd/archive/2026-07-01-sdd-dual-paradigm.md) | 已归档 | [阶段文档](phase/2026-07-01-sdd-dual-paradigm.md) | v1.5.0 双范式架构 — 已被 v1.7 总览 PRD 整合                                              |
| [2026-07-17](prd/2026-07-17-archive-consistency-internalization.md) | [归档一致性内化](prd/2026-07-17-archive-consistency-internalization.md) | 待评审 | — | — |

## 阶段文档（Phase）

| 日期                                              | 阶段名称                                                            | 状态           | 对应 PRD                                                  | 说明                                                       |
| [2026-07-16](prd/archive/2026-07-16-sdd-pack-v18.md) | [Phase 001: 基础设施](phase/archive/prd-20260716-001/001-foundation.md) | 已归档 | [PRD](prd/archive/2026-07-16-sdd-pack-v18.md) | meta-store + init/review/approve/back 基础流转 + OpenSpec 移除 |
| [2026-07-16](prd/archive/2026-07-16-sdd-pack-v18.md) | [Phase 002: 命令体系](phase/archive/prd-20260716-001/002-commands.md) | 已归档 | [PRD](prd/archive/2026-07-16-sdd-pack-v18.md) | plan/start/archive + phase 流转 + status 面板 + tool_call 硬拦截 |
| [2026-07-16](prd/archive/2026-07-16-sdd-pack-v18.md) | [Phase 003: 门禁集成](phase/archive/prd-20260716-001/003-gate-integration.md) | 已归档 | [PRD](prd/archive/2026-07-16-sdd-pack-v18.md) | 门禁嵌入流转 + validator 切换 + sync + F14 注入 + 别名兼容 + 迁移 |
| ------------------------------------------------- | ------------------------------------------------------------------- | -------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| [2026-06-24](phase/archive/2026-06-24-sdd-pack.md)        | [SDD Pack 阶段文档（已归档）](phase/archive/2026-06-24-sdd-pack.md)                   | 已完成         | [PRD](prd/archive/2026-06-24-sdd-pack.md)（已归档）                         | 4 阶段：验证 → 组装 → 上线 → 完善                          |
| [2026-06-29](phase/archive/2026-06-29-sdd-cli.md)         | [sdd CLI 阶段文档（已归档）](phase/archive/2026-06-29-sdd-cli.md)                     | 已归档 | [PRD](prd/archive/2026-06-29-sdd-cli.md)（已归档）                | 历史档案                                                   |
| [2026-06-30](phase/archive/2026-06-30-sdd-extension.md)   | [sdd Extension 阶段文档（已归档）](phase/archive/2026-06-30-sdd-extension.md)         | 已归档         | [PRD](prd/archive/2026-06-30-sdd-extension.md)（已归档）          | 15 个任务，3 Phase：骨架 → 门禁 → 闭环完善。被双范式 phase 整体替换 |
| [2026-07-01](phase/archive/2026-07-01-sdd-dual-paradigm.md) | [双范式架构实施 phase（已归档）](phase/archive/2026-07-01-sdd-dual-paradigm.md)       | 已完成         | [PRD](prd/archive/2026-07-01-sdd-dual-paradigm.md)（已归档）                | 5 个 track：restore-sdd-core + split-openspec-namespace + split-hooks + rewrite-architecture-doc + revise-adr-add |

## 架构文档（Architecture）

| 文档名称                                                       | 主题                                    | 最后更新   | 说明                                                                                                          |
| -------------------------------------------------------------- | --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| [架构决策记录](architecture/decisions.md)                      | ADR-001 至 ADR-019                      | 2026-07-17 | hook extension、三层守门 agent、sdd CLI 工作流（v1.3/v1.4 Superseded）、sdd Extension（v1.4+ 替代方案）、双范式架构（ADR-010/011 Superseded）、sdd-gate 门禁流水线、强状态流转 + meta.json 事实源（ADR-018）、CLI bin 入口 + api-runner V2 + Check #12 扩面 + runCommit schema 扩展 + pi.registerTool（ADR-019） |
| [架构总览](architecture/overview.md)                           | marketplace 仓库结构                    | 2026-07-17 | omp marketplace 仓库 + plugin 目录布局 + SDD 单范式 extension（18 /sdd 子命令 + 18 sdd_* omp tool）+ sdd-gate 门禁子系统 + bunx sdd CLI 入口 |
| [sdd-gate 门禁流水线架构](architecture/sdd-gate.md)            | 门禁流水线子系统                        | 2026-07-17 | 5 阶段 slash command（lint/test/review/precommit/commit）+ 动态 lint 注入 + review 产物契约（staged_hash 时效校验）+ 多 reviewer 支持 + hook 集成 + GateResult 返回 loreId/commitHash（ADR-019，非 breaking）|
| [sdd CLI 设计文档（已归档）](architecture/sdd-cli-design.md)   | sdd CLI 设计（Superseded）              | 2026-06-29 | ADR-008 sdd CLI 工作流设计文档，已被 ADR-009 sdd Extension 替代。仅作历史参考。                                |
## 参考资料（Reference）

| [参考资料索引](reference/README.md) | omp 文档索引 | 2026-06-30 | omp marketplace / skills / rules / task agent / extension API 官方文档链接 |
| [omp Task Agent 机制](reference/omp-task-agent.md) | agent 机制参考 | 2026-06-25 | agent 发现/合并/装载/执行约束，三层守门 agent 运行时依据 |
| [Omp Extension API](reference/omp-extension-api.md) | extension API 参考 | 2026-06-30 | omp extension / slash command / UI / manifest 摘要,sdd-extension 实施期一手参考 |
| [OpenSpec Harness 参考](reference/openspec-harness.md) | OpenSpec 规范 | 2026-07-01 | OpenSpec 文档驱动约束规范 — 本仓库 OpenSpec 范式依据（已归档，v1.8.0 移除）                            |
| [OMP Verification](reference/omp-verification.md) | omp 装载实证 | 2026-07-01 | omp marketplace / extension / hook 装载路径实测记录                          |

## 贡献指南

- [文档贡献指南](CONTRIBUTING.md)：了解如何参与 sdd-pack 仓库的文档编写、插件维护与发布。

## 文档统计
- Phase 总数：7（含 2 个已归档/已替换 + 2 个已完成/已发布 + 3 个已完成/v1.8）
- PRD 总数：5（含 2 个已替换 + 3 个已发布）
- 架构文档：4（decisions + overview + sdd-gate + sdd-cli-design 已归档）
- 参考资料：5

最后更新：2026-07-17