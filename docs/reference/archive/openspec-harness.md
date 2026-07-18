# OpenSpec 思想精华（已移除，精华吸收进 SDD）

> 修改记录：执行 `lore log docs/reference/openspec-harness.md`
> 状态：v1.8.0（2026-07-16）移除 OpenSpec 双范式，本文件改为精华吸收记录
> 溯源：[v1.8 PRD §1.4](../../prd/archive/2026-07-16-sdd-pack-v18.md) · [ADR-010](../../architecture/decisions.md)（Superseded） · [ADR-011](../../architecture/decisions.md)（Superseded）

## 0. 本文档的定位

OpenSpec 范式自 v1.5.0 引入双范式架构（ADR-010/011），但在本仓库**从未真正使用**：

- `openspec/` 目录在本仓库不存在（未初始化）
- 双范式自 v1.5.0 引入后约 1500 行代码为死代码
- 双 extension 重复实现 `isGitCommit` / `isLoreCommit` 等同质逻辑

v1.8.0 移除 OpenSpec 范式（~1500 行死代码删除），但**保留并吸收**其 3 个设计精华进 SDD。本文档记录：

1. 吸收的 3 个精华及其在 SDD 中的落地方式
2. 显式拒绝吸收的 2 个特性及理由
3. 2 条可复用的元层面教训
4. 历史溯源路径（便于追溯决策上下文）

本文档**不是** OpenSpec 使用手册——OpenSpec 范式已不存在。它是 sdd-pack 设计演进的一份思想档案。

---

## 1. 吸收的 3 个精华

| # | OpenSpec 思想 | OpenSpec 实现 | SDD 吸收方式 |
|---|---|---|---|
| 1 | **目录即状态** | `changes/` vs `changes/archive/` —— 物理位置本身是事实源 | SDD 原本就有（`prd/` vs `prd/archive/`）；v1.8 补齐 meta.json 记录**中间态**，**终态**继续靠目录位置 |
| 2 | **change 目录内聚** | `changes/<id>/` 内聚 proposal + tasks + design 文件 | Phase 按 PRD ID 分组目录：`docs/phase/<prd-id>/<seq>-<name>.md` |
| 3 | **SHALL/MUST 规范校验** | validate 检查 RFC 2119 关键词（SHALL / MUST / Requirement: / Scenario:） | `/sdd review` 门禁新增规范语言校验 |

### 1.1 目录即状态（location as state）

OpenSpec 的核心洞察：**状态不需要存在文件里**——`changes/` 就是 active，`changes/archive/` 就是 done。物理位置本身不可篡改、无需同步。

SDD 原本就有终态的目录区分（`prd/` vs `prd/archive/`），但缺少中间态记录。v1.8 的吸收方式（ADR-018）：

- 终态（已归档 / 已废弃）：继续靠目录位置——`prd/archive/` 即终态
- 中间态（草稿 / 评审中 / 已评审 / 已发布）：用 `.sdd/meta/<id>.json` 记录，markdown 状态行由 meta 自动生成
- meta.json **不进 git**（本地工作状态），避免多开发者状态冲突

### 1.2 change 目录内聚

OpenSpec 的洞察：**一个变更的所有产物放同一个目录**，读一个变更 = 读一个目录。

SDD 原本 Phase 文档是平铺的（`docs/phase/*.md`），归档时需逐个移动。吸收后：

```
docs/phase/<prd-id>/
  001-foundation.md
  002-feature-x.md
  003-gate-integration.md
```

Phase 按 PRD ID 分组，物理目录结构与逻辑归属对齐。归档时移动整个 `<prd-id>/` 目录即可。

### 1.3 SHALL/MUST 规范语言校验

OpenSpec 的洞察：用 **RFC 2119 关键词**（SHALL / MUST / SHOULD / MAY）+ 结构化标记（`Requirement:` / `Scenario:`）把"自然语言需求"变成"机器可校验契约"。

SDD 吸收方式：`/sdd review` 门禁新增规范语言校验——检查 PRD / Phase 文档是否包含足够的 SHALL / MUST 关键词，避免需求模糊化。

---

## 2. 显式拒绝吸收的 2 个特性

v1.8 PRD §5.1 记录了两个**不吸收**的 OpenSpec 特性：

| OpenSpec 特性 | 拒绝理由 |
|---|---|
| **spec delta 机制**（增量 spec merge） | PRD 是完整文档，不是增量；delta merge 对 SDD 过度工程 |
| **2 态生命周期**（active / archived） | 太简单；SDD 需要 6 态状态机（草稿 / 评审中 / 已评审 / 已发布 / 已归档 / 已废弃）来管理真实软件项目 |

**关键启示**：吸收 ≠ 照搬。简单范式（2 态）在复杂场景（软件项目管理）会欠拟合；反过来 SDD 的 6 态对纯 spec 文档又过度。**范式的复杂度要对齐场景**，不存在通用的最优解。

---

## 3. 元层面教训

### 3.1 吸收 > 并存，早删 > 晚删

**"双范式并存"往往是过度设计**——如果其中一个范式从未真正使用，它就不是并存而是死代码。面对外部范式，问"它的哪些思想能改进我"（吸收精华），而不是"我要不要整体支持它"（并存双 extension）。

v1.5 引入双范式到 v1.8 移除，中间约 1500 行代码 + 3 份 ADR/PRD 的维护成本是这次走过头的代价。

### 3.2 范式复杂度对齐场景

OpenSpec 的 active/archived 对 spec 文档够用，但对 PRD/Phase 不够（§2 拒绝理由）。反过来 SDD 的 6 态状态机对纯 spec 文档又过度。**不存在通用的最优范式**，只有对齐场景的范式。

---

## 4. 历史溯源

OpenSpec 范式的设计决策与演进历史保留在以下已归档文档中（**不修改**，作为历史档案）：

| 文档 | 类型 | 说明 |
|---|---|---|
| [ADR-010](../../architecture/decisions.md) | 架构决策（Superseded） | OpenSpec 作为 hook 默认实现 + 可选入口 |
| [ADR-011](../../architecture/decisions.md) | 架构决策（Superseded） | sdd-pack 双范式架构（SDD 正本 + OpenSpec 可选） |
| [v1.8 PRD §1.4](../../prd/archive/2026-07-16-sdd-pack-v18.md) | PRD（已归档） | 移除 OpenSpec 双范式 + 吸收 3 精华的权威记录 |
| [OpenSpec Harness PRD](../../prd/archive/2026-07-01-openspec-harness.md) | PRD（已归档） | OpenSpec 作为 hook 默认实现的详细 PRD（init/validate/change/archive 工作流） |
| [双范式架构总览 PRD](../../prd/archive/2026-07-01-sdd-dual-paradigm.md) | PRD（已归档） | v1.5.0 双范式架构总览 |
| [双范式架构实施 phase](../../phase/archive/2026-07-01-sdd-dual-paradigm.md) | Phase（已归档） | 5 个 track：restore-sdd-core / split-openspec-namespace / split-hooks / rewrite-architecture-doc / revise-adr-add |

查具体某次提交的决策上下文：`lore log docs/reference/openspec-harness.md` 或 `lore context docs/reference/openspec-harness.md`。
