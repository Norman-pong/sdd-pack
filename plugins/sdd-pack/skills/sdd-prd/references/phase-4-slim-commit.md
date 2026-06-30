# 阶段 4 深度参考:精简与提交(Slim & Commit)

> 加载时机:用户要开始精简文档、不确定"删什么"、需要理解子代理审查机制。
> 适配 sdd-prd:本阶段最终交付是 `docs/prd/YYYY-MM-DD-<name>.md`,ADR 集合并入 `docs/architecture/decisions.md`。

---

## 1. 为什么精简比丰富更重要

一个常见误解:**"文档越长越详细越好。"**

现实是:文档越长,读者越不会读。信息密度(重要信息 / 总字数)才是衡量文档质量的核心指标。

阶段 4 的目标不是删→"短"——是删→**"每段话都有不可替代的作用"**。

如果一段话删掉后文档还能正常运作,它就**应该被删掉或移→ reference**——不是因为它没用,而是因为它的位置不对。

---

## 2. 删除 4 类内容的实操技术

### 2.1 删具体代码

**判断标准**:这段内容在执行时**会发生变化**(字段名会改、参数会增、配置会调)。

**移→哪**(sdd-prd 专属路径):

- 完整 Schema → `docs/architecture/api-reference.md`
- 配置文件 → `docs/architecture/config-reference.md`
- 部署脚本 → `docs/architecture/deployment-guide.md`

**PRD 里留什么**:

- 不是"API Schema 的完整内容",而是"API Schema 的位置"
- 不是"配置文件的每项说明",而是"配置文件的路径和设计理念"

**示例**:

```markdown
# 反例:PRD 里不该写

## 用户 API

POST /api/v1/users
Body: { "name": "string (required)", "email": "string (required)", ... }
Response: { "id": "uuid", "name": "string", ... }

# 正例:PRD 里只写

完整 API Schema → `docs/architecture/api-reference.md`
```

### 2.2 删决策过程

**判断标准**:段落在描述"我们讨论了什么"而非"我们决定了什么"。

**移→哪**:`docs/architecture/decisions.md`(ADR 集)

**PRD 里留什么**:

- 不是"为什么选 A 不选 B",而是"我们用 A"
- 读者不需要重新做一遍你的决策——他们需要执行你的决策

### 2.3 删重复

**判断标准**:同一条信息在 ≥2 个地方出现,且内容因复制粘贴而可能不同步。

**处理规则**:

- 保留最权威的那处(通常是"定义处"而非"引用处")
- 其余用引用代替(短引用:"参见 §X";跨文档引用:"详见 `docs/architecture/decisions.md#ADR-003`")

**不要做的事**:

- 不要"为了读者方便"保留重复——方便的代价是"改一处忘改另一处"
- 不要"摘要 + 正文"都保留——要么摘要+引用,要么只有正文

### 2.4 删过时引用

**操作**:

```bash
# 在 workspace 根目录执行
grep -rn "见 §\|参见 §\|refer to\|详见" docs/
```

**检查每条**:

- 目标章节/表/文件存在吗?
- 引用→的内容是当前内容吗?还是旧版本?

**在阶段 4 需要跨文档校验**:

- PRD 引用了 `decisions.md` 的 ADR-003?检查 ADR-003 是否存在、状态是否已更新
- PRD 引用了 `phase/2026-06-23-xxx.md`?——这是占位,允许存在
- 任一文档改了 → grep 全部 → 确认所有引用都同步

---

## 3. 子代理审查机制(sdd-prd 5 项)

### 3.1 为什么需要子代理

主上下文有**认知偏差**:你花了几个小时写这份文档,大脑已经形成了"它是对的"的预期。主上下文再审一遍,很大概率会**漏掉**矛盾——不是不够认真,而是认知框架已经定了。

子代理没有这个偏差——它第一次看→文档,是**干净视角**。

### 3.2 子代理的 5 项审查任务(sdd-prd 强化)

把以下任务交给子代理,要求它**逐条执行并报告**:

1. **内部一致性检查**
   - 通读 PRD 和 `decisions.md`
   - 交叉对比,找矛盾(类似阶段 1 的逻辑)
   - 报告:不一致的具体位置 + 建议修复

2. **过时引用扫描**
   - `grep` 所有章节引用、文件引用、ADR 引用
   - 逐一验证目标存在且正确
   - 报告:悬空引用列表

3. **产物完整性检查**
   - 阶段 1 的问题清单——所有"必修"问题已在最终 PRD 中解决了吗?
   - 阶段 2 的 ADR——所有 ADR 的"影响"已体现在 PRD 中了吗?
   - 阶段 3 的约束——所有 P0 约束都在 PRD §4 非功能需求中体现了吗?
   - 报告:遗漏项列表

4. **信号噪声比检查**
   - 在 PRD 中随机挑 3-5 段,问"删掉这段,文档还能运作吗?"
   - 如果能 → 标记为可精简或应移→ reference
   - 报告:建议删除/移动的段落

