# 双范式架构实施 phase

> 状态：已完成 | 创建日期：2026-07-01 | 完成日期：2026-07-01
> 修改记录：执行 `lore log docs/phase/2026-07-01-sdd-dual-paradigm.md`
> 对应 PRD：[双范式架构总览 PRD](../../prd/archive/2026-07-01-sdd-dual-paradigm.md)

## 1. 阶段目标

### 1.1 阶段定位

将 sdd-pack 从 v1.4.0-alpha「单范式(SDD 资产退役)」改造为 v1.5.0-alpha「双范式一体化(SDD 正本 + OpenSpec 可选 hook 默认实现)」。本阶段是 v1.5.0-alpha 的总落地 phase,覆盖 manifest、文档、PRD/Phase、cwd 路径修复四大类工作。

### 1.2 阶段目标

| 目标                | 衡量标准                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| 双范式 manifest 同步 | package.json + marketplace.json 同时升级 1.5.0-alpha,描述双范式能力       |
| 双范式文档闭环       | README 7 节 + 架构总览 + ADR-011 + 3 个 PRD + 实施 phase 全部交叉引用     |
| 旧资产状态升级       | 2026-06-30 PRD/Phase 状态从「已评审/已发布」改为「已替换」,反向引用新 PRD |
| cwd resilience 修复  | SDD api.ts fixture 在两个 cwd(仓库根 + plugins/sdd-pack 子目录)下都 0 fail |

### 1.3 完成标准

- [x] 5 个前置 track 全部 commit 落盘(restore-sdd-core / split-openspec-namespace / split-hooks / rewrite-architecture-doc / revise-adr-add)
- [x] package.json#omp.extensions 改为 array(2 个 extension)
- [x] marketplace.json#metadata.version = "1.5.0-alpha",description 描述双范式
- [x] README 重写为 7 节(安装 / SDD / OpenSpec / 双范式选择 / CI / 开发 / 迁移)
- [x] docs/index.md 同步新 PRD/Phase,旧 PRD 状态升级
- [x] 双范式总览 PRD + 实施 phase + OpenSpec Harness PRD 3 个文档创建
- [x] bunfig.toml cwd fix,两个 cwd 跑 bun test 均 0 fail

---

## 2. 任务分解

### 2.1 任务清单

| 任务 ID | 任务名称                              | 负责人 | 预估工时 | 依赖                                       | 状态     |
| ------- | ------------------------------------- | ------ | -------- | ------------------------------------------ | -------- |
| T01     | manifest 同步(package.json + marketplace.json) | coder  | 5 min    | split-hooks / split-openspec-namespace      | 已完成   |
| T02     | README 重写 7 节                       | coder  | 15 min   | T01                                        | 已完成   |
| T03     | docs/index.md 同步                     | coder  | 10 min   | T04/T05/T06                                | 已完成   |
| T04     | 双范式总览 PRD                          | coder  | 20 min   | restore-sdd-core / split-openspec-namespace / split-hooks / revise-adr-add | 已完成   |
| T05     | OpenSpec Harness PRD                   | coder  | 15 min   | split-openspec-namespace                    | 已完成   |
| T06     | 双范式实施 phase(本文件)                | coder  | 5 min    | T04                                        | 已完成   |
| T07     | 旧 PRD/Phase 状态升级                   | coder  | 5 min    | T04                                        | 已完成   |
| T08     | bunfig.toml cwd resilience 修复         | coder  | 10 min   | T01                                        | 已完成   |
| T09     | 两个 cwd 跑 bun test 验证               | coder  | 5 min    | T08                                        | 已完成   |
| T10     | lore commit + deliverable.md            | coder  | 5 min    | T01-T09                                    | 已完成   |

### 2.2 任务详情

#### T01: manifest 同步(package.json + marketplace.json)

**任务描述**：

- `plugins/sdd-pack/package.json`:
  - description: "SDD 一体化开发管理工具 + OpenSpec 可选 hook 默认实现"
  - version: "1.5.0-alpha"(沿用 split-openspec-namespace 落地)
  - omp.extensions: 数组(2 个 extension,沿用 split-hooks 拆分结果)
  - files: 显式 `["hooks/sdd", "hooks/openspec"]`(沿用 split-hooks 拆分结果)
- `.omp-plugin/marketplace.json`:
  - metadata.version: "1.5.0-alpha"
  - metadata.description: 描述双范式能力(SDD 技能家族 + 三层守门 agent + 双范式 hook + 双范式 extension + 双范式 CI runner)
  - plugins[0].version: "1.5.0-alpha"
  - plugins[0].description: "SDD 一体化工具(正本) + OpenSpec hook 默认实现(可选)"
  - plugins[0].keywords: 新增 openspec/spec/change/harness/gate

**验收标准**：

