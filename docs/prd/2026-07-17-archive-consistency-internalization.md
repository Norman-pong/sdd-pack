# 归档一致性内化 PRD

> 状态：待评审 | 发布日期：2026-07-17 | 版本：1.0.0
> 修改记录：执行 `lore log docs/prd/2026-07-17-archive-consistency-internalization.md`
> 对应阶段：TBD - 待设计评审后由 sdd-phase 补全

> [!IMPORTANT] PRD 生命周期状态机（ADR-016, 6 状态 + 已归档终态）
> 草稿 ↔ 待评审（可灵活切换） → 已评审 → 已规划任务 → 进行中 → **已归档**（终态）
> 已归档是唯一终态，通过 ArchiveReason（已完成/已中止）记录归档原因。**硬约束**：已评审 不可回退 草稿；任意状态可直接归档但不可逆；已归档 是终态。变更类型判据（A 实现偏差 / B v1 内微调 / C 跨版本叠加）与决策树见 `rule://prd-change-management`。

## 0. 目标声明

把 sdd-pack 的"归档一致性"从**人肉约定 + 外部提示**内化为**插件自身的结构保证**：单一事实源、事务化归档、归档后自检、文档与行为零漂移。缺陷不能再静默发生，也不需要靠维护者的私有 skill 提示去发现和修复。
## 1. 背景与目标

### 1.1 业务背景

sdd-pack 是对外分发的 omp 插件，提供 PRD/Phase 文档驱动工作流。近期全面评审发现一类反复出现的**归档一致性缺陷**：

- `archivePrdV2` 归档后 `meta.filePath` 不更新、`docs/index.md` 链接指向旧位置、PRD↔Phase 交叉引用断裂
- `--reason abandoned` 不移动文件，导致 validator Check #9 报"已归档但仍在 prd/"——**插件产出的状态被自己的校验器判为不合规，自相矛盾**
- `rebuildMetaFromMarkdown` 的 `nextPhaseSeq` off-by-one（**已修复**，commit a9004e8；本 PRD 不再涉及）

这些缺陷的**发现与修复都依赖人工评审 + 一个私有 managed skill 提示**(`sdd-pack-archive-consistency`)。这是本末倒置：插件使用者不该需要额外的"私房提示"才能正确使用插件；一致性知识应当内化在插件的代码结构、校验器和文档里。

### 1.2 根因分析

归档一致性缺陷反复出现的结构性根因：

1. **多点手写、无单一事实源**：归档要同步 4 处（meta.filePath / 磁盘文件 / index.md 链接 / PRD↔Phase 交叉引用），当前在 `archivePrdV2` 里逐点手写，漏一处就断链。
2. **无事务边界**：归档中途失败（如 renameSync 成功但 index 更新抛错）会留下半成品状态，无回滚。
3. **校验器只告警不兜底**：validator Check #9 能发现"已归档但仍在 prd/"，但 `/sdd archive` 不在归档后自检，缺陷可静默通过。
4. **文档与行为漂移**：SKILL.md / README 的命令写法（`sdd propose` vs `sdd-propose`)、检查项数量（10 项 vs 实际 11 项）与实现不一致。
5. **生成器与校验器规则不一致**：`template-engine` 的 slug 正则允许中文字符（`[^a-z0-9\u4e00-\u9fff]+`)，`initPrd` 生成中文文件名；但 validator Check #7 要求 kebab-case（不允许中文）——**插件自己生成的文件名被自己的 validator 判为不合规**。本 PRD 文件名即是受害者（init 生成 `2026-07-17-归档一致性内化.md` 报 Check #7，手工改名为 `archive-consistency-internalization`)。

### 1.3 产品目标

- 归档操作**原子化 + 单一入口**：一次调用要么全部一致，要么整体回滚，不存在半成品。
- **归档后自检**：`/sdd archive` 提交前自动跑一致性校验，不一致即回滚报错而非静默。
- **文档与行为对齐**：validator 保证 SKILL.md/README 的命令、检查项数量与实现一致。
- 移除对外部私有提示的依赖：插件自身就是正确性的载体。

### 1.4 成功指标

- 归档（completed + abandoned）端到端四要素一致由插件结构保证，而非测试人肉断言。
- 归档中途注入失败（模拟 index 更新抛错）→ 状态完整回滚，无半成品。
- `/sdd archive` 后 `/sdd-validate` 必然通过（不再有自相矛盾）。
- 删除私有 skill `sdd-pack-archive-consistency` 后，插件行为正确性不依赖它。
## 2. 用户与场景

### 2.1 目标用户

| 用户角色 | 描述 | 核心诉求 |
|---------|------|---------|
| 插件使用者（开发者） | 用 sdd-pack 管理自己的 PRD/Phase 文档 | 归档后文档体系自洽，不需懂内部一致性细节 |
| 插件维护者 | 开发/演进 sdd-pack 本身 | 一致性不变量有结构保证，改归档逻辑不漏同步点 |

