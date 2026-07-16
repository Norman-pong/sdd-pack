# Phase 002: 命令体系 — 剩余流转命令 + tool_call 硬拦截

> 状态:已完成 | 创建日期:2026-07-16
> 修改记录:执行 `lore log docs/phase/prd-20260716-001/002-commands.md`
> 对应 PRD:[sdd-pack PRD (v1.8 强状态流转 + meta.json 事实源)](../../prd/2026-07-16-sdd-pack-v18.md)
> 对齐版本:v1.8.0-beta(PRD §9)
> 前置依赖:[Phase 001 基础设施](001-foundation.md) 全部完成

---

## 1. 阶段目标

### 1.1 阶段定位

在 Phase 001 的 meta-store 基础上,实现 PRD 后半段流转命令(plan/start/archive)+ Phase 流转命令(phase start/complete/abandon)+ 状态面板(status)+ tool_call 硬拦截。完成后 PRD 全链路 Draft→...→Archived 可走通,Phase 3 态流转可用,状态行篡改被硬拦截。

### 1.2 阶段目标

| 目标 | 衡量标准 | PRD 功能需求 |
|------|----------|-------------|
| /sdd plan 流转 | Reviewed→Planned,Phase ID 关联正确,Phase 分组目录创建 | F5 |
| /sdd start 流转 | Planned→InProgress,至少 1 Phase InProgress 检查 | F6 |
| /sdd archive 流转 | completed 走门禁 / abandoned 无门禁,文件移入 archive/ | F7 |
| /sdd phase 流转 | start/complete/abandon 3 态走通 | F9 |
| /sdd status 面板 | 显示活跃 PRD/Phase 状态 + 可执行操作 | F11 |
| tool_call 硬拦截 | write/edit 指向 `> 状态` 行被 block,正文不误报 | §2.6 |

### 1.3 完成标准

- [ ] `/sdd plan --phase <title>` 已评审→已规划任务,Phase 文件创建在 `docs/phase/<prd-id>/<seq>-<name>.md`
- [ ] Phase meta.json 的 parentId 正确关联 PRD
- [ ] PRD meta.json 的 phaseIds 追加,nextPhaseSeq 递增
- [ ] `/sdd start` 已规划任务→进行中
- [ ] `/sdd archive --reason completed` 归档,门禁全通过,文件移入 archive/
- [ ] `/sdd archive --reason abandoned` 归档,无门禁
- [ ] `/sdd phase start` 未开始→进行中
- [ ] `/sdd phase complete` 进行中→已完成(gate lint + test)
- [ ] `/sdd phase abandon` →已废弃
- [ ] `/sdd phase complete` 全部完成后提示可 `/sdd archive`
- [ ] `/sdd status` 显示完整状态面板
- [ ] write 指向 docs/prd/ 含 `> 状态` 行 → block
- [ ] edit 指向 docs/phase/ body 含 `+> 状态` 前缀 → block
- [ ] edit 修改正文(含"状态"一词但不匹配 `> 状态` 前缀)→ 放行
- [ ] docs/index.md 不受拦截保护

---

## 2. 任务分解

### 2.1 任务清单

| 任务 ID | 任务名称 | 预估 | 依赖 | 状态 |
|---------|---------|------|------|------|
| T01 | api.ts 新增 planPrd/startPrd 函数 | 30 min | P001-T04 | 未开始 |
| T02 | api.ts 新增 archivePrdV2 函数(completed+abandoned) | 30 min | T01 | 未开始 |
| T03 | api.ts 新增 phaseTransition 函数(start/complete/abandon) | 30 min | T01 | 未开始 |
| T04 | api.ts 新增 getStatusPanel 函数 | 20 min | T01 | 未开始 |
| T05 | extension /sdd plan handler | 25 min | T01 | 未开始 |
| T06 | extension /sdd start handler | 15 min | T05 | 未开始 |
| T07 | extension /sdd archive handler | 25 min | T02 | 未开始 |
| T08 | extension /sdd phase handler(start/complete/abandon) | 25 min | T03 | 未开始 |
| T09 | extension /sdd status handler | 15 min | T04 | 未开始 |
| T10 | tool_call 硬拦截状态行实现 | 25 min | P001-T06 | 未开始 |
| T11 | bun test + tsc 验证 | 10 min | T01-T10 | 未开始 |

### 2.2 任务详情

#### T01: api.ts planPrd/startPrd

**任务描述**: 新增流转函数:

```typescript
export async function planPrd(opts: PlanOptions): Promise<PlanResult>
export async function startPrd(): Promise<StartResult>
```

**planPrd 流程**(PRD F5):
1. 校验 status === Reviewed
2. 如 `--phase <title>`:生成 Phase ID(phs-<prdSeq>-NNN)→ 创建 Phase markdown(`docs/phase/<prd-id>/<seq>-<name>.md`)→ 创建 Phase meta.json(parentId=PRD ID, status=NotStarted)→ PRD meta phaseIds 追加
3. 如 `--link <phase-id>`:关联已有 Phase
4. 更新 PRD meta: status=Planned
5. 生成 markdown 状态行(PRD + Phase)

