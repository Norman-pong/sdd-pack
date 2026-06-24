# 与 sdd-core 体系的协作边界(sdd-input 必读)

> 本文件是 sdd-input 与 sdd-core/sdd-prd/sdd-phase 协作的**唯一权威说明**。
> 任何边界疑问,先查本文件。

---

## 1. 角色定位

| 技能 | 角色 | 管什么 |
|---|---|---|
| **sdd-core** | 软件开发文档体系管理者 | `docs/` 整个目录结构、命名规范、必填章节、状态机、索引、提交协议 |
| **sdd-input**(本技能) | sdd-core 体系的上游预处理器 | 口语化想法 → 结构化 spec,**只动** `docs/spec/` |
| **sdd-prd** | sdd-core 的 PRD 编写辅助 | spec → 目标驱动 PRD,**只动** `docs/prd/` |
| **sdd-phase** | sdd-core 的 Phase 编写辅助 | PRD → 阶段任务,**只动** `docs/phase/` |

**核心边界**:sdd-input 是 sdd-core 体系内的"上游预处理器"——只产出 spec,不写 PRD/Phase/Architecture。

---

## 2. 文件级边界(权威清单)

| 路径 | sdd-core 管 | sdd-input 管 | sdd-prd 管 | sdd-phase 管 |
|---|---|---|---|---|
| `docs/index.md` | 管 | 不写 | 不写 | 不写 |
| `docs/CONTRIBUTING.md` | 管 | 不写 | 不写 | 不写 |
| `docs/spec/YYYY-MM-DD-<name>.md` | 命名/规范 | **本技能唯一交付** | 不写,但**引用** | 不写 |
| `docs/spec/_template.md` | 项目级 | 不写 | 不写 | 不写 |
| `docs/spec/.working/...` | 不主动建 | **本技能管**(临时目录) | 不写 | 不写 |
| `docs/prd/...` | 命名/规范 | 不写 | **本技能下游** | 不写,但**回填 TBD** |
| `docs/phase/...` | 命名/规范 | 不写 | 不写 | **本技能下游** |
| `docs/architecture/...` | 命名/规范 | 不写 | `decisions.md` 内容 | 不写 |
| `docs/reference/...` | 管 | 不写 | 不写 | 不写 |
| lore commit 提交 | 协议本身 | 走此提交 | 走此提交 | 走此提交 |
| 索引同步 | 场景 1 步骤 6 | 通过 trailer 触发 | 通过 trailer 触发 | 通过 trailer 触发 |

---

## 3. 章节级边界(spec 内容)

spec 由 sdd-input 写,必填 9 章节(本技能模板约定):

| 章节 | 来源 | 强制级别 |
|---|---|---|
| 1. 问题陈述 | 本技能阶段 1 提炼 | 必填 |
| 2. 目标用户 | 本技能阶段 1 提炼 | 必填 |
| 3. v1 功能边界(必做/推迟/不做) | 本技能阶段 2 | 必填 |
| 4. 核心场景 | 本技能阶段 1 提炼 | 必填 |
| 5. 验收标准 | 本技能阶段 4 | 必填 |
| 6. 非功能需求 | 本技能阶段 4 | 必填 |
| 7. 未决假设 | 本技能阶段 3 显性化 | 必填 |
| 8. 选型未决 | 本技能硬约束 | 必填 |
| 9. 参考材料 | 本技能阶段 1 输入 | 必填 |
| 顶部 `> 来源:` 反向链接 | 本技能 | 必填 |
| 顶部 `> 下游消费者:` 标注 | 本技能 | 必填 |

**关键约束**:
- 第 8 章"选型未决"是**本技能硬约束**——任何技术选型都不锁,留给 sdd-prd 阶段 2 质疑
- 第 7 章"未决假设"是**sdd-prd 阶段 2 重点扫描对象**——必须显性化,不能含糊

---

## 4. 命名规范(继承 sdd-core §2.1)

spec 命名:`docs/spec/YYYY-MM-DD-<name>.md`

| 规则 | 示例 |
|---|---|
| 正确 | `2026-06-23-user-auth.md` |
| 错误 | `Spec-001.md`(无日期) |
| 错误 | `2026-6-23-user-auth.md`(日期格式错) |
| 错误 | `User_Auth.md`(下划线大写) |

**与下游一致性**:
- 同一 spec → PRD → Phase 用**相同日期前缀**(sdd-core §2.1 强制)
- spec `2026-06-23-user-auth.md` → PRD `2026-06-23-user-auth.md` → Phase `2026-06-23-...`

---

## 5. 提交协议(继承 docs-update-guard + sdd-core)

**所有变更必须走 `lore commit`**,使用 sdd-core 标准 JSON trailer(参考 sdd-core SKILL.md L96-107):

```json
{
  "intent": "将口语化想法提纯为结构化 spec",
  "body": "...",
  "trailers": {
    "Constraint": ["..."],
    "Rejected": ["..."],
    "Directive": ["..."],
    "Confidence": "high|medium|low",
    "Tested": ["..."],
    "Not-tested": ["..."]
  }
}
```

**禁止**:`git commit` 直接提交(由 `rule://lore-commit-guard` 拦截)。

---

## 6. 触发条件(sdd-input vs sdd-prd vs sdd-core)