5. **sdd-core 一致性检查(sdd-prd 独家)**
   - 对照 `sdd-core/references/conventions.md` §3.1 的 5 必填章节,逐条打勾
   - 命名是否符合 §2.1(`YYYY-MM-DD-<name>.md`)
   - 顶部 frontmatter 是否含"对应 Phase"反向链接(占位 TBD 可接受)
   - 报告:sdd-core 合规性评分(0-5)

### 3.3 子代理的作业方式

用 Task 工具启动子代理(`agent_type="general-purpose"`),prompt 模板:

```
请审查以下文档的内部一致性和完整性:
- PRD 路径: docs/prd/YYYY-MM-DD-<name>.md
- ADR 集路径: docs/architecture/decisions.md

执行 5 项检查:
1. 内部一致性:交叉对比功能需求、API 设计、数据模型、部署方案,找矛盾
2. 过时引用:grep 所有引用,验证目标存在
3. 产物完整性:阶段 1/2/3 的产物是否都已整合?
4. 信号噪声比:挑 3 段,评估是否可精简
5. sdd-core 一致性:对照 sdd-core conventions §3.1 必填章节,逐条打勾

报告每个检查项的结论和建议。不执行修改(只审不改)。
```

**关键约束**(给子代理时务必明确):

- `agent_type="general-purpose"`——子代理需要读取文档和写报告
- prompt 要明确说"只审不改"——避免它自作主张去改文档
- 主上下文收→反馈后修复问题,再复用同一个 prompt 让子代理复审(确保修正没引入新问题)

### 3.4 处理子代理的反馈

- 子代理报告"没问题"→ 大概率也是真的没问题了(两个独立视角都认为 OK)
- 子代理找→问题 → 修正后**让子代理再审一遍**(确保修正没有引入新问题)
- 子代理和你的判断不一致 → 讨论后定——子代理也可能错,但它的"错"是新鲜的视角

---

## 4. 提交策略(lore commit)

### 4.1 为什么单次提交

"PRD 全面定型"是一个**逻辑上不可分割的事件**——所有变更服务于同一个目标:把 PRD 从草稿提升→可执行基线。

拆成多个提交的问题:

- "加字段 A"→"加字段 B"→"修正矛盾"→ 每个提交都丢失了"为什么改"的上下文
- 后来的人看 git log 看→ 5 个提交,不知道哪个是"最终的 PRD 基线"
- 如果有 Cherry-pick 需求,拆开才是对的——但 PRD 定型不需要 cherry-pick

### 4.2 lore commit 格式(sdd-core 标准)

```bash
echo '{
  "intent": "提纯 {spec-name} 为 PRD v1.0",
  "body": "4 阶段工作流完成:自审发现 N 个矛盾,深审确认 M 个选型,增量补全 K 个约束,精简后 PRD 落盘→ docs/prd/YYYY-MM-DD-<name>.md,ADR 合并入 docs/architecture/decisions.md。",
  "trailers": {
    "Constraint": ["PRD 必含 sdd-core §3.1 的 5 章节 + sdd-prd §0 目标声明/验收开关"],
    "Rejected": ["旧的 prd-outputs/ 路径 | 与 sdd-core §1.1 冲突"],
    "Directive": ["sdd-prd 不写 Phase,Phase 留 TBD 由其他技能补全"],
    "Confidence": "high",
    "Tested": ["子代理 5 项审查通过", "grep 确认零悬空引用"],
    "Not-tested": ["PRD ↔ Phase 双向引用(Phase 留 TBD)"]
  }
}' | lore commit
```

**字段说明**(对齐 sdd-core L111-118):

- `intent`(必填):一句话说明本次变更目的(≤72 字符)
- `body`(可选):详细说明变更内容、原因、影响
- `Constraint`(可选):本次变更引入的硬规则
- `Rejected`(可选):被否决的方案,格式为 `方案 | 原因`
- `Directive`(可选):团队约定或指示
- `Confidence`(可选):信心级别(low/medium/high)
- `Tested`(可选):已验证的内容
- `Not-tested`(可选):未验证的内容

---

## 5. 阶段 4 的最终检查

在说"完成"之前,确认:

- [ ] PRD 内容精炼,没有无谓重复
- [ ] 所有"为什么选 A"已移入 `docs/architecture/decisions.md`
- [ ] 所有具体代码/配置已移入 `docs/architecture/`
- [ ] `grep` 确认零悬空引用
- [ ] 子代理 5 项审查完成,反馈已处理
- [ ] **PRD 顶部有"目标声明"和"目标验收开关"**(归档触发器)
- [ ] **PRD 顶部有"对应阶段: [TBD]"占位行**(sdd-core §3.3 合规)
- [ ] **命名符合 sdd-core §2.1**:`YYYY-MM-DD-<name>.md`
- [ ] **工作产物已清理**:`docs/prd/.working/<name>/` 已删除
- [ ] **lore commit 已提交**(不是 `git commit`)
- [ ] 你愿意让一个新来的团队成员**只读 PRD + decisions.md 就开始实施**——如果可以,基线就完成了