**startPrd 流程**(PRD F6):
1. 校验 status === Planned
2. 检查至少 1 Phase InProgress(否则 warn)
3. 更新 meta: status=InProgress

**验收标准**:
- [ ] Phase 文件创建在 `docs/phase/<prd-id>/` 分组目录
- [ ] Phase ID 嵌入 PRD seq(phs-001-002),全局唯一
- [ ] parentId 正确关联

**涉及文档**: PRD F5, F6, §2.2.2

#### T02: api.ts archivePrdV2

**任务描述**:

```typescript
export async function archivePrdV2(opts: ArchiveOptionsV2): Promise<ArchiveResultV2>
```

**流程**(PRD F7):
1. reason === completed:检查所有 Phase Completed/Abandoned → gate lint + test + reviewer
2. reason === abandoned:无门禁
3. 更新 meta: status=Archived, archiveReason=reason
4. reason === completed:移动文件到 archive/
5. 更新 index.json: activePrdId=null

**验收标准**:
- [ ] completed 归档时门禁失败 → block
- [ ] 归档后 activePrdId=null
- [ ] 文件正确移入 archive/

**涉及文档**: PRD F7, §2.5

#### T03: api.ts phaseTransition

**任务描述**:

```typescript
export async function phaseTransition(opts: PhaseTransitionOptions): Promise<PhaseTransitionResult>
```

| 子命令 | 流转 | 门禁 |
|--------|------|------|
| start | NotStarted→InProgress | 无 |
| complete | InProgress→Completed | gate lint + test |
| abandon | NotStarted or InProgress→Abandoned | 无 |

**complete 额外逻辑**: 检查全部 Phase Completed → 提示可 `/sdd archive --reason completed`

**涉及文档**: PRD F9

#### T10: tool_call 硬拦截

**任务描述**: 在 extension `pi.on("tool_call")` 新增状态行写入拦截(PRD §2.6)。

**检测逻辑**(分层精确检测,PRD §2.6.2):
- `isPrdOrPhaseFile(path)`: 匹配 `/prd/` 或 `/phase/` 路径
- `touchesStatusLine(input, toolName)`:
  - write 工具: content 含 `^>\s*状态[：:]` 行 → block
  - edit 工具: body 行匹配 `^>\s*状态[：:]` 前缀 → block;body 只含正文"状态"一词 → 放行

**为何不用关键字匹配**: PRD/Phase 正文高频出现"状态"一词("检查设备状态""状态码"),方案 A(body 含"状态"就 block)误报率不可接受(PRD §2.6.2 Q4 已解决)。

**验收标准**:
- [ ] write 指向 docs/prd/ 含 `> 状态` 行 → block
- [ ] edit 指向 docs/phase/ body 含 `+> 状态` 前缀 → block
- [ ] edit 修改正文(含"状态"一词但不匹配 `> 状态` 前缀)→ 放行
- [ ] docs/index.md 不受拦截(isPrdOrPhaseFile 不匹配)
- [ ] 拦截消息列出可用 /sdd 命令清单

**涉及文档**: PRD §2.6.1, §2.6.2

---

## 3. 里程碑

| 里程碑 | 交付物 | 状态 |
|--------|--------|------|
| M0: 后半段流转 | plan/start/archive + phase 流转 + status 面板 | 未达成 |
| M1: 硬拦截 | tool_call 状态行 block 生效 | 未达成 |

---

## 4. 风险与问题

### 4.1 阶段风险

| 风险 | 影响 | 概率 | 应对 | PRD 参考 |
|------|------|------|------|---------|
| tool_call edit 误报(正文含"状态") | 低 | 低 | 分层精确检测: edit body 匹配 `> 状态` 前缀才 block | §2.6.2 |
| Phase 分组目录归档时移动逻辑 | 中 | 中 | 归档 PRD 时整个 `prd-<id>/` 子目录移入 `archive/`,原子操作 | §2.2.2 |
| archive --reason completed 门禁编排 | 中 | 低 | gate lint → gate test → reviewer 顺序执行,任一失败 block | §2.5 |

---

## 5. 验收

### 5.1 验收清单

- [ ] /sdd plan/start/archive 全链路走通
- [ ] /sdd phase start/complete/abandon 流转正确
- [ ] /sdd status 状态面板完整
- [ ] tool_call 硬拦截: 状态行 block + 正文放行
- [ ] Phase 文件在分组目录 `docs/phase/<prd-id>/` 下
- [ ] 归档后文件正确移入 archive/

### 5.2 与 PRD §8 验收的对应

本 Phase 覆盖 PRD §8.1 中 plan/start/archive/phase/status 相关验收 + §8.2 门禁验收中 tool_call 拦截项。门禁嵌入流转的深度集成在 Phase 003 覆盖。