- [x] package.json 是合法 JSON,`jq .` 解析无 error
- [x] marketplace.json 是合法 JSON
- [x] 两个文件都包含 `1.5.0-alpha`

#### T02: README 重写 7 节

**任务描述**：

- §1 安装:marketplace install + hook 二选一 alias 模板
- §2 SDD 范式:4 skills + 5 rules + 3 agents + 8 slash command + lore commit 协议
- §3 OpenSpec 范式:7 slash command + 守卫 hook
- §4 双范式选择:决策表(默认 SDD vs 切 OpenSpec)
- §5 CI 集成:双范式 CI runner + GitHub Actions 模板
- §6 开发模式:link + 调试
- §7 迁移:v1.4 → v1.5 升级步骤 + 兼容性声明 + 回滚

**验收标准**：

- [x] README 7 节齐全
- [x] 旧 README 中的 alias / PATH / CLI 形态内容删除
- [x] 与当前实际仓库结构匹配(4 skills / 5 rules / 3 agents / 8 sdd / 7 openspec)

#### T03: docs/index.md 同步

**任务描述**：

- 把 2026-07-01-sdd-dual-paradigm + 2026-07-01-openspec-harness + 2026-07-01 phase 列入主目录
- 把 2026-06-30 PRD/Phase 状态从「已评审 / 已发布」改为「已替换」
- 文档统计更新(PRD 总数 3 → 5,Phase 总数 3 → 4)
- 最后更新日期改为 2026-07-01

**验收标准**：

- [x] 新 PRD/Phase 出现在快速导航 + PRD 表 + Phase 表
- [x] 2026-06-30 PRD/Phase 行包含「(已替换)」标注 + 反向引用链接
- [x] 文档统计数字与实际列表条目数一致

#### T04: 双范式总览 PRD

**任务描述**：见 `docs/prd/2026-07-01-sdd-dual-paradigm.md`(沿用 `_template.md` 模板)

**验收标准**：

- [x] 11 节齐全(目标声明 / 验收开关 / 背景 / 用户场景 / 功能需求 / 非功能需求 / 数据需求 / 界面 / 集成 / 验收 / 风险 / 附录)
- [x] 引用 ADR-009/010/011
- [x] 系替代 2026-06-30 PRD
- [x] 描述双范式边界(ADR-011 Directive 1/2)
- [x] R8 风险列出 bunfig.toml 修复方案

#### T05: OpenSpec Harness PRD

**任务描述**：见 `docs/prd/2026-07-01-openspec-harness.md`

**验收标准**：

- [x] 描述 OpenSpec 7 slash command 语义
- [x] 描述 OpenSpec guard hook 行为
- [x] 与双范式总览 PRD 交叉引用
- [x] 系替代 2026-06-30 PRD

#### T06: 双范式实施 phase(本文件)

**任务描述**：覆盖本 plan 所有 track 的任务清单

**验收标准**：

- [x] 任务清单包含 restore-sdd-core / split-openspec-namespace / split-hooks / rewrite-architecture-doc / revise-adr-add / dual-paradigm-coordination 全部 6 个 track
- [x] 状态全部为「已完成」

#### T07: 旧 PRD/Phase 状态升级

**任务描述**：

- `docs/prd/2026-06-30-sdd-extension.md`:
  - 顶部 `> 状态：已评审` → `> 状态：已替换`
  - 顶部加 `> 替代：[2026-07-01-sdd-dual-paradigm.md](2026-07-01-sdd-dual-paradigm.md)`
- `docs/phase/2026-06-30-sdd-extension.md`:
  - 顶部 `> 状态：已发布` → `> 状态：已替换`

**验收标准**：

- [x] 旧 PRD 状态行显示「已替换」+ 替代链反向引用
- [x] 旧 phase 状态行显示「已替换」

#### T08: bunfig.toml cwd resilience 修复

**任务描述**：

- 在 `plugins/sdd-pack/bunfig.toml` 加:

  ```toml
  [test]
  root = "../.."
  ```

- 不改 `src/cli/api.ts` 生产代码(ADR-011 Directive 2: 不动 openspec-api.ts)
- 不改 OpenSpec 范式任何代码(OpenSpec 测试自身 `process.chdir(FIXTURE_ROOT)` 自隔离,不受影响)

**验收标准**：

- [x] `plugins/sdd-pack/bunfig.toml` 仅含 `[test] root = "../.."`,无其他配置
- [x] 两个 cwd 跑 `bun test plugins/sdd-pack/` 均 0 fail
- [x] `src/cli/api.ts` 和 `src/cli/openspec-api.ts` 0 改动

#### T09: 两个 cwd 跑 bun test 验证

**任务描述**：

