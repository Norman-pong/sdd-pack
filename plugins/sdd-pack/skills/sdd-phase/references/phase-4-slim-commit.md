# 阶段 4 深度参考:精简与提交(Slim & Commit)

> 加载时机:用户要开始精简 Phase 文档、不确定"删什么"、需要理解子代理审查机制。
> 适配 sdd-phase:本阶段最终交付是 `docs/phase/YYYY-MM-DD-<phase>.md`,并回填对应 PRD 顶部的 `> 对应阶段:` 行。

---

## 1. 为什么精简比丰富更重要

一个常见误解:**"Phase 文档越详细越好"**。

现实是:文档越长,读者越不会读。**信息密度(重要信息 / 总字数)**才是衡量 Phase 文档质量的核心指标。

阶段 4 的目标不是删到"短"——是删到**"每段话都有不可替代的作用"**。

如果一段话删掉后 Phase 还能正常运作,它就**应该被删掉或移到 reference**——不是因为它没用,而是因为它的位置不对。

---

## 2. 合并工作产物到 Phase 文档

阶段 1-3 的工作产物是**分文件**的:

- `problem-list.md`
- `task-breakdown.md`
- `milestone-set.md`

阶段 4 需要**合并**到最终 Phase 文档(sdd-core §4.1 5 必填章节结构):

| 工作产物                          | 合并到 Phase 章节                   |
| --------------------------------- | ----------------------------------- |
| `problem-list.md`(已通过的不修的) | 附录(留痕)                          |
| `problem-list.md`(必修已修的)     | §4 风险与问题                       |
| `task-breakdown.md`               | §2 任务分解                         |
| `milestone-set.md`                | §3 里程碑 + §4 风险 + §6 依赖与协作 |
| 阶段验收设计                      | §5 验收                             |

**操作**:

- 任务详情直接合并到 §2.2
- 里程碑表合并到 §3
- 风险表合并到 §4.1
- 协作需求表合并到 §6.2
- 阶段验收清单合并到 §5.1
- 验收记录表留空(待实施时填)

---

## 3. 删除 4 类内容

### 3.1 删与 PRD 重复的内容

**判断标准**:Phase 文档的段落与 PRD §3/§4 重复。

**移到哪**:不移动——只留"引用"。

**Phase 里留什么**:

- 不是 PRD §3.2.1 的全文,而是 `T001 实现用户注册 API(详见 PRD §3.2.1)`
- 不是 PRD §4.1 的 NFR 阈值,而是"§4.1 性能要求:P99 ≤ 200ms"

**示例**:

```markdown
# 反例:Phase 里不该写

### T001 任务描述

基于 PRD §3.2.1 用户注册功能:
(把 PRD §3.2.1 全文复制过来)
...
完整的接口定义:
POST /api/v1/users
Body: { "email": "string", "password": "string" }
Response: { "id": "uuid", "email": "string" }

# 正例:Phase 里只写

### T001 任务描述

实现用户注册 API。
接口定义详见 PRD §3.2.1。
```

### 3.2 删决策过程

**判断标准**:段落在描述"我们讨论了什么"而非"我们决定做什么任务"。

**移到哪**:`docs/architecture/decisions.md`(由 sdd-prd 阶段 2 维护)

**Phase 里留什么**:

- 不是"为什么用 React 而非 Vue",而是"前端任务基于 React(详见 ADR-001)"
- 不是"任务粒度为什么是 1-3 天",而是任务列表(粒度由阶段 2 决定)

### 3.3 删重复

**判断标准**:同一条信息在 ≥2 个任务详情中重复。

**处理规则**:

- 提取到 Phase §4 NFR 章节(全局阈值)
- 任务详情中只留"对齐 §4.1 性能要求"

### 3.4 删过时引用

**操作**:

```bash
# 在 workspace 根目录执行
grep -rn "见 §\|参见 §\|refer to\|详见" docs/phase/
```

**检查每条**:

- 目标章节/表/文件存在吗?
- 引用到的内容是当前内容吗?

**阶段 4 需要跨文档校验**:

- Phase 任务引用 PRD §X?检查 §X 是否存在
- Phase 引用 ADR-001?检查 ADR-001 是否存在(可能在 `decisions.md`)
- Phase 依赖 `[外部:Y]`?——这是占位,允许暂未实现

---

## 4. 子代理审查机制(sdd-phase 5 项)

### 4.1 5 项审查任务

把以下任务交给子代理,要求它**逐条执行并报告**:

1. **PRD ↔ Phase 一致性检查**
   - 对照 PRD §3 全部 P0/P1 功能,逐条检查 Phase §2 任务是否覆盖
   - 对照 PRD §4 NFR,逐条检查 Phase 任务验收是否对齐
   - 报告:遗漏项列表

2. **任务依赖闭环检查**
   - 扫描 Phase §2 全部任务的"依赖"属性
   - 每个依赖要么是 Phase 内的任务 ID,要么是外部依赖(明确写出)
   - 检查无循环依赖(A→B→A)
   - 报告:悬空依赖/循环依赖列表

3. **验收标准可测性检查**
   - 扫描 Phase §2 全部任务的"验收标准"
   - 每条验收标准必须有客观判定(P99 ≤ 200ms、HTTP 状态码、测试覆盖率)
   - 报告:不可测验收标准列表

4. **里程碑合理性检查**
   - 检查里程碑 3-5 个,均匀分布,无聚集
   - 每个里程碑有日期+交付物+状态
   - 报告:不合理里程碑

5. **sdd-core 一致性检查(sdd-phase 独家)**
   - 对照 sdd-core §4.1 的 5 必填章节,逐条打勾
   - 命名是否符合 sdd-core §2.2(`YYYY-MM-DD-<phase>.md`)
   - 顶部 `> 对应 PRD:` 反向链接是否指向真实 PRD 文件
   - 顶部 `> 状态:` 字段是否存在
   - 报告:sdd-core 合规性评分(0-5)

