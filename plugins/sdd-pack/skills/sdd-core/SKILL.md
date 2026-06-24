---
name: sdd-core
description: |
  项目的软件开发文档体系管理技能,负责 docs/ 整个目录的创建、修改、索引与提交。
  路径:docs/index.md, docs/CONTRIBUTING.md, docs/spec/, docs/prd/, docs/phase/, docs/architecture/, docs/reference/。
  必含:PRD/Phase 双向引用(conventions.md §3.3/§4.3 强制)、lore commit 提交协议、命名规范(YYYY-MM-DD)。

  触发场景:用户提"初始化 docs"、"写 PRD/Phase/Architecture"、"新建/更新/修改文档"、"文档结构"、
  "PRD 模板"、"添加 reference"、"lore commit 文档",或项目根无 docs/ 目录时自动初始化。
  即使用户说"更新架构文档"、"补上索引"等局部动作,只要涉及 docs/ 都应触发。

  不适用:从 spec 提炼 PRD(用 sdd-prd);写阶段任务(用 sdd-phase);只读不改文档(用 Read 工具);
  改代码(用 Edit 工具)。
---

# 软件开发文档体系（SDD）

本技能管理一套完整的软件开发文档体系，包括需求文档（PRD）、阶段任务（Phase）、架构文档（Architecture）、参考资料（Reference），以及索引和贡献指南。

## 何时使用此技能

**必须触发**的场景：
- 用户要求创建、修改、更新任何 `docs/` 目录下的文档
- 用户提到 PRD、需求、产品文档
- 用户提到阶段任务、phase、迭代计划
- 用户提到架构文档、技术架构
- 用户提到参考资料、外部文档
- 用户要求初始化项目文档结构
- 用户要求用 lore 协议提交文档变更

**不应触发**的场景：
- 用户只是要求读取或查看现有文档（使用 Read 工具）
- 用户要求修改代码（使用 Edit 工具）
- 用户要求创建与文档体系无关的独立文档

## 文档目录结构

```
docs/
├── index.md                    # 文档总入口，维护全局索引
├── CONTRIBUTING.md             # 贡献指南，说明工作流程
├── spec/                       # 结构化需求输入
│   ├── _template.md            # Spec 模板
│   └── YYYY-MM-DD-<name>.md    # sdd-input 产出的结构化 spec
├── prd/                        # 产品需求文档
│   ├── _template.md            # PRD 模板
│   ├── YYYY-MM-DD-<name>.md    # 按日期命名的 PRD
│   ├── archive/                # 已归档 PRD（目标达成后移入，详见 conventions.md §3.4）
│   └── .working/               # 辅助技能临时工作区（阶段 4 后清理，详见 conventions.md §1.4）
├── phase/                      # 阶段任务文档
│   ├── _template.md            # Phase 模板
│   ├── YYYY-MM-DD-<phase>.md   # 与 PRD 一一对应的阶段任务
│   └── .working/               # 辅助技能临时工作区（阶段 4 后清理，详见 conventions.md §1.4）
├── architecture/               # 架构文档
│   ├── overview.md             # 架构总览（必须存在）
│   └── <topic>.md              # 按主题拆分的架构文档
└── reference/                  # 参考资料
    ├── README.md               # 参考资料索引
    └── <external-docs>         # 外部系统、规范、API 文档
```

## 核心工作流程

### 1. 修改前：查询 lore 约束

**任何文档修改前**，先查询该文件/目录的 lore 约束：

```bash
lore constraints <path> --json
lore rejected <path> --json
lore directives <path> --json
```

- **Constraint（约束）**：硬规则，必须遵守，违反会导致系统不一致
- **Rejected（已拒绝）**：之前尝试过但被否决的方案，不要重复
- **Directive（指令）**：团队约定或负责人指示，应当遵循

如果查询结果显示有冲突的约束或已拒绝的方案，**停止修改**，向用户说明情况并请求决策。

### 2. 修改中：遵循文档规范