| 用户表达 / 场景 | 触发 sdd-input | 触发 sdd-prd | 触发 sdd-core |
|---|---|---|---|
| "我有个想法想做产品" | **触发** | 不触发 | 不触发 |
| "帮我把笔记整理成 spec" | **触发** | 不触发 | 不触发 |
| "从访谈纪要出 spec" | **触发** | 不触发 | 不触发 |
| "已有 spec,提纯 PRD" | 不触发 | **触发** | 不触发 |
| "审视/评审 PRD" | 不触发 | **触发** | 不触发 |
| "初始化 docs" | 不触发 | 不触发 | **触发** |
| "归档 PRD" | 不触发 | **触发** | 不触发 |
| "写 phase" | 不触发 | 不触发(由 sdd-phase 触发) | 不触发 |

**判断规则**:
- 用户说"我有想法/笔记/纪要" → sdd-input
- 用户说"提纯/审视 PRD" → sdd-prd
- 用户说"初始化/管理文档体系" → sdd-core

---

## 7. sdd-input 与 sdd-prd 的接力流程

### 场景 A:分多次调用(推荐)

```
用户: 我有个想法想做成产品
  ↓
sdd-input(4 阶段对话)
  ↓
spec 落盘到 docs/spec/YYYY-MM-DD-<name>.md
  ↓
用户审阅 spec
  ↓
用户: 基于 docs/spec/<name>.md 提纯 PRD
  ↓
sdd-prd(4 阶段自动)
  ↓
PRD 落盘到 docs/prd/<name>.md
  ↓
用户: 基于 PRD 拆解阶段
  ↓
sdd-phase(4 阶段自动)
  ↓
Phase 落盘到 docs/phase/<phase>.md
  ↓
回填 PRD 顶部 > 对应阶段:TBD → 真实路径
```

### 场景 B:端到端(快速)

```
用户: 我有个想法,帮我从想法到阶段任务一气呵成
  ↓
主上下文顺序:
  1. sdd-input 阶段 1-4(每阶段等用户回答)
  2. 用户确认 spec
  3. sdd-prd 阶段 1-4(自动)
  4. 用户确认 PRD
  5. sdd-phase 阶段 1-4(自动)
  ↓
3 个产物全部落盘
```

**风险**:跳过用户对每一步的审阅,可能在下游才发现"做错了"。

### 场景 C:无 spec 的直接 PRD(不走 sdd-input)

```
用户: 已有 spec,提纯 PRD
  ↓
sdd-prd 直接消费 spec(不需 sdd-input)
  ↓
PRD 落盘
```

**适用**:spec 已存在(非 sdd-input 产出,如客户提供的 spec、手写 spec)。

---

## 8. sdd-input 的"越界"与"不越界"

### sdd-input 允许做的事

- 写 `docs/spec/YYYY-MM-DD-<name>.md` 内容
- 创建 `docs/spec/.working/` 临时工作目录
- 写 `docs/spec/.working/<name>/questions-asked.md`、`assumptions.md`(可选)
- 触发 lore commit
- 提示用户调用 sdd-prd 接力

### sdd-input 禁止做的事

- 写 `docs/index.md`(由 sdd-core 维护)
- 写 `docs/CONTRIBUTING.md`(由 sdd-core 维护)
- 写 `docs/prd/...`(由 sdd-prd 写)
- 写 `docs/phase/...`(由 sdd-phase 写)
- 写 `docs/architecture/...`(由 sdd-core / sdd-prd 维护)
- 写 `docs/reference/...`(sdd-core 管)
- 改 `docs/spec/_template.md`(项目级模板,改它需团队决议)
- 跳过 lore commit 直接 `git commit`
- **任何具体技术选型**——这是硬约束,违反就是越界

---

## 9. 边界冲突的处理

如果 sdd-input 与 sdd-core / sdd-prd 在某点上**似乎**冲突:

1. **先查本文件**——大多数冲突本文件已明确说明
2. **查 sdd-core SKILL.md / conventions.md**——确认 sdd-core 实际约束
3. **查 sdd-prd/SKILL.md** 的 `references/sdd-collaboration.md`——确认 sdd-prd 边界
4. **查 docs-update-guard**——确认提交时 doc 更新规则
5. **如果仍然模糊**——停手,向用户说明冲突点,请求决策

**禁止**:在模糊时单方面决策、编造规则、或破坏 sdd-core / sdd-prd 现有约束。

---

## 10. 与 docs-update-guard 的配合

`docs-update-guard` 在 `git commit` / `lore commit` 前拦截(条件 L3)。

sdd-input 的所有提交都触发此规则:
- sdd-input 自检:本次提交是否含 spec 变更?
- 若含 → 已在 sdd-input 工作流中处理(阶段 4 交付)
- 若无 → 提交可能不该发生(sdd-input 不该产生非 spec 变更)

**操作建议**:
- 触发 sdd-input 时,先确认 commit 内容是 spec 相关
- 提交应只含 spec 新建,不含 PRD/Phase 变更(sdd-prd / sdd-phase 各自提交)

---

## 11. 总结:一句话边界

> **sdd-core 是文档体系的地基,sdd-input 在地基上做"口语化→spec"预处理,sdd-prd 接力做"spec→PRD",sdd-phase 最后做"PRD→阶段任务"。**
> sdd-input 不替代 sdd-core,不与 sdd-prd / sdd-phase 平行,**只填补"想法"到"结构化 spec"的空白**。
> 当你不确定一个动作归谁——查本文件,查 sdd-core,查 sdd-prd,然后才动手。
