# Phase 003: 门禁集成 + 迁移 + 收尾

> 状态:已完成 | 创建日期:2026-07-16
> 修改记录:执行 `lore log docs/phase/prd-20260716-001/003-gate-integration.md`
> 对应 PRD:[sdd-pack PRD (v1.8 强状态流转 + meta.json 事实源)](../../prd/2026-07-16-sdd-pack-v18.md)
> 对齐版本:v1.8.0 正式版(PRD §9)
> 前置依赖:[Phase 002 命令体系](002-commands.md) 全部完成

---

## 1. 阶段目标

### 1.1 阶段定位

将门禁深度嵌入流转流程(而非独立 /sdd-gate-* 命令),完成 validator 事实源切换,实现 F14 命令提示词三层注入,旧命令别名兼容,存量迁移,最终全链路测试 + 发布。完成后 v1.8.0 正式可用。

### 1.2 阶段目标

| 目标 | 衡量标准 | PRD 功能需求 |
|------|----------|-------------|
| 门禁嵌入流转 | review/approve/archive/phase complete 自动触发对应 gate | §2.5 |
| validator 事实源切换 | checkStateMachine 改读 meta.json,fallback markdown + warn | F13 |
| 全局单例校验 | Check #11: docs/prd/ >1 份非归档 → block | F13 |
| /sdd sync | meta↔markdown 检测不一致 + --fix 修复 + rebuild | F10 |
| 辅助命令归并 | list/why/apply/gate 归入 /sdd 体系 | §2.3.1 |
| 旧命令别名兼容 | 14 个旧命令 deprecated warning + 转发 | F12 |
| F14 命令提示词注入 | session_start + skill + 拦截消息三层覆盖 | F14 |
| 存量迁移 | /sdd sync 重建当前 PRD meta.json | §4 |

### 1.3 完成标准

- [ ] `/sdd review` 内部自动触发 validate
- [ ] `/sdd approve` 可选触发 reviewer(gate.json 配置驱动)
- [ ] `/sdd archive --reason completed` 自动触发 gate lint + test + reviewer
- [ ] `/sdd phase complete` 自动触发 gate lint + test
- [ ] `/sdd gate <stage>` 保留为逃生通道
- [ ] validator checkStateMachine 优先读 meta.json,缺失时 fallback markdown + warn
- [ ] validator Check #11 全局单例: docs/prd/ >1 份非归档 → block
- [ ] `/sdd sync` 检测 meta↔markdown 不一致
- [ ] `/sdd sync --fix` 从 meta 修复 markdown
- [ ] `/sdd sync` meta.json 缺失时从 markdown 重建
- [ ] `/sdd list/why/apply/gate` 归入 /sdd 体系
- [ ] 旧 14 个 /sdd-* 命令 deprecated warning + 转发到 /sdd 子命令
- [ ] session_start 注入 SDD_COMMAND_REMINDER(完整 /sdd 命令清单)
- [ ] sdd-core SKILL.md description 含状态流转触发词
- [ ] sdd-core SKILL.md 正文含"状态流转命令体系"章节
- [ ] 存量迁移: 当前 PRD /sdd sync 重建 meta.json 成功
- [ ] `/sdd status` 能正确显示活跃 PRD 状态
- [ ] `/sdd validate` 通过
- [ ] `bun test` 全部通过
- [ ] `bunx tsc --noEmit` 0 errors
- [ ] lore commit 流程不受影响(回归)
- [ ] Goal Mode 续跑中 tool_call 拦截正常生效(回归)

---

## 2. 任务分解

### 2.1 任务清单

| 任务 ID | 任务名称 | 预估 | 依赖 | 状态 |
|---------|---------|------|------|------|
| T01 | 门禁嵌入流转命令(review/approve/archive/phase complete) | 30 min | P002-T07, P002-T08 | 已完成 |
| T02 | validator 事实源切换(checkStateMachine 改读 meta.json) | 25 min | P001-T02 | 已完成 |
| T03 | validator 新增 Check #11 全局单例校验 | 10 min | T02 | 已完成 |
| T04 | api.ts 新增 syncMeta/rebuildMeta 函数 | 30 min | P001-T05 | 已完成 |
| T05 | extension /sdd sync handler | 20 min | T04 | 已完成 |
| T06 | extension /sdd list/why/apply/gate handler(归入 /sdd) | 20 min | P001-T06 | 已完成 |
| T07 | 旧命令别名兼容(deprecated warning + 转发) | 20 min | P001-T06 | 已完成 |
| T08 | F14 session_start 注入 SDD_COMMAND_REMINDER | 15 min | P001-T06 | 已完成 |
| T09 | F14 sdd-core SKILL.md 更新(触发词 + 命令体系章节) | 15 min | T08 | 已完成 |
| T10 | 存量迁移(当前 PRD /sdd sync 重建 meta.json) | 15 min | T05 | 已完成 |
| T11 | 全链路 bun test + tsc 验证 | 15 min | T01-T10 | 已完成 |
| T12 | docs/index.md + README.md + marketplace.json version 同步 | 15 min | T11 | 已完成 |

