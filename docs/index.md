# 项目文档索引

> 修改记录：执行 `lore log docs/index.md`

本文档是 sdd-pack 仓库的文档总入口。sdd-pack 是一个 omp marketplace 插件仓库，将 SDD 技能家族（sdd-core/sdd-input/sdd-prd/sdd-phase）和相关 rules 打包分发。

## 快速导航

### 核心文档

| 文档类型 | 最新文档 | 状态 | 说明 |
|---------|---------|------|------|
| PRD | [sdd CLI PRD](prd/2026-06-29-sdd-cli.md) | 草稿 | 构建 sdd CLI 工具（TS+bun），文档生命周期权威入口 |
| Phase | [sdd CLI 阶段文档](phase/2026-06-29-sdd-cli.md) | 未开始 | 3 阶段：CLI 骨架 → 门禁集成 → 闭环完善 |
| 架构总览 | [架构总览](architecture/overview.md) | 草稿 | marketplace 仓库结构、plugin 目录布局、provider 发现机制 |

## 产品需求文档（PRD）

| 日期 | 文档名称 | 状态 | 对应 Phase | 说明 |
|------|---------|------|-----------|------|
| [2026-06-24](prd/2026-06-24-sdd-pack.md) | [SDD Pack (omp marketplace 插件) PRD](prd/2026-06-24-sdd-pack.md) | 已发布 | [阶段文档](phase/2026-06-24-sdd-pack.md) | 一键安装、版本化管理、按需启用/禁用 SDD 技能家族 |
| [2026-06-29](prd/2026-06-29-sdd-cli.md) | [sdd CLI PRD](prd/2026-06-29-sdd-cli.md) | 草稿 | [阶段文档](phase/2026-06-29-sdd-cli.md) | 构建 sdd CLI（TS+bun），文档生命周期权威入口 |

## 阶段文档（Phase）

| 日期 | 阶段名称 | 状态 | 对应 PRD | 说明 |
|------|---------|------|---------|------|
| [2026-06-24](phase/2026-06-24-sdd-pack.md) | [SDD Pack 阶段文档](phase/2026-06-24-sdd-pack.md) | 已完成 | [PRD](prd/2026-06-24-sdd-pack.md) | 4 阶段：验证 → 组装 → 上线 → 完善 |
| [2026-06-29](phase/2026-06-29-sdd-cli.md) | [sdd CLI 阶段文档](phase/2026-06-29-sdd-cli.md) | 未开始 | [PRD](prd/2026-06-29-sdd-cli.md) | 3 Phase：CLI 骨架 → 门禁集成 → 闭环完善 |

## 架构文档（Architecture）

| 文档名称 | 主题 | 最后更新 | 说明 |
|---------|------|---------|------|
| [架构决策记录](architecture/decisions.md) | ADR-006/007/008 | 2026-06-29 | hook extension、三层守门 agent、sdd CLI 工作流 |
| [sdd CLI 架构设计](architecture/sdd-cli-design.md) | sdd CLI 设计文档 | 2026-06-29 | CLI 物理位置、子命令清单、数据模型、硬门禁、实施路径 |
| [架构总览](architecture/overview.md) | marketplace 仓库结构 | 2026-06-24 | omp marketplace 仓库 + plugin 目录布局 |

## 参考资料（Reference）

| [参考资料索引](reference/README.md) | omp 文档索引 | 2026-06-25 | omp marketplace / skills / rules / task agent 官方文档链接 |
| [omp Task Agent 机制](reference/omp-task-agent.md) | agent 机制参考 | 2026-06-25 | agent 发现/合并/装载/执行约束，三层守门 agent 运行时依据 |

## 贡献指南

- [文档贡献指南](CONTRIBUTING.md)：了解如何参与 sdd-pack 仓库的文档编写、插件维护与发布。

## 文档统计

- PRD 总数：2
- Spec 总数：0
- Phase 总数：2
- 架构文档：3
- 参考资料：2

最后更新：2026-06-29
