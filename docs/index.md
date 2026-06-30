# 项目文档索引

> 修改记录：执行 `lore log docs/index.md`

本文档是 sdd-pack 仓库的文档总入口。sdd-pack 是一个 omp marketplace 插件仓库，将 SDD 技能家族（sdd-core/sdd-input/sdd-prd/sdd-phase）和相关 rules 打包分发。

## 快速导航

### 核心文档

| 文档类型 | 最新文档 | 状态 | 说明 |
|---------|---------|------|------|
| PRD | [sdd Extension PRD](prd/2026-06-30-sdd-extension.md) | 已评审 | sdd Extension（Omp Slash Commands）— 替代独立 CLI 形态（[ADR-009](architecture/decisions.md#adr-009-sdd-extension替代独立-cli)）|
| Phase | [sdd Extension 阶段文档](phase/2026-06-30-sdd-extension.md) | 已发布 | 15 个任务，3 里程碑（Extension 骨架 → Gate 集成 → 闭环完善） |
| 架构总览 | [架构总览](architecture/overview.md) | v1.4.0-alpha | marketplace 仓库结构、plugin 目录布局、extension 集成 |

## 产品需求文档（PRD）

| 日期 | 文档名称 | 状态 | 对应 Phase | 说明 |
|------|---------|------|-----------|------|
| [2026-06-24](prd/2026-06-24-sdd-pack.md) | [SDD Pack (omp marketplace 插件) PRD](prd/2026-06-24-sdd-pack.md) | 已发布 | [阶段文档](phase/2026-06-24-sdd-pack.md) | 一键安装、版本化管理、按需启用/禁用 SDD 技能家族 |
| [2026-06-29](prd/2026-06-29-sdd-cli.md) | [sdd CLI PRD](prd/2026-06-29-sdd-cli.md) | 已替换 | [阶段文档](phase/2026-06-29-sdd-cli.md)（已归档） | 独立 CLI 形态已被 [ADR-009](architecture/decisions.md#adr-009-sdd-extension替代独立-cli) Superseded |
| [2026-06-30](prd/2026-06-30-sdd-extension.md) | [sdd Extension PRD](prd/2026-06-30-sdd-extension.md) | 已评审 | [阶段文档](phase/2026-06-30-sdd-extension.md) | sdd Extension（Omp Slash Commands）— 替代独立 CLI 形态 |

## 阶段文档（Phase）

| 日期 | 阶段名称 | 状态 | 对应 PRD | 说明 |
|------|---------|------|---------|------|
| [2026-06-24](phase/2026-06-24-sdd-pack.md) | [SDD Pack 阶段文档](phase/2026-06-24-sdd-pack.md) | 已完成 | [PRD](prd/2026-06-24-sdd-pack.md) | 4 阶段：验证 → 组装 → 上线 → 完善 |
| [2026-06-29](phase/2026-06-29-sdd-cli.md) | [sdd CLI 阶段文档](phase/2026-06-29-sdd-cli.md) | 草稿（已归档） | [PRD](prd/2026-06-29-sdd-cli.md)（已替换） | 历史档案 |
| [2026-06-30](phase/2026-06-30-sdd-extension.md) | [sdd Extension 阶段文档](phase/2026-06-30-sdd-extension.md) | 已发布 | [PRD](prd/2026-06-30-sdd-extension.md) | 15 个任务，3 Phase：骨架 → 门禁 → 闭环完善 |

## 架构文档（Architecture）

| 文档名称 | 主题 | 最后更新 | 说明 |
|---------|------|---------|------|
| [架构决策记录](architecture/decisions.md) | ADR-001/002/003/004/005/006/007/008/009 | 2026-06-30 | hook extension、三层守门 agent、sdd CLI 工作流（v1.3/v1.4 Superseded）、sdd Extension（v1.4+ 替代方案）|
| [sdd Extension 架构设计](architecture/sdd-extension-design.md) | sdd Extension 设计文档 | TBD | 由设计 agent 起草，本仓库待 v1.4.0-beta 期间补全（替代旧 [sdd CLI 设计文档](architecture/sdd-cli-design.md)）|
| [sdd CLI 架构设计（已归档）](architecture/sdd-cli-design.md) | sdd CLI 设计文档 | 2026-06-29 | 历史档案，CLI 形态,被 ADR-009 Superseded |
| [架构总览](architecture/overview.md) | marketplace 仓库结构 | 2026-06-30 | omp marketplace 仓库 + plugin 目录布局 + v1.4.0-alpha extension 集成 |

## 参考资料（Reference）

| [参考资料索引](reference/README.md) | omp 文档索引 | 2026-06-30 | omp marketplace / skills / rules / task agent / extension API 官方文档链接 |
| [omp Task Agent 机制](reference/omp-task-agent.md) | agent 机制参考 | 2026-06-25 | agent 发现/合并/装载/执行约束，三层守门 agent 运行时依据 |
| [Omp Extension API](reference/omp-extension-api.md) | extension API 参考 | 2026-06-30 | omp extension / slash command / UI / manifest 摘要,sdd-extension 实施期一手参考 |

## 贡献指南

- [文档贡献指南](CONTRIBUTING.md)：了解如何参与 sdd-pack 仓库的文档编写、插件维护与发布。

## 文档统计

- PRD 总数：3（含 1 个已替换 + 1 个已评审 + 1 个已发布）
- Spec 总数：0
- Phase 总数：3（1 个已完成 + 1 个已归档 + 1 个已发布）
- 架构文档：4（decisions + overview + sdd-cli-design 已归档 + 待补 sdd-extension-design）
- 参考资料：3

最后更新：2026-06-30