### 2.2 使用场景

- 开发者执行 `/sdd archive --reason abandoned` 中止一个 PRD → 插件移动文件、更新 meta/index/链接，归档后 validate 通过，无需任何额外知识。
- 维护者修改归档逻辑（如新增一个同步点）→ 结构与测试迫使他同时更新所有一致性环节，漏掉即测试失败。
## 3. 功能需求

### 3.1 功能清单

| 功能模块 | 功能点 | 优先级 | 说明 |
|---------|--------|--------|------|
| 归档内核 | 归档原子化（快照 + 逆序回滚） | P0 | archivePrdV2 包 `withRollback(snapshot, fn)`，任一步失败逆序还原（§3.2.1） |
| 校验器 | 归档后自检（归档尾部跑 Check#9 + 四要素断言，失败也回滚） | P1 | 兜底校验层，防静默通过（§3.2.2） |
| 文档对齐 | slug 生成器去掉 `\u4e00-\u9fff` + initPrd 新增可选 slug 参数 | P1 | 与 validator Check #7 统一为 ASCII kebab-case（§3.2.3） |
| 文档对齐 | validator Check #12：命令清单漂移校验（sdd-router SUBCOMMANDS 为事实源） | P2 | 比对 SKILL.md/REMINDER，用 generated.json 驱动（§3.2.4） |
| 测试 | 失败注入测试（模拟步骤 3/6/7 失败验证回滚） | P1 | 锁定原子性 |

### 3.2 详细功能描述

> 设计基于代码调研（archivePrdV2 @ api-flow.ts:523-655, meta-store.ts:142-177, index-sync.ts, doc-links.ts, validator.ts Check#7/#9, template-engine.ts:28-33, sdd-router.ts:408-444, SKILL.md 命令清单）。

#### 3.2.1 归档原子化（快照 + 逆序回滚）

**现状**：archivePrdV2 是 7 步同步 fs 操作串联，无事务边界：
1. 写 markdown 状态行（writeFileSync 覆盖）
2. writePrdMeta（writeFileSync 覆盖 meta.json + index.json）
3. renameSync PRD → archive/
4. renameSync Phase 分组目录 → archive/
5. writePrdMeta(final filePath)（二次覆盖写）
6. rewriteMovedDocLinks PRD + Phase（read→modify→writeFileSync 覆盖）
7. updateIndexEntry（read→split→modify→writeFileSync 覆盖）

任一步在中间失败（如步骤 6 链接重写出错），前序已完成的 rename/覆盖写无法撤销，留下半成品。

**方案选型**：

| 方案 | 原理 | 可行性 | 采用 |
|------|------|--------|------|
| commit-by-rename | 所有改动先写临时位置，最后一步 rename 提交 | **不可行**：meta-store 和 index-sync 都是直接 writeFileSync 覆盖原文件，无"写临时位置"的接口；改造需重写 meta-store + index-sync 的所有写入路径，改造面巨大 | 否 |
| 快照 + 逆序回滚 | 归档前快照可变状态（meta.json / index.md / PRD markdown / Phase markdowns），失败时逆序还原 | **可行**：rename 可逆（renameSync 回去），覆盖写的内容有快照可还原；改造集中在 archivePrdV2 内部，不改变 meta-store/index-sync 接口 | **是** |
| 归档后自检不回滚 | 只在归档后跑 validate，不一致报错让用户手工修 | **最简但非闭环**：用户仍需手动介入，不符合"内化"目标 | 否（作为快照方案的兜底校验层保留，见 §3.2.2） |

**快照内容**（归档前一次性读取，存内存）：
- PRD meta.json 原文 + Phase meta.json 原文列表
- index.md 原文
- PRD markdown 原文 + 各 Phase markdown 原文
- 文件移动映射表 `fileMoves: [{from, to}]`（用于逆序 rename 回去）

**处理逻辑**：
1. 读取快照（上述全部内容）
2. 依次执行步骤 1-7（现状不变）
3. 任一步抛错 → catch 块按 `fileMoves` 逆序 rename 回去 → 用快照内容还原所有被覆盖写的文件 → 抛出原始错误
4. 回滚本身若也失败 → 记录"归档失败且回滚未完成"的明确错误（此时状态已损坏，但错误信息指明损坏位置，可人工修复）

**输出/后置条件**：四要素一致，或完全还原到归档前（回滚成功），或明确报告损坏位置（回滚失败）。

**改造范围**：仅 archivePrdV2 函数体（api-flow.ts:523-655），抽 `withRollback(snapshot, fn)` 包装器。不改变 archivePrdV2 对外签名、不改变 meta-store/index-sync 接口。

#### 3.2.2 归档后自检（快照方案的兜底校验层）

**功能说明**：归档 7 步全部成功后、返回结果前，内部调用一致性校验。校验失败也触发 §3.2.1 的回滚。

