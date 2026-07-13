# 项目文档索引

> 修改记录：执行 `lore log docs/index.md`

本文档是 sdd-pack 仓库的文档总入口。sdd-pack 是一个 omp marketplace 插件仓库，将 SDD 技能家族（sdd-core/sdd-input/sdd-prd/sdd-phase）、三层守门 agent、hook 守卫、slash command extension 一并打包分发，并在 v1.5.0-alpha 起新增 OpenSpec 范式作为可选 hook 默认实现。

## 快速导航

### 核心文档

| 文档类型 | 最新文档                                                    | 状态     | 说明                                                                                                                                          |
| -------- | ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD      | [双范式架构总览 PRD](prd/2026-07-01-sdd-dual-paradigm.md)   | 已发布   | sdd-pack v1.5.0-alpha 双范式架构（SDD 正本 + OpenSpec 可选 hook 默认实现），替代 [sdd Extension PRD](prd/2026-06-30-sdd-extension.md)         |
| PRD      | [OpenSpec Harness PRD](prd/2026-07-01-openspec-harness.md)  | 已发布   | OpenSpec 作为 hook 默认实现的详细 PRD（init/validate/change/archive 工作流）                                                                  |
| Phase    | [双范式架构实施 phase](phase/2026-07-01-sdd-dual-paradigm.md) | 已完成 | 5 个 track 落地：restore-sdd-core + split-openspec-namespace + split-hooks + rewrite-architecture-doc + revise-adr-add                     |
| 架构总览 | [架构总览](architecture/overview.md)                        | v1.5.0-alpha | marketplace 仓库结构、plugin 目录布局、双范式 extension/hook/api-runner 集成                                                                  |

## 产品需求文档（PRD）

| 日期                                            | 文档名称                                                              | 状态     | 对应 Phase                                              | 说明                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------- | -------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [2026-06-24](prd/2026-06-24-sdd-pack.md)        | [SDD Pack (omp marketplace 插件) PRD](prd/2026-06-24-sdd-pack.md)     | 已发布   | [阶段文档](phase/2026-06-24-sdd-pack.md)                | 一键安装、版本化管理、按需启用/禁用 SDD 技能家族                                                    |
| [2026-06-29](prd/2026-06-29-sdd-cli.md)         | [sdd CLI PRD](prd/2026-06-29-sdd-cli.md)                              | 已替换   | [阶段文档](phase/2026-06-29-sdd-cli.md)（已归档）       | 独立 CLI 形态已被 [ADR-009](architecture/decisions.md#adr-009-sdd-extension替代独立-cli) Superseded |
| [2026-06-30](prd/2026-06-30-sdd-extension.md)   | [sdd Extension PRD](prd/2026-06-30-sdd-extension.md)                  | 已替换   | [阶段文档](phase/2026-06-30-sdd-extension.md)（已替换） | sdd Extension（Omp Slash Commands）— 替代独立 CLI 形态。已被 [2026-07-01 双范式 PRD](prd/2026-07-01-sdd-dual-paradigm.md) 替代  |
| [2026-07-01](prd/2026-07-01-sdd-dual-paradigm.md) | [双范式架构总览 PRD](prd/2026-07-01-sdd-dual-paradigm.md)             | 已发布   | [阶段文档](phase/2026-07-01-sdd-dual-paradigm.md)       | v1.5.0-alpha 双范式架构：SDD 正本 + OpenSpec 可选 hook 默认实现                                     |
| [2026-07-01](prd/2026-07-01-openspec-harness.md) | [OpenSpec Harness PRD](prd/2026-07-01-openspec-harness.md)            | 已发布   | （同上 phase）                                          | OpenSpec 作为 hook 默认实现的详细 PRD                                                              |

## 阶段文档（Phase）

| 日期                                              | 阶段名称                                                            | 状态           | 对应 PRD                                                  | 说明                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------- | -------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| [2026-06-24](phase/2026-06-24-sdd-pack.md)        | [SDD Pack 阶段文档](phase/2026-06-24-sdd-pack.md)                   | 已完成         | [PRD](prd/2026-06-24-sdd-pack.md)                         | 4 阶段：验证 → 组装 → 上线 → 完善                          |
| [2026-06-29](phase/2026-06-29-sdd-cli.md)         | [sdd CLI 阶段文档](phase/2026-06-29-sdd-cli.md)                     | 草稿（已归档） | [PRD](prd/2026-06-29-sdd-cli.md)（已替换）                | 历史档案                                                   |
| [2026-06-30](phase/2026-06-30-sdd-extension.md)   | [sdd Extension 阶段文档](phase/2026-06-30-sdd-extension.md)         | 已替换         | [PRD](prd/2026-06-30-sdd-extension.md)（已替换）          | 15 个任务，3 Phase：骨架 → 门禁 → 闭环完善。被双范式 phase 整体替换 |
| [2026-07-01](phase/2026-07-01-sdd-dual-paradigm.md) | [双范式架构实施 phase](phase/2026-07-01-sdd-dual-paradigm.md)       | 已完成         | [PRD](prd/2026-07-01-sdd-dual-paradigm.md)                | 5 个 track：restore-sdd-core + split-openspec-namespace + split-hooks + rewrite-architecture-doc + revise-adr-add |

## 架构文档（Architecture）

| 文档名称                                                       | 主题                                    | 最后更新   | 说明                                                                                                          |
| -------------------------------------------------------------- | --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| [架构决策记录](architecture/decisions.md)                      | ADR-001 至 ADR-012                      | 2026-07-13 | hook extension、三层守门 agent、sdd CLI 工作流（v1.3/v1.4 Superseded）、sdd Extension（v1.4+ 替代方案）、双范式架构、sdd-gate 门禁流水线 |
| [架构总览](architecture/overview.md)                           | marketplace 仓库结构                    | 2026-07-13 | omp marketplace 仓库 + plugin 目录布局 + v1.5.0-alpha 双范式 extension/hook/api-runner + sdd-gate 门禁子系统   |
| [sdd-gate 门禁流水线架构](architecture/sdd-gate.md)            | 门禁流水线子系统                        | 2026-07-13 | 5 阶段 slash command（lint/test/review/precommit/commit）+ 动态 lint 注入 + review 产物契约 + hook 集成      |

## 参考资料（Reference）

| [参考资料索引](reference/README.md) | omp 文档索引 | 2026-06-30 | omp marketplace / skills / rules / task agent / extension API 官方文档链接 |
| [omp Task Agent 机制](reference/omp-task-agent.md) | agent 机制参考 | 2026-06-25 | agent 发现/合并/装载/执行约束，三层守门 agent 运行时依据 |
| [Omp Extension API](reference/omp-extension-api.md) | extension API 参考 | 2026-06-30 | omp extension / slash command / UI / manifest 摘要,sdd-extension 实施期一手参考 |
| [OpenSpec Harness 参考](reference/openspec-harness.md) | OpenSpec 规范 | 2026-07-01 | OpenSpec 文档驱动约束规范 — 本仓库 OpenSpec 范式依据                            |
| [OMP Verification](reference/omp-verification.md) | omp 装载实证 | 2026-07-01 | omp marketplace / extension / hook 装载路径实测记录                          |

## 贡献指南

- [文档贡献指南](CONTRIBUTING.md)：了解如何参与 sdd-pack 仓库的文档编写、插件维护与发布。

## 文档统计

- PRD 总数：5（含 2 个已替换 + 3 个已发布）
- Phase 总数：4（含 2 个已归档/已替换 + 2 个已完成/已发布）
- 架构文档：2（decisions + overview）
- 参考资料：4

最后更新：2026-07-01