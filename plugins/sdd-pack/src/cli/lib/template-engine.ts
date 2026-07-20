/**
 * template-engine.ts — PRD 模板填充
 */

/** 模板类型 */
export type TemplateType = "full" | "delta";

/** 模板选项 */
export interface TemplateOptions {
  type: TemplateType;
  title: string;
  date: string;
  /** 覆盖自动生成的 slug（ASCII kebab-case）；ADR-019 §3.2.3 */
  slug?: string;
  supersedes?: string;
  supersedesTitle?: string;
  specPath?: string;
}

/** 模板内容 */
export interface TemplateResult {
  content: string;
  fileName: string;
}

/**
 * 从标题生成文件名
 * YYYY-MM-DD-<kebab-case>.md
 * ADR-019 §3.2.3: slug 正则去掉 \u4e00-\u9fff，统一为 ASCII kebab-case（与 validator Check #7 一致）
 */
function titleToFileName(date: string, title: string, slugOverride?: string): string {
  const slug = slugOverride
    ? slugOverride.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")  // ADR-019 §3.2.3: 去掉 \u4e00-\u9fff，统一为 ASCII kebab-case
        .replace(/^-|-$/g, "");
  return `${date}-${slug}.md`;
}

/**
 * 生成完整 11 节 PRD 模板
 */
function generateFullTemplate(options: TemplateOptions): string {
  const { title, date, supersedes, supersedesTitle } = options;

  const supersedesHeader = supersedes
    ? `> 替代：[${supersedesTitle}](${supersedes})\n`
    : "> 替代：（可选）本 PRD 替代的旧 PRD\n";

  return `# ${title} PRD

> 状态：草稿
> 修改记录：执行 \`lore log docs/prd/${titleToFileName(date, options.title, options.slug)}\`
> 对应阶段：TBD - 待设计评审后由 sdd 补全
${supersedesHeader}
> [!IMPORTANT] PRD 生命周期状态机（ADR-016, 6 状态 + 已归档终态）
> 草稿 ↔ 待评审（可灵活切换） → 已评审 → 已规划任务 → 进行中 → **已归档**（终态）
> 已归档是唯一终态，通过 ArchiveReason（已完成/已中止）记录归档原因。**硬约束**：已评审 不可回退 草稿；任意状态可直接归档但不可逆；已归档 是终态。变更类型判据（A 实现偏差 / B v1 内微调 / C 跨版本叠加）与决策树见 \`rule://prd-change-management\`。

## Δ 变更摘要（仅 supersedes 型 PRD 填写）

> 本 PRD 替代 [${supersedesTitle || "旧 PRD"}](${supersedes || "#"}).
> 以下仅列出相对于旧 PRD 的变更点。**未提及的章节/内容沿用旧 PRD 对应内容,无需在本文件重复。**
> \`sdd archive --merge-delta\` 执行后,本段将被消费并从文件中移除,变更内容合并到上方对应章节。

### ADDED

| # | 目标章节 | 新增内容摘要 | 原因 |
|---|---------|-------------|------|
| A1 | §3.1 | | |

### MODIFIED

| # | 目标章节 | 原内容 | 新内容 | 原因 |
|---|---------|--------|--------|------|
| M1 | | | | |

### REMOVED

| # | 目标章节 | 移除内容 | 原因 |
|---|---------|---------|------|
| R1 | | | |

### 不变内容(显式确认)

| # | 章节 | 确认 |
|---|------|------|
| U1 | §1 背景与目标 | 沿用旧 PRD |
| U2 | §2 用户与场景 | 沿用旧 PRD |


## 0. 目标声明

[明确、可衡量的产品目标]

## 1. 背景与目标

### 1.1 业务背景

[描述业务场景、痛点、机会]

### 1.2 产品目标

[明确、可衡量的目标]

### 1.3 成功指标

- 指标 1：[具体数值或描述]
- 指标 2：[具体数值或描述]

## 2. 用户与场景

### 2.1 目标用户

| 用户角色 | 描述 | 核心诉求 |
|---------|------|---------|
| [角色 1] | [描述] | [诉求] |

### 2.2 使用场景

[描述典型使用场景，可配合流程图]

## 3. 功能需求

### 3.1 功能清单

| 功能模块 | 功能点 | 优先级 | 说明 |
|---------|--------|--------|------|
| [模块 1] | [功能点 1] | P0/P1/P2 | [简要说明] |

### 3.2 详细功能描述

#### 3.2.1 [功能点 1]

**功能说明**：[详细描述]

**输入/前置条件**：
- [条件 1]

**处理逻辑**：
1. [步骤 1]

**输出/后置条件**：
- [结果 1]

**异常处理**：
- [异常情况 1]：[处理方式]

## 4. 非功能需求

### 4.1 性能要求

- 响应时间：[具体要求]

### 4.2 安全要求

- 认证方式：[具体方式]

### 4.3 可用性要求

- 可用性目标：[如 99.9%]

## 5. 数据需求

### 5.1 数据模型

[描述核心数据实体及关系]

### 5.2 数据迁移

[如涉及数据迁移，描述迁移策略]

## 6. 界面需求

### 6.1 页面结构

[描述页面层级和导航结构]

### 6.2 关键页面

[描述关键页面的布局、交互]

## 7. 集成需求

### 7.1 内部系统集成

| 系统名称 | 集成方式 | 数据流向 | 说明 |
|---------|---------|---------|------|
| [系统 1] | [API/消息/文件] | [双向/单向] | [说明] |

### 7.2 外部系统集成

[如有外部系统集成需求，描述集成方式]

## 8. 验收标准

### 8.1 功能验收

- [ ] [验收项 1]

### 8.2 非功能验收

- [ ] [性能验收标准]

## 9. 上线计划

### 9.1 上线时间

- 计划上线日期：[日期]

### 9.2 上线前准备

- [ ] [准备项 1]

## 10. 风险与约束

### 10.1 已知风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| [风险 1] | [高/中/低] | [高/中/低] | [措施] |

### 10.2 约束条件

- [约束 1]

## 11. 附录

### 11.1 术语表

| 术语 | 定义 |
|------|------|
| [术语 1] | [定义] |

### 11.2 参考资料

- [资料 1]
`;
}