### 4.2 子代理的作业方式

用 Task 工具启动子代理(`agent_type="general-purpose"`),prompt 模板:

```
请审查以下 Phase 文档的内部一致性和完整性:
- Phase 路径: docs/phase/YYYY-MM-DD-<phase>.md
- 对应 PRD 路径: docs/prd/YYYY-MM-DD-<prd-name>.md

执行 5 项检查:
1. PRD ↔ Phase 一致性:PRD §3 全部 P0/P1 功能,Phase §2 任务是否覆盖?
2. 任务依赖闭环:每个任务的依赖是否存在?无循环?
3. 验收标准可测性:每条验收标准是否客观可判定?
4. 里程碑合理性:3-5 个?均匀分布?有日期+交付物?
5. sdd-core 一致性:对照 sdd-core conventions §4.1 必填章节,逐条打勾

报告每个检查项的结论和建议。不执行修改(只审不改)。
```

**关键约束**:

- `agent_type="general-purpose"`——子代理需要读取文档和写报告
- prompt 要明确说"只审不改"
- 主上下文收到反馈后修复问题,再让子代理复审

---

## 5. PRD 占位回填(本技能独家)

### 5.1 回填条件

只在以下情况同时满足时回填:

- Phase 文档完成阶段 4(子代理审查通过)
- Phase 顶部 `> 对应 PRD:` 反向链接已建立
- 对应 PRD 顶部 `> 对应阶段:` 仍为 `TBD` 占位

### 5.2 回填操作

```bash
# 1. 找到 PRD 顶部 TBD 占位
grep -l "对应阶段: \[TBD" docs/prd/*.md

# 2. 用 sed 替换 TBD 为真实路径
# Before: > 对应阶段: [TBD - 由其他技能补全](../phase/2026-06-23-foundation-setup.md)
# After:  > 对应阶段: [基础搭建阶段](../phase/2026-06-23-foundation-setup.md)
```

**手动操作更安全**(避免 sed 误改其他文件):

```markdown
# 找到 PRD 文件,如 docs/prd/2026-06-23-foundation-setup.md

# 修改顶部

# Before:

> 对应阶段: [TBD - 由其他技能补全](../phase/2026-06-23-foundation-setup.md)

# After:

> 对应阶段: [基础搭建阶段](../phase/2026-06-23-foundation-setup.md)
```

### 5.3 回填后验证

```bash
# 1. 确认 TBD 已清除
grep -rn "对应阶段: \[TBD" docs/prd/ 2>/dev/null
# 期望:无输出

# 2. 确认 Phase 路径真实存在
ls docs/phase/2026-06-23-foundation-setup.md
# 期望:文件存在

# 3. 确认双向引用
grep "对应 PRD" docs/phase/2026-06-23-foundation-setup.md
# 期望:> 对应 PRD:[...](../prd/2026-06-23-foundation-setup.md)

grep "对应阶段" docs/prd/2026-06-23-foundation-setup.md
# 期望:> 对应阶段: [...](../phase/2026-06-23-foundation-setup.md)
```

### 5.4 回填的反模式

- **禁止** 在 Phase 文档未完成阶段 4 时回填 PRD 占位
- **禁止** 直接修改 PRD 顶部而不创建 Phase 文档
- **禁止** 回填后不复查(必须 grep 确认 TBD 已清除)

---

## 6. 提交策略(lore commit)

### 6.1 单次提交原则

"Phase 编写 + PRD 占位回填"是一个**逻辑上不可分割的事件**——必须同时落地,否则双向引用断裂。

### 6.2 lore commit 格式

```bash
echo '{
  "intent": "补全 PRD 阶段占位并产出 Phase 文档",
  "body": "4 阶段工作流完成:自审 PRD 边界 N 个问题,深审拆解 M 个任务,增量识别 K 个里程碑,精简后 Phase 落盘到 docs/phase/YYYY-MM-DD-<phase>.md,并回填对应 PRD 顶部 TBD 占位。",
  "trailers": {
    "Constraint": ["Phase 必含 sdd-core §4.1 的 5 章节 + 顶部 PRD 反向链接"],
    "Rejected": ["独立路径 prd-outputs/phase/ | 与 sdd-core §1.1 冲突"],
    "Directive": ["PRD ↔ Phase 双向引用由 sdd-core §3.3/§4.3 强制"],
    "Confidence": "high",
    "Tested": ["PRD 顶部 TBD 已被替换", "Phase 顶部含 PRD 反向链接", "子代理 5 项审查通过"],
    "Not-tested": []
  }
}' | lore commit
```

---

## 7. 阶段 4 的最终检查

在说"完成"之前,确认:

- [ ] 工作产物已合并到 Phase 主文档(分文件已删除)
- [ ] 所有与 PRD 重复的内容已删(只留引用)
- [ ] 所有决策过程已移入 `docs/architecture/decisions.md`
- [ ] `grep` 确认零悬空引用
- [ ] 子代理 5 项审查完成,反馈已处理
- [ ] **PRD 顶部 TBD 已被替换为真实路径**
- [ ] **Phase 顶部 `> 对应 PRD:` 反向链接已建立**
- [ ] **命名符合 sdd-core §2.2**:`YYYY-MM-DD-<phase>.md`
- [ ] **工作产物已清理**:`docs/phase/.working/<phase>/` 已删除
- [ ] **lore commit 已提交**(不是 `git commit`)
- [ ] 你愿意让一个新来的工程师**只读 Phase + PRD 就开始执行**——如果可以,基线就完成了
