# OpenSpec 思想精华（已移除，精华吸收进 SDD）

> 修改记录：执行 `lore log docs/reference/openspec-essence.md`
>
> 背景：sdd-pack v1.5 曾并存 SDD + OpenSpec 双范式，v1.8.0 移除 OpenSpec（ADR-018）。本文只保留其思想精华与拒绝理由，不含 OpenSpec 命令/工作流细节（已随代码移除）。

## 1. 吸收的 3 个精华

**目录即状态（location as state）**：状态不需要存在文件里——`changes/` 就是 active，`changes/archive/` 就是 done，物理位置本身不可篡改、无需同步。SDD 原本就有终态目录区分（`prd/` vs `prd/archive/`），v1.8 补齐：终态靠目录位置，中间态（草稿/评审中/已评审/已发布）用 `.sdd/meta/<id>.json` 记录，markdown 状态行由 meta 生成；meta.json 不进 git，避免多开发者状态冲突。

**change 目录内聚**：一个变更的所有产物放同一目录，读一个变更 = 读一个目录。SDD 原本 Phase 平铺（`docs/phase/*.md`），归档需逐个移动；吸收后 Phase 按 PRD ID 分组（`docs/phase/<prd-id>/<seq>-<name>.md`），归档移动整个 `<prd-id>/` 目录即可。

**SHALL/MUST 规范语言校验**：用 RFC 2119 关键词（SHALL/MUST/SHOULD/MAY）+ 结构化标记把"自然语言需求"变成"机器可校验契约"。SDD 吸收方式：`/sdd review` 门禁新增规范语言校验，检查 PRD/Phase 是否包含足够关键词，避免需求模糊化。

## 2. 显式拒绝的 2 个特性

| OpenSpec 特性 | 拒绝理由 |
|---|---|
| **spec delta 机制**（增量 spec merge） | PRD 是完整文档，不是增量；delta merge 对 SDD 过度工程 |
| **2 态生命周期**（active / archived） | 太简单；SDD 需要 6 态状态机（草稿/评审中/已评审/已发布/已归档/已废弃）管理真实软件项目 |

关键启示：吸收 ≠ 照搬。简单范式（2 态）在复杂场景欠拟合；SDD 的 6 态对纯 spec 文档又过度。**范式复杂度要对齐场景**，不存在通用最优解。

## 3. 元教训

**吸收 > 并存，早删 > 晚删**。"双范式并存"往往是过度设计——若其中一个范式从未真正使用，它就不是并存而是死代码。面对外部范式，问"它的哪些思想能改进我"（吸收精华），而不是"我要不要整体支持它"（并存双 extension）。v1.5 引入双范式到 v1.8 移除，约 1500 行代码 + 3 份 ADR/PRD 的维护成本是走过头的代价。

**范式复杂度对齐场景**。OpenSpec 的 active/archived 对 spec 文档够用，对 PRD/Phase 不够；反过来 SDD 6 态对纯 spec 文档过度。不存在通用最优范式，只有对齐场景的范式。

## 4. 为何不并存

ADR-018 决策：SDD 的强状态流转（6 态状态机 + meta.json）+ extension `tool_call` 硬拦截已涵盖 OpenSpec runtime gate 的核心能力；3 个精华已吸收进 SDD 本体。并存意味着双份命令面（v1.5 时 14 + 7 = 21 个 slash command）、双份状态机、双份文档——能力重复、维护成本翻倍，且 OpenSpec 侧从未真正被使用。吸收精华后移除，是收敛而非损失。

## 5. 关联文档

- [架构决策记录](../architecture/decisions.md) — ADR-011（双范式引入）/ ADR-018（OpenSpec 移除 + meta.json 吸收）
- 归档旧文（含 OpenSpec 工作流细节，历史参考）：`docs/reference/archive/openspec-harness.md`