/**
 * 生成 delta PRD 模板（仅 Δ 段 + header）
 */
function generateDeltaTemplate(options: TemplateOptions): string {
  const { title, date, supersedes, supersedesTitle } = options;

  return `# ${title} PRD

> 状态：草稿
> 修改记录：执行 \`lore log docs/prd/${titleToFileName(date, options.title, options.slug)}\`
> 对应阶段：TBD - 待设计评审后由 sdd 补全
> 替代：[${supersedesTitle || "旧 PRD"}](${supersedes || "#"})

> [!IMPORTANT] 本 PRD 替代 [${supersedesTitle || "旧 PRD"}](${supersedes || "#"})。
> 以下仅列出相对于旧 PRD 的变更点。**未提及的章节/内容沿用旧 PRD 对应内容,无需在本文件重复。**

## Δ 变更摘要

> 本 PRD 替代 [${supersedesTitle || "旧 PRD"}](${supersedes || "#"}).
> 以下仅列出相对于旧 PRD 的变更点。**未提及的章节/内容沿用旧 PRD 对应内容,无需在本文件重复。**
> \`sdd archive --merge-delta\` 执行后,本段将被消费并从文件中移除,变更内容合并到上方对应章节。

### ADDED

| # | 目标章节 | 新增内容摘要 | 原因 |
|---|---------|-------------|------|
| A1 | | | |

### MODIFIED

| # | 目标章节 | 原内容 | 新内容 | 原因 |
|---|---------|--------|--------|------|
| M1 | | | | |

### REMOVED

| # | 目标章节 | 移除内容 | 原因 |
|---|---------|---------|------|
| R1 | | | |

## 1. 背景与目标

[描述变更背景]

## 8. 验收标准

- [ ] [验收项]
`;
}

/**
 * 生成模板
 */
export function generateTemplate(options: TemplateOptions): TemplateResult {
  const content =
    options.type === "delta" ? generateDeltaTemplate(options) : generateFullTemplate(options);

  const fileName = titleToFileName(options.date, options.title, options.slug);

  return { content, fileName };
}
