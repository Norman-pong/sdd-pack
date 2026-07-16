# Phase 001: 基础设施 — meta-store + PRD 基础流转 + OpenSpec 移除

> 状态:已完成 | 创建日期:2026-07-16
> 修改记录:执行 `lore log docs/phase/prd-20260716-001/001-foundation.md`
> 对应 PRD:[sdd-pack PRD (v1.8 强状态流转 + meta.json 事实源)](../../prd/2026-07-16-sdd-pack-v18.md)
> 对齐版本:v1.8.0-alpha(PRD §9)

---

## 1. 阶段目标

### 1.1 阶段定位

v1.8 的地基 Phase。建立 meta.json 事实源基础设施,实现 PRD 生命周期的前半段流转命令(init/review/approve/back),同时移除 OpenSpec 双范式死代码。完成后 PRD 可以走通 Draft → PendingReview → Reviewed 流程,meta.json 成为状态唯一事实源。

### 1.2 阶段目标

| 目标 | 衡量标准 | PRD 功能需求 |
|------|----------|-------------|
| meta-store 模块可用 | readPrdMeta/writePrdMeta/readMetaIndex 等 9 个函数实现 + 测试通过 | F1 |
| /sdd init 创建 PRD | 生成 PRD markdown + meta.json + index.json,全局单例校验生效 | F2 |
| /sdd review 流转 | Draft→PendingReview,validate 通过后才流转,规范语言 warn | F3 |
| /sdd approve 流转 | PendingReview→Reviewed,可选 reviewer 门禁 | F4 |
| /sdd back 回退 | PendingReview→Draft / Draft→PendingReview,非法回退被拒 | F8 |
| doc-parser 状态行生成 | generateStatusLine() 从 meta.json 单向生成 markdown 状态行 | F1 辅助 |
| OpenSpec 双范式移除 | ~1500 行死代码删除,ADR-010/011 标记 Superseded | §1.4 |
| ADR-018 落地 | 强状态流转 + meta.json 事实源决策记录 Accepted | §5 |

### 1.3 完成标准

- [ ] `meta-store.ts` 实现 9 个函数,每个 ≤ 80 行,`bun test` 通过
- [ ] `/sdd init <title>` 创建 PRD,meta.json + index.json 正确生成
- [ ] `/sdd init` 在有活跃 PRD 时 block(全局单例)
- [ ] `/sdd init --force` 仅覆盖空草稿(Draft + transitions 为空)
- [ ] `/sdd review` 草稿→待评审,validate 失败时 block
- [ ] `/sdd review` 对无规范性语言的 PRD 发 warn(不 block)
- [ ] `/sdd approve` 待评审→已评审
- [ ] `/sdd back --to draft` 待评审→草稿
- [ ] `/sdd back --to reviewed` 已评审→待评审 被 block
- [ ] `generateStatusLine()` 从 meta.json 生成 markdown 状态行
- [ ] OpenSpec extension 代码全部删除
- [ ] session_start 不再注入 OpenSpec reminder
- [ ] `.omp-plugin/marketplace.json` 清理 OpenSpec 命令声明
- [ ] ADR-010/011 标记 Superseded
- [ ] ADR-018 记录并 Accepted
- [ ] `.sdd/meta/` 加入 .gitignore
- [ ] `bunx tsc --noEmit` 0 errors

---

## 2. 任务分解

### 2.1 任务清单

| 任务 ID | 任务名称 | 预估 | 依赖 | 状态 |
|---------|---------|------|------|------|
| T01 | ADR-018 撰写并 Accepted | 15 min | — | 完成 |
| T02 | meta-store.ts 类型定义 + 实现 | 40 min | T01 | 完成 |
| T03 | meta-store 测试 | 25 min | T02 | 完成 |
| T04 | api.ts 新增流转函数(init/review/approve/back) | 40 min | T02 | 完成 |
| T05 | doc-parser.ts 新增 generateStatusLine | 15 min | T02 | 完成 |
| T06 | extension /sdd 命令路由骨架 + init/review/approve/back handler | 60 min | T04, T05 | 完成 |
| T07 | .gitignore 加 .sdd/meta/ | 2 min | — | 完成 |
| T08 | OpenSpec extension + CLI 代码删除 | 15 min | — | 完成 |
| T09 | marketplace.json 清理 OpenSpec 声明 | 10 min | T08 | 完成 |
| T10 | session_start 移除 OpenSpec reminder | 5 min | T08 | 完成 |
| T11 | ADR-010/011 标记 Superseded | 5 min | T08 | 完成 |
| T12 | bun test + tsc 验证 | 10 min | T01-T11 | 完成 |

### 2.2 任务详情

#### T01: ADR-018 撰写