### 2.2 任务详情

#### T01: 门禁嵌入流转

**任务描述**: 流转命令内部按类型自动触发对应门禁(PRD §2.5):

| 流转命令 | 嵌入门禁 |
|----------|---------|
| `/sdd review` | validate(文档格式校验) |
| `/sdd approve` | reviewer agent(可选,gate.json `reviewOnApprove: true` 驱动) |
| `/sdd plan` | validate(Phase 引用 + ID 关联校验) |
| `/sdd archive --reason completed` | gate lint + gate test + reviewer |
| `/sdd phase complete` | gate lint + gate test |

保留 `/sdd gate <stage>` 子命令作为逃生通道(手动补跑某步)。

**验收标准**:
- [ ] 门禁失败时流转被 block
- [ ] approve reviewer 可选(gate.json 配置驱动)

**涉及文档**: PRD §2.5

#### T02-T03: validator 事实源切换

**任务描述**: `validator.ts` 的 `checkStateMachine`(Check #5)从解析 markdown 状态行改为读 meta.json(PRD F13):

```typescript
// 优先读 meta.json
const meta = readPrdMeta(metaId);
const status = meta?.status ?? parseFromMarkdownFallback(content);
// fallback 时 warn
```

新增 Check #11 全局单例校验: 扫描 `docs/prd/` 下非归档 .md(排除 archive/),>1 份则 block。

**验收标准**:
- [ ] meta.json 存在时 validator 从 meta 读状态
- [ ] meta.json 缺失时 fallback markdown + warn
- [ ] 全局单例违反时 block

**涉及文档**: PRD F13

#### T04-T05: /sdd sync

**任务描述**: api.ts 新增:

```typescript
export async function syncMeta(opts: SyncOptions): Promise<SyncResult>
export async function rebuildMeta(): Promise<RebuildResult>
```

**syncMeta 流程**(PRD F10):
1. 遍历所有 PRD/Phase 的 meta.json 和 markdown
2. 对比 status 不一致 → report
3. `--fix`: 从 meta.json 生成 markdown 状态行覆盖
4. meta.json 缺失: rebuildMetaFromMarkdown

**rebuildMeta 流程**(PRD §4):
1. 扫描 docs/prd/ 和 docs/phase/ 下所有非归档文件
2. 对每个文件: 检查 .sdd/meta/ 下是否有对应 meta.json
3. 如无: 从 markdown 状态行重建
4. 输出迁移报告

**验收标准**:
- [ ] 不一致检测正确
- [ ] --fix 从 meta 覆盖 markdown
- [ ] meta 缺失时从 markdown 重建

**涉及文档**: PRD F10, §4

#### T06: 辅助命令归并

**任务描述**: 将现有独立命令归入 /sdd 体系(PRD §2.3.1 辅助子命令):

| 子命令 | 来源 | 功能 |
|--------|------|------|
| /sdd list | /sdd-list | 文档列表(支持 --status 过滤) |
| /sdd why | /sdd-why | 决策溯源 |
| /sdd apply | /sdd-apply | PRD 实施 checklist |
| /sdd validate | /sdd-validate | 文档校验(现有功能保留) |
| /sdd gate | /sdd-gate-* | 门禁流水线(lint/test/review/precommit/commit) |

handler 复用现有 api.ts 函数(listPrds/getWhy/getApplyChecklist/validateDocs/gate-runner)。

**涉及文档**: PRD §2.3.1

#### T07: 旧命令别名兼容

**任务描述**: 旧 14 个 `/sdd-*` 命令保留为别名(handler 转发到 `/sdd <subcommand>` + deprecated warning),v1.8.0 引入,v1.10.0 删除(PRD F12)。

| 旧命令 | 新命令 |
|--------|--------|
| /sdd-propose | /sdd init |
| /sdd-archive | /sdd archive |
| /sdd-status | /sdd status |
| /sdd-list | /sdd list |
| /sdd-validate | /sdd validate |
| /sdd-why | /sdd why |
| /sdd-apply | /sdd apply |
| /sdd-migrate | 废弃(堆叠格式不再支持) |
| /sdd-gate-lint | /sdd gate lint |
| /sdd-gate-test | /sdd gate test |
| /sdd-gate-review | /sdd gate review |
| /sdd-gate-precommit | /sdd gate precommit |
| /sdd-gate-commit | /sdd gate commit |
| /sdd-archive-phase | /sdd phase complete/abandon |

**验收标准**:
- [ ] 旧命令仍可执行(转发到新命令)
- [ ] 执行时显示 deprecation warning

**涉及文档**: PRD F12

#### T08-T09: F14 命令提示词注入

**层 1**(T08): extension `pi.on("session_start")` 注入 SDD_COMMAND_REMINDER(PRD F14):

```typescript
const SDD_COMMAND_REMINDER = [
  "📜 SDD 文档状态流转协议(始终生效,sdd-pack extension 注入):",
  "",
  "文档状态变更必须通过 /sdd 命令,禁止直接 edit 状态行:",
  "  /sdd init <title>                        # 创建新 PRD(草稿)",
  "  /sdd review                              # 草稿 -> 待评审",
  "  /sdd approve                             # 待评审 -> 已评审",
  "  /sdd plan --phase <title>                # 已评审 -> 已规划任务",
  "  /sdd start                               # 已规划任务 -> 进行中",
  "  /sdd archive --reason <completed|abandoned>",
  "  /sdd back --to <draft|pending>           # 回退",
  "  /sdd phase <start|complete|abandon>      # Phase 流转",
  "  /sdd status                              # 状态面板",
  "  /sdd sync [--fix]                        # meta↔markdown 同步",
  "",
  "状态行篡改会被 tool_call 硬拦截(block)。",
].join("\n");
```

**层 2**(T09): sdd-core SKILL.md 更新:
- description 新增触发词: "状态流转"、"PRD 评审"、"归档 PRD"、"phase 流转"、"/sdd"
- 正文新增"状态流转命令体系"章节(引用 session_start 注入的命令清单)

**层 3**: 拦截消息内联引导(已在 Phase 002 T10 实现)。

**涉及文档**: PRD F14

#### T10: 存量迁移

**任务描述**: 对当前仓库执行 /sdd sync,重建 meta.json(PRD §4):
- 活跃 PRD(v1.8 PRD)→ 重建 meta.json(status 从 markdown 状态行读取)
- 归档 PRD/Phase → 不动(归档是终态)
- 验证: /sdd status 能正确显示 + /sdd validate 通过

**验收标准**:
- [ ] .sdd/meta/index.json 的 activePrdId 指向正确
- [ ] /sdd status 显示活跃 PRD
- [ ] /sdd validate 通过

**涉及文档**: PRD §4

---

## 3. 里程碑

| 里程碑 | 交付物 | 状态 |
|--------|--------|------|
| M0: 门禁 + validator | 门禁嵌入流转 + validator 事实源切换 + Check #11 | 未达成 |
| M1: sync + 命令归并 | /sdd sync + list/why/apply/gate 归并 + 别名兼容 | 未达成 |
| M2: 注入 + 迁移 + 发布 | F14 三层注入 + 存量迁移 + 全链路测试 | 未达成 |

---

## 4. 风险与问题

### 4.1 阶段风险

| 风险 | 影响 | 概率 | 应对 | PRD 参考 |
|------|------|------|------|---------|
| validator 切换后旧 markdown 无 meta.json | 中 | 高 | fallback 策略: meta.json 缺失时读 markdown + warn; /sdd sync 重建 | F13 |
| 旧 api.ts 函数与新流转函数共存 | 中 | 中 | 旧函数标记 deprecated,别名转发;Phase 003 后可清理 | §6.2 |
| F14 session_start 注入消息过长 | 低 | 低 | SDD_COMMAND_REMINDER 精简为命令清单 + 关键约束 | F14 |
| Goal Mode 续跑 commit 被拦截卡住 | 中 | 低 | 设计意图非 bug: agent 读拦截引导走 /sdd gate | §10.3 |

### 4.2 待解决问题

| 问题 | 影响范围 | 优先级 | 状态 |
|------|---------|--------|------|
| 旧 api.ts 函数(proposePrd/archivePrd)的废弃策略 | api.ts 结构 | 中 | 待解决(T07 别名兼容时标记 deprecated) |

---

## 5. 验收

### 5.1 验收清单

**功能验收**:
- [x] 门禁嵌入流转(review/approve/archive/phase complete) — api-flow.ts 已确认
- [x] /sdd sync 检测不一致 + --fix 修复 + rebuild — syncMeta() 实现
- [x] /sdd list/why/apply/gate/validate 归入体系 — sdd-router.ts handlers
- [x] 旧命令别名 deprecated warning — deprecatedNotify 每次执行
- [x] F14 三层注入: session_start + skill + 拦截引导 — index.ts SDD_COMMAND_REMINDER
- [x] 存量迁移成功 — activePrdId=null(PRD已归档), .sdd/meta/ 已重建

**技术验收**(PRD §8.3):
- [x] bun test 全部通过(含 meta-store 测试) — 279 pass, 0 fail
- [x] bunx tsc --noEmit 0 errors
- [x] /sdd sync 迁移当前活跃 PRD 成功(activePrdId=null, PRD已归档)
- [x] .sdd/meta/ 在 .gitignore 中
- [x] 旧命令别名兼容(deprecated warning 每次执行显示)

**回归验收**(PRD §8.4):
- [x] lore commit 流程不受影响
- [x] Goal Mode 续跑中 tool_call 拦截正常生效

### 5.2 与 PRD §8 验收的对应

本 Phase 覆盖 PRD §8.1 中 sync/list/why/apply/gate + F14 注入 + 别名兼容验收 + §8.2 门禁验收中门禁嵌入流转项 + §8.3 全部技术验收 + §8.4 全部回归验收。是 v1.8 的收尾 Phase。