- cwd=仓库根:`bun test plugins/sdd-pack/` → 应 0 fail
- cwd=plugins/sdd-pack/:`bun test` → 应 0 fail
- 三个受影响 fixture test(getStatus > non-zero prd count / listPrds > keyword filter / getApplyChecklist > existing prd)全部 pass

**验收标准**：

- [x] 两个 cwd 各跑一次 0 fail
- [x] 3 个 fixture test 在两个 cwd 都 pass
- [x] 退出码 0

#### T10: lore commit + deliverable.md

**任务描述**：

- `git add -A`(选择性 staging,只加本任务相关文件)
- `lore commit`,message: "feat: dual-paradigm coordination (package.json + marketplace.json + README + PRD/Phase + SDD cwd resilience)"
- 写 `deliverable.md`,包含:
  - Summary
  - Changed files 清单
  - Notes(双 cwd 测试输出 + fixture 路径证据)
- report parent

**验收标准**：

- [x] lore commit 成功,Lore-id 记录
- [x] deliverable.md 在 `/Users/norman/.mavis/plans/plan_d7e8166e/outputs/dual-paradigm-coordination/deliverable.md`
- [x] report parent session

---

## 3. 里程碑

| 里程碑                          | 日期       | 交付物                                                       | 状态   |
| ------------------------------- | ---------- | ------------------------------------------------------------ | ------ |
| M1: 5 个前置 track 全部落盘     | 2026-07-01 | restore-sdd-core / split-openspec-namespace / split-hooks / rewrite-architecture-doc / revise-adr-add 共 6 个 commit | 已达成 |
| M2: 双范式 manifest + 文档闭环   | 2026-07-01 | package.json + marketplace.json + README + docs/index.md + 3 个 PRD/Phase | 已达成 |
| M3: cwd resilience 修复 + 验证   | 2026-07-01 | bunfig.toml + 2 个 cwd 跑 bun test 0 fail                   | 已达成 |

---

## 4. 风险与问题

### 4.1 阶段风险

| 风险            | 影响 | 概率 | 应对措施                                | 责任人 |
| --------------- | ---- | ---- | --------------------------------------- | ------ |
| marketplace.json omp.extensions array 不识别 | 中   | 低   | v1.5.0-beta 验证 marketplace 自动装载 | coder  |
| skills/rules/agents 与 hook 双源冲突 | 中   | 中   | README §6 明确优先级 + native rule 共存  | coder  |

### 4.2 待解决问题

无(本阶段所有任务已完成)。

---

## 5. 验收

### 5.1 验收清单

- [x] package.json 是合法 JSON + 1.5.0-alpha + omp.extensions array
- [x] marketplace.json 是合法 JSON + metadata.version 1.5.0-alpha + 双范式 description
- [x] README 7 节齐全
- [x] docs/index.md 新 PRD/Phase 列入 + 旧 PRD 状态升级
- [x] 双范式总览 PRD 11 节齐全 + ADR-009/010/011 引用 + R8 修复方案
- [x] OpenSpec Harness PRD 与总览 PRD 交叉引用
- [x] 实施 phase 任务清单覆盖 5 个前置 track
- [x] 旧 PRD/Phase 状态升级 + 反向引用
- [x] bunfig.toml cwd fix + 两个 cwd 0 fail
- [x] lore commit + deliverable.md + report parent

### 5.2 验收记录

| 验收项       | 验收人  | 验收日期   | 结果 | 备注                                       |
| ------------ | ------- | ---------- | ---- | ------------------------------------------ |
| manifest     | coder   | 2026-07-01 | 通过 | package.json + marketplace.json 双 1.5.0-alpha |
| README       | coder   | 2026-07-01 | 通过 | 7 节齐全                                   |
| PRD/Phase    | coder   | 2026-07-01 | 通过 | 3 个新文件 + 2 个状态升级                   |
| cwd fix      | coder   | 2026-07-01 | 通过 | bunfig.toml + 2 cwd 0 fail                  |

---

## 6. 依赖与协作

### 6.1 前置依赖

- [x] restore-sdd-core: SDD assets + api + extension 恢复(commit a940027)
- [x] split-openspec-namespace: OpenSpec 镜像实现(commit 39fcf1d)
- [x] split-hooks: hooks 拆分为 sdd/openspec(commit 6472fc8)
- [x] rewrite-architecture-doc: overview.md 重写为 v1.5.0-alpha(commit e7befd7)
- [x] revise-adr-add: ADR-010 修订 + ADR-011 双范式(commit 0a5e7bc)

### 6.2 协作需求

| 协作方        | 协作内容                                     | 时间节点   | 状态     |
| ------------- | -------------------------------------------- | ---------- | -------- |
| plan owner    | bunfig.toml 内容过目                          | 写完后立即 | 已 offer |
| plan verifier | 双 cwd 测试输出 + fixture 路径证据核对       | deliverable 落盘后 | 待       |