**任务描述**: 在 `docs/architecture/decisions.md` 新增 ADR-018,记录 7 个核心决策为 Accepted:
- meta.json 为状态唯一事实源,markdown 状态行降级为展示层
- 全局单例 PRD(docs/prd/ 同时只 1 份活跃)
- `/sdd` 主命令 + 子命令体系替代 14 个分散命令
- tool_call 硬拦截 write/edit 指向 `> 状态` 行
- meta.json 不进 git,clone 后 /sdd sync 重建
- Phase 按 PRD ID 分组目录(吸收 OpenSpec 目录内聚)
- 移除 OpenSpec 双范式(吸收 3 个精华到 SDD)

**涉及文档**: PRD §5

#### T02: meta-store.ts 实现

**任务描述**: 新增 `plugins/sdd-pack/src/cli/lib/meta-store.ts`,实现 PRD §2.2.3 / §2.2.5 定义的类型和函数。

**实现清单**:

| 函数 | 功能 | PRD |
|------|------|-----|
| `readPrdMeta(id): PrdMeta \| null` | 读取单个 PRD meta | F1 |
| `readPhaseMeta(id): PhaseMeta \| null` | 读取单个 Phase meta | F1 |
| `writePrdMeta(meta: PrdMeta): void` | 写入 PRD meta(含 updatedAt) | F1 |
| `writePhaseMeta(meta: PhaseMeta): void` | 写入 Phase meta | F1 |
| `readMetaIndex(): MetaIndex` | 读取全局索引 | F1 |
| `writeMetaIndex(index: MetaIndex): void` | 写入全局索引 | F1 |
| `getActivePrdMeta(): PrdMeta \| null` | 获取当前活跃 PRD meta | F1 |
| `generatePrdId(): string` | 生成 prd-YYYYMMDD-NNN | F1 |
| `generatePhaseId(prdSeq: number): string` | 生成 phs-<prdSeq>-NNN | F1 |
| `rebuildMetaFromMarkdown(): void` | 从 markdown 重建 meta.json | F1 |

**约束**:
- 文件 IO 走 node:fs
- meta.json 目录: `.sdd/meta/prd/` 和 `.sdd/meta/phase/`
- 不调 process.exit / console.*
- 每个函数 ≤ 80 行
- **写入顺序**: 先 markdown(进 git),成功后写 meta.json(本地缓存)

**验收标准**:
- [ ] 9 个函数 + 3 个类型定义(PrdMeta/PhaseMeta/MetaIndex)实现
- [ ] 每个函数 ≤ 80 行
- [ ] `bun test` 通过

**涉及文档**: PRD §2.2.3, §2.2.4, §2.2.5, F1

#### T03: meta-store 测试

**任务描述**: 新增 `plugins/sdd-pack/src/cli/lib/__tests__/meta-store.test.ts`,覆盖:
- 读写 PrdMeta / PhaseMeta / MetaIndex 的基本正确性
- generatePrdId 序号递增
- generatePhaseId 嵌入 PRD seq 防碰撞(phs-001-002 ≠ phs-002-002)
- rebuildMetaFromMarkdown 从 markdown 状态行重建(0 份→null,1 份→active,>1 份→block)

**验收标准**:
- [ ] `bun test` 全部通过
- [ ] 覆盖全局单例的 3 种重建场景(0/1/>1 份非归档 PRD)

#### T04: api.ts 新增流转函数

**任务描述**: 在 `plugins/sdd-pack/src/cli/api.ts` 新增 PRD 前半段流转函数,每个内部遵循 PRD §2.4.3 的 9 步流程。

```typescript
export async function initPrd(opts: InitOptions): Promise<InitResult>
export async function reviewPrd(): Promise<ReviewResult>
export async function approvePrd(opts: ApproveOptions): Promise<ApproveResult>
export async function backPrd(opts: BackOptions): Promise<BackResult>
```

**验收标准**:
- [ ] initPrd 全局单例校验生效(block 有活跃 PRD 时)
- [ ] initPrd --force 仅覆盖空草稿(Draft + transitions 为空)
- [ ] 每个流转函数调用 isTransitionAllowed 校验
- [ ] 非法迁移返回 error,不修改任何文件
- [ ] 写入顺序: 先 markdown 后 meta.json

**涉及文档**: PRD §2.4.3, F2-F4, F8

#### T05: doc-parser.ts 新增 generateStatusLine

**任务描述**: 在 `plugins/sdd-pack/src/cli/lib/doc-parser.ts` 新增:
- `generatePrdStatusLine(meta: PrdMeta): string` — 从 meta.json 生成 `> 状态:` 行
- `generatePhaseStatusLine(meta: PhaseMeta): string` — 从 Phase meta 生成状态行

这些函数被流转命令的"步骤 5: 从 meta.json 单向生成 markdown 状态行"调用。

