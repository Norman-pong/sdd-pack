# PRD TBD 占位回填的详细操作(sdd-phase 独家)

> 加载时机:阶段 4 完成、用户要求"回填 PRD 占位"、扫描到 `> 对应阶段: [TBD - ...]` 时。
> 本文件是 `references/phase-4-slim-commit.md` 第 5 节的详细补充。

---

## 1. TBD 占位的识别

### 1.1 TBD 占位的标准格式

由 sdd-prd 阶段 4 在 PRD 顶部写入:

```markdown
# {产品/功能名} PRD

> 状态:草稿 | 评审中 | 已评审
> 归档日期:...
> 修改记录:...
> 对应阶段: [TBD - 由其他技能补全](../phase/YYYY-MM-DD-<phase>.md)
```

**关键特征**:

- 包含 `[TBD` 字符串
- 路径指向 `../phase/YYYY-MM-DD-<phase>.md`(即使文件不存在)

### 1.2 扫描命令

```bash
# 找出所有 TBD 占位
grep -rn "对应阶段: \[TBD" docs/prd/

# 期望输出(若有):
# docs/prd/2026-06-23-foundation-setup.md:> 对应阶段: [TBD - 由其他技能补全](../phase/2026-06-23-foundation-setup.md)
```

---

## 2. 回填操作流程

### 2.1 回填前检查

- [ ] Phase 文档已落盘到 `docs/phase/YYYY-MM-DD-<phase>.md`
- [ ] Phase 顶部 `> 对应 PRD:` 反向链接已建立
- [ ] 子代理 5 项审查通过
- [ ] 用户确认 Phase 文档完成

### 2.2 手动回填(推荐,避免 sed 误改)

```bash
# 1. 打开对应 PRD 文件
# 文件路径: docs/prd/YYYY-MM-DD-<prd-name>.md

# 2. 找到顶部 "对应阶段:" 行
# Before:
# > 对应阶段: [TBD - 由其他技能补全](../phase/2026-06-23-foundation-setup.md)

# 3. 替换为真实路径
# After:
# > 对应阶段: [基础搭建阶段](../phase/2026-06-23-foundation-setup.md)

# 4. (可选)在 Phase 名称前加描述,便于阅读
```

### 2.3 sed 批量回填(谨慎使用)

```bash
# 仅当占位格式完全一致时使用
sed -i 's|> 对应阶段: \[TBD - 由其他技能补全\](../phase/2026-06-23-foundation-setup.md)|> 对应阶段: [基础搭建阶段](../phase/2026-06-23-foundation-setup.md)|' \
  docs/prd/2026-06-23-foundation-setup.md

# 风险:sed 不区分文件,会替换所有匹配行——若多个 PRD 都有相似占位,会误改
```

**建议**:

- 单个 PRD 回填 → 手动
- 多个 PRD 批量回填 → sed + 严格匹配

---

## 3. 回填后验证

### 3.1 三项必查

```bash
# 1. TBD 已清除
grep -rn "对应阶段: \[TBD" docs/prd/ 2>/dev/null
# 期望:无输出

# 2. Phase 文件存在
ls docs/phase/YYYY-MM-DD-<phase>.md
# 期望:文件存在

# 3. 双向引用
grep "对应 PRD" docs/phase/YYYY-MM-DD-<phase>.md
# 期望:> 对应 PRD:[...](../prd/YYYY-MM-DD-<prd>.md)

grep "对应阶段" docs/prd/YYYY-MM-DD-<prd>.md
# 期望:> 对应阶段: [...](../phase/YYYY-MM-DD-<phase>.md)
```

### 3.2 失败处理

| 失败情况         | 原因             | 修复                            |
| ---------------- | ---------------- | ------------------------------- |
| TBD 仍在         | 回填未生效       | 重新执行回填                    |
| Phase 文件不存在 | Phase 文档未完成 | 重新走阶段 4                    |
| 双向引用缺失     | 一方未更新       | 检查 Phase §1 顶部和 PRD 顶部   |
| 链接路径错       | 命名不一致       | 重新检查 sdd-core §2.2 命名规范 |

---

## 4. 回填的反模式

### 4.1 禁止:Phase 文档未完成时回填

```bash
# 错误:Phase 还在阶段 2,就回填 PRD
echo "Phase 还在写"
# 但已修改 PRD 顶部 TBD
# 结果:PRD 顶部指向不完整的 Phase
```

**修复**:等阶段 4 全部完成(子代理审查通过)再回填。

### 4.2 禁止:回填后不复查

```bash
# 错误:回填完直接 commit
lore commit "回填 PRD 占位"
# 不验证双向引用是否建立
```

**修复**:commit 前必跑 3.1 三项验证。

### 4.3 禁止:改 PRD 其他章节

```bash
# 错误:回填时顺手改了 PRD §3 功能描述
# 破坏了 sdd-prd 4 阶段产物的完整性
```

**修复**:只允许改 `> 对应阶段:` 这一行。其他内容由 sdd-prd 维护。

---

## 5. 多 PRD 对应多 Phase

### 5.1 一对多场景

一个 Phase 文档可能对应多个 PRD(罕见,但可能):

```markdown
# Phase 文档: 基础搭建

> 对应 PRD:
>
> - [PRD-A: 用户认证](../prd/2026-06-23-user-auth.md)
> - [PRD-B: 订单管理](../prd/2026-06-23-orders.md)
```

**回填**:

- PRD-A 顶部 TBD 替换为 Phase 路径
- PRD-B 顶部 TBD 替换为同一 Phase 路径

### 5.2 多对一场景(更罕见)

一个 PRD 可能拆为多个 Phase:

```markdown
# PRD 文档

> 对应阶段:
>
> - [Phase 1: 数据库设计](../phase/2026-06-23-db-design.md)
> - [Phase 2: API 实现](../phase/2026-06-23-api-impl.md)
```

**回填**:两个 Phase 都建立后,合并到 PRD 顶部的"对应阶段"列表。

**注意**:此场景需先建多个 Phase 占位(每个 Phase 文档顶部 `> 对应 PRD:` 指向同一 PRD),然后回填 PRD 顶部的多 Phase 列表。

---

## 6. 与 sdd-prd 归档的配合

### 6.1 归档前必查

PRD 归档前(由 sdd-prd 触发),必须确认:

```bash
# 检查对应 Phase 已建立
grep "对应阶段" docs/prd/YYYY-MM-DD-<prd>.md
# 期望:不是 [TBD]
```

若 Phase 仍为 TBD,询问用户:

- "PRD 顶部对应阶段仍为 TBD。是否要现在补全 Phase,再归档?"
- "若不补全,归档时 TBD 占位保留(可能违反 sdd-core §3.3 完整性)。"

### 6.2 归档后的占位

PRD 归档后,Phase 文档的 `> 对应 PRD:` 反向链接**不应修改**——指向已归档 PRD 是合法的(归档 PRD 是历史记录)。

但若归档后**重写** PRD(创建新 PRD 替代),需要:

- 新 PRD 顶部"对应阶段"指向原 Phase
- 原 Phase 顶部"对应 PRD"指向新 PRD

这是"目标替换"场景,本技能不主动处理(由用户决策)。