根据要操作的文档类型，阅读对应参考：

- **PRD 或 Phase**：阅读 `references/templates.md` 中的模板和 `references/conventions.md` 中的命名规范
- **Architecture**：阅读 `references/conventions.md` 中的架构文档规范
- **Reference**：阅读 `references/conventions.md` 中的参考资料规范

**关键原则**：
- PRD 和 Phase 必须一一对应（每个 PRD 都有对应的 Phase）
- Architecture 文档必须与代码保持同步
- 所有变更通过 lore 协议追踪，不在文档中手动写"变更历史"

### 3. 修改后：更新索引和 lore 提交

#### 更新索引

如果创建了新文档或改变了文档结构，**必须同步更新**：

1. `docs/index.md` 的对应章节（Spec / PRD / Phase / Architecture / Reference）
2. 相关目录的 `README.md`（如果存在）
3. 如果有交叉引用，检查并更新相关文档内的链接

#### 提交变更

使用 lore 协议提交，格式如下：

```bash
echo '{
  "intent": "<简短描述本次变更的目的>",
  "body": "<详细说明变更内容、原因、影响>",
  "trailers": {
    "Constraint": ["<本次变更引入的硬规则>"],
    "Rejected": ["<被否决的方案 | 否决原因>"],
    "Directive": ["<团队约定或指示>"],
    "Confidence": "low|medium|high",
    "Tested": ["<已验证的内容>"],
    "Not-tested": ["<未验证的内容>"]
  }
}' | lore commit
```

**字段说明**：
- `intent`（必填）：一句话说明本次变更目的（≤72 字符）
- `body`（可选）：详细说明变更内容、原因、影响
- `Constraint`（可选）：本次变更引入的硬规则
- `Rejected`（可选）：被否决的方案，格式为 `方案 | 原因`
- `Directive`（可选）：团队约定或指示
- `Confidence`（可选）：信心级别（low/medium/high）
- `Tested`（可选）：已验证的内容
- `Not-tested`（可选）：未验证的内容

## 常见场景

### 模板来源（单一事实源）

模板分两个角色，**运行时只读项目内模板**：

| 角色 | 路径 | 何时使用 |
|---|---|---|
| **运行时来源**（唯一） | `docs/<type>/_template.md` | 创建/修改文档时读取 |
| **初始化拷贝源** | `sdd-core/references/templates.md` | 仅在场景 4 初始化时拷贝到项目内 |

**原则**：
- `sdd-core/references/templates.md` 是初始化时的**一次性拷贝源**，不是运行时 fallback。初始化后，项目内 `docs/<type>/_template.md` 是唯一事实源。
- 若项目内模板不存在，**不要回退到 sdd-core 内置模板**，而是提示用户先初始化（场景 4）或从 sdd-core 拷贝。
- 辅助技能（sdd-prd/sdd-phase）自带的 `templates/` 仅作该技能自身参考，不参与运行时优先级链。

创建文档时，读取项目内 `docs/<type>/_template.md` 作为基础结构。

### 场景 1：创建新 PRD 框架

1. 检查 `docs/prd/` 是否存在
   - **不存在**：先询问用户是否需要初始化文档体系（跳转场景 4）
   - **存在**：继续下一步
2. 读取 PRD 模板：`docs/prd/_template.md`（项目内唯一事实源；若缺失则先初始化，见「模板来源」）
3. 用当天日期命名文件：`docs/prd/YYYY-MM-DD-<name>.md`
4. 按模板结构填充内容，结合用户需求调整章节
5. 在 PRD 顶部保留 `> 对应阶段: [TBD - 由 sdd-phase 补全](../phase/YYYY-MM-DD-<phase-name>.md)` 占位；**不要直接创建 Phase 文档**
6. 更新 `docs/index.md` 的 PRD 章节和 `docs/prd/README.md`（如果存在）
7. 用 lore 提交

### 场景 2：更新 Architecture 文档