**验收标准**:
- [ ] 生成的状态行格式与现有 parseStatusLine / parsePhaseStatus 兼容(可逆)
- [ ] ArchiveReason 正确附加(已完成/已中止)

**涉及文档**: PRD §2.4.3 步骤 5, §6.2

#### T06: extension /sdd 路由 + handler

**任务描述**: 重构 `extensions/sdd-extension/index.ts`,注册 1 个 `/sdd` 主命令 + 子命令路由(PRD §2.3.2),实现 init/review/approve/back 4 个 handler。

handler 做三件事:参数解析 → 调 api 函数 → UI 反馈(setWidget + notify)。**无状态,不做校验逻辑**(校验在 api/lib 层)。

**验收标准**:
- [ ] `/sdd` 命令注册成功,未知子命令返回错误提示
- [ ] init/review/approve/back 4 个 handler 正确路由
- [ ] 旧命令(sdd-propose 等)暂时保持独立注册(Phase 003 统一别名兼容)

**涉及文档**: PRD §2.3, F2-F4, F8

#### T08-T11: OpenSpec 移除(可并行)

**删除清单**(PRD §6.3):

| 文件 | 操作 |
|------|------|
| `extensions/openspec-extension/` 整个目录 | 删除 |
| `src/cli/openspec-api.ts` + test | 删除 |
| `src/cli/openspec-api-runner.ts` | 删除 |
| `src/cli/lib/orchestration/openspec-cli.ts` | 删除 |
| `src/cli/lib/orchestration/openspec-project.ts` | 删除 |
| `.omp-plugin/marketplace.json` assets OpenSpec 命令 | 清理 |
| extension session_start OpenSpec reminder 注入 | 删除 |
| ADR-010/011 | 标记 Superseded |
| `plugins/sdd-pack/README.md` 双范式描述 | 改为 SDD 单范式 |

**验收标准**:
- [ ] `grep -r "openspec" plugins/sdd-pack/src/ plugins/sdd-pack/extensions/` 无代码引用
- [ ] `bun test` 通过(无断裂引用)
- [ ] session_start 无 OpenSpec reminder

---

## 3. 里程碑

| 里程碑 | 交付物 | 状态 |
|--------|--------|------|
| M0: meta-store 基础 | meta-store.ts + 测试 + generateStatusLine + .gitignore | 已达成 |
| M1: PRD 基础流转 | api.ts 4 个流转函数 + extension init/review/approve/back handler | 已达成 |
| M2: OpenSpec 清除 | 代码删除 + marketplace 清理 + ADR Superseded | 已达成 |

---

## 4. 风险与问题

### 4.1 阶段风险

| 风险 | 影响 | 概率 | 应对 | PRD 参考 |
|------|------|------|------|---------|
| meta.json 双写竞态(meta 写成功 markdown 写失败) | 高 | 低 | 先写 markdown 后写 meta.json;markdown 失败则回滚;meta 失败则 sync 重建 | §2.2.1 |
| 全局单例 rebuild 逻辑 | 中 | 低 | "docs/prd/ 下唯一非归档 .md = active PRD";0 份→null;>1 份→block | §2.2.1 |
| OpenSpec 移除后拦截器引用断裂 | 中 | 中 | 检查 isGitCommit/isLoreCommit 是否有 OpenSpec extension 副本 | §6.3 |
| Phase 分组目录与 conventions.md §2.2 冲突 | 中 | 高 | ADR-018 同步更新 conventions.md §2.2 命名规则 | §2.2.2 |

### 4.2 待解决问题

| 问题 | 影响范围 | 优先级 | 状态 |
|------|---------|--------|------|
| conventions.md §2.2 "Phase 与 PRD 一一对应"与 PRD 1:N 分组目录冲突 | validator + 命名规范 | 高 | 待解决(T01 ADR-018 同步更新 conventions) |

---

## 5. 验收

### 5.1 验收清单

- [ ] meta-store 9 个函数 + 3 类型实现,bun test 通过
- [ ] /sdd init/review/approve/back 流转正确
- [ ] /sdd init 全局单例 block + --force 仅覆盖空草稿
- [ ] /sdd review validate 失败 block + 规范语言 warn
- [ ] /sdd back 非法回退被拒绝
- [ ] generateStatusLine 可逆兼容
- [ ] OpenSpec 代码全删 + session_start 无 reminder + marketplace 清理
- [ ] ADR-010/011 Superseded + ADR-018 Accepted
- [ ] bunx tsc --noEmit 0 errors

### 5.2 与 PRD §7 验收的对应

本 Phase 覆盖 PRD §7.1 中 /sdd init/review/approve/back 相关验收 + §7.4 回归验收中 OpenSpec 删除项。plan/start/archive/phase/sync/status 在 Phase 002 覆盖,validator 切换 + 门禁嵌入在 Phase 003 覆盖。