**校验内容**：
- validator Check #9（归档文件位置：已归档文件必须在 archive/ 下）
- 四要素断言：meta.filePath 与磁盘文件位置一致、index.md 链接指向新位置、PRD↔Phase 交叉引用可解析

**实现**：复用现有 validator 的 check 函数（不新建校验逻辑），在 archivePrdV2 尾部调用。校验是纯内存判定，无副作用。

#### 3.2.3 slug 生成器与 validator Check #7 规则统一

**现状矛盾**：
- template-engine.ts:28-33 `titleToFileName`：slug 正则 `[^a-z0-9\u4e00-\u9fff]+` **保留中文字符**，生成如 `2026-07-17-归档一致性内化.md`
- validator.ts Check #7 `isValidFileName`：只允许日期前缀 + 小写英文字母/数字/连字符，**拒绝中文**
- 结果：initPrd 生成的文件名被 /sdd-validate 判为不合规（本 PRD 文件名即受害者）

**方案**：统一为 validator Check #7 的规则（纯 ASCII kebab-case）。修改 `titleToFileName` slug 正则为 `[^a-z0-9]+`（去掉 `\u4e00-\u9fff`）。中文标题需先音译或手工指定 slug——initPrd 新增可选 `slug` 参数覆盖自动生成。

**改造范围**：template-engine.ts:28-33（1 行正则）+ api-flow.ts initPrd（新增可选 slug 参数）+ api-types.ts InitOptions。

#### 3.2.4 文档漂移校验

**现状**：/sdd 命令注册清单分散在 4 处，彼此不一致：
- sdd-router.ts:408-444 SUBCOMMANDS 路由表：15 个子命令（权威清单）
- extensions/sdd-extension/index.ts:295-381 registerCommand：15 个 /sdd + 14 个旧别名
- SKILL.md 状态流转命令体系：只声明 9 个（缺 list/why/apply/validate/gate/sync）
- SDD_COMMAND_REMINDER 硬编码字符串：另一份命令列表

**方案**：validator 新增 Check #12，以 sdd-router.ts 的 SUBCOMMANDS 为单一事实源，比对 SKILL.md 和 SDD_COMMAND_REMINDER 中声明的命令清单，缺漏或多余即 warn。

**数据源约定**：sdd-router.ts SUBCOMMANDS 是命令的唯一事实源（代码即真相）。SKILL.md/REMINDER 是"文档"，需向代码对齐。

**实现难点**：validator 需解析 .ts 源码提取 SUBCOMMANDS 键名（静态分析）或维护一份 generated 清单。倾向后者：用 build 脚本从 sdd-router.ts 生成 `commands.generated.json`，validator 读这份文件比对文档。
## 4. 非功能需求

### 4.1 性能要求
- 归档操作（含回滚快照）在百个 Phase 规模下 < 1s

### 4.2 兼容性要求
- `archivePrdV2` 对外签名不变（`reason` 仍 completed|abandoned），内部重构不影响调用方
- 已有归档历史数据不受影响
## 5. 数据需求

### 5.1 数据模型
- 归档快照：`{ prdMeta, phaseMetas[], indexContent, fileMoves: [{from,to}] }`，用于回滚

### 5.2 数据迁移
- 不涉及；历史归档数据保持现状，新归档走原子化路径
## 8. 验收标准

### 8.1 功能验收

- [ ] §3.2.1 归档（completed + abandoned）7 步成功后四要素一致（meta.filePath / 磁盘 / index.md 链接 / PRD↔Phase 交叉引用）
- [ ] §3.2.1 失败注入：模拟步骤 3（rename PRD)/6（链接重写)/7（index 更新）抛错 → 逆序回滚，meta/文件/index 全部还原到归档前
- [ ] §3.2.2 归档尾部自检：Check #9 + 四要素断言通过才返回 pass，失败则回滚
- [ ] §3.2.3 titleToFileName 去掉 `\u4e00-\u9fff` 后，initPrd 生成的文件名通过 Check #7（含中文标题用 slug 参数覆盖）
- [ ] §3.2.4 validator Check #12 检出 SKILL.md 命令清单（9 个）与 sdd-router SUBCOMMANDS（15 个）的漂移
- [ ] 现有 291 测试全过 + 新增失败注入测试（3 条回滚路径）通过

### 8.2 非功能验收

- [ ] 移除私有 skill `sdd-pack-archive-consistency` 后，插件归档正确性不依赖任何外部提示
## 10. 风险与约束

### 10.1 已知风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| 回滚逻辑本身有 bug | 归档失败后状态更乱 | 中 | 失败注入测试覆盖步骤 3/6/7 三条回滚路径；回滚若也失败，明确报告损坏位置（§3.2.1 第 4 点）而非静默 |
| 原子化重构引入新缺陷 | 归档功能回归 | 中 | archivePrdV2 内部重构不改对外签名，保留现有 12 条归档回归测试全绿 |

### 10.2 约束条件

- 不改变 `archivePrdV2` 对外 API 签名
- 与 ADR-016/017/018 状态机语义保持一致