1. 查询 `docs/architecture/<file>.md` 的 lore 约束
2. 修改文档内容
3. **同步更新代码中的注释**（如果架构变更影响代码理解）
4. 更新 `docs/index.md` 的 Architecture 章节
5. 用 lore 提交，包含 Constraint（如果引入了新的架构约束）

### 场景 3：添加参考资料

1. 将参考资料放入 `docs/reference/`
2. 更新 `docs/reference/README.md` 的索引表格
3. 更新 `docs/index.md` 的 Reference 章节
4. 用 lore 提交

### 场景 4：初始化文档体系

如果用户项目中没有 `docs/` 目录：

1. **询问用户**："检测到项目中没有 docs/ 目录，是否需要初始化文档体系？"
2. 用户同意后，从技能自身的 `references/templates.md` 和 `references/conventions.md` 读取模板和规范内容
3. 创建完整目录结构，**模板文件的内容来自技能的 references，不是空文件**：
   - `docs/index.md`（从 `references/templates.md` §5 读取索引模板）
   - `docs/CONTRIBUTING.md`（从 `references/templates.md` §6 读取贡献指南模板）
   - `docs/spec/_template.md`（从 `references/templates.md` §0 读取 Spec 模板）
   - `docs/prd/_template.md`（从 `references/templates.md` §1 读取 PRD 模板）
   - `docs/phase/_template.md`（从 `references/templates.md` §2 读取 Phase 模板）
   - `docs/architecture/overview.md`（从 `references/templates.md` §3.1 读取架构总览模板）
   - `docs/reference/README.md`（从 `references/templates.md` §4 读取参考资料索引模板）
4. 用 lore 提交初始化变更

## 质量检查

完成文档修改后，提交前必须验证文档结构的完整性。这比依赖 AI 自查更可靠——人会忘记跑脚本，但结构错误会持续存在。

### 核心原则：验证比自查更重要

AI 生成文档时可能遗漏交叉引用、忘记更新索引、用错命名格式。这些错误在人工审查时容易发现，但在自动化流程中必须靠工具捕获。

**必须运行文档校验脚本**：`bash sdd-core/references/docs-check.sh docs`（或拷贝到项目后 `bash docs-check.sh`）。该脚本实现下方 4 项校验，退出码 0 才可提交。若项目有额外 CI 校验（如 `vp run docs:check`），一并运行。

### 必须验证的检查项

无论用什么工具验证，以下 4 项是文档结构完整性的底线：

1. **PRD ↔ Phase 双向引用**
   - 每个 PRD 必须有对应的 Phase 文档引用它
   - 每个 Phase 文档顶部必须有 `> 对应 PRD: [标题](../prd/YYYY-MM-DD.md)` 回指
   - 这是最容易遗漏的环节，必须工具化验证

2. **回指格式规范**
   - Phase 的回指行必须是标准格式，不能是自由文本
   - 格式错误会导致自动化脚本无法解析引用关系

3. **index.md 覆盖度**
   - `docs/index.md` 的「结构化需求输入」表必须包含所有非模板 Spec
   - `docs/index.md` 的「需求文档」表必须包含所有非模板 PRD
   - 新增 PRD 后不同步更新索引是常见错误

4. **链接有效性**
   - 所有相对路径的 markdown 链接必须指向真实存在的文件
   - 移动文件、重命名、删除文件后，残留的断链会破坏文档导航

### 其他自查项

- [ ] 查询了 lore 约束，没有违反 Constraint 或重复 Rejected
- [ ] 遵循了命名规范（PRD/Phase 用日期，Architecture 用主题）
- [ ] 使用 lore 提交，包含完整的 intent 和必要的 trailers

## 参考资源

- **模板和示例**：`references/templates.md`
- **命名和结构规范**：`references/conventions.md`
- **文档结构校验脚本**：`references/docs-check.sh`（实现 4 项校验，提交前必跑）
- **lore 协议详细用法**：项目根目录 `AGENTS.md` 的 Lore Protocol 章节
