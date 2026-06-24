# 文档规范与约定

本文档定义软件开发文档体系的规范、约定和最佳实践。

## 1. 目录结构规范

### 1.1 标准目录

```
docs/
├── index.md              # 文档总入口（必须存在）
├── CONTRIBUTING.md       # 贡献指南（必须存在）
├── spec/                 # 结构化需求输入
│   ├── _template.md      # Spec 模板
│   └── *.md              # Spec 文件
├── prd/                  # 产品需求文档
│   ├── _template.md      # PRD 模板
│   └── *.md              # PRD 文件
├── phase/                # 阶段任务文档
│   ├── _template.md      # Phase 模板
│   └── *.md              # Phase 文件
├── architecture/         # 架构文档
│   ├── overview.md       # 架构总览（必须存在）
│   └── *.md              # 专题架构文档
└── reference/            # 参考资料
    ├── README.md         # 参考资料索引（必须存在）
    └── *.md              # 参考资料文件
```

### 1.2 目录职责

| 目录 | 职责 | 维护频率 |
|------|------|---------|
| `spec/` | 结构化需求输入、口语化需求整理结果 | 立项/需求输入 |
| `prd/` | 产品需求、功能规格 | 按版本/迭代 |
| `phase/` | 阶段任务、实施计划 | 按阶段 |
| `architecture/` | 系统设计、技术架构 | 随系统演进 |
| `reference/` | 外部资料、规范文档 | 按需更新 |

### 1.3 必须存在的文件

以下文件是文档体系的基础，初始化时必须创建：

- `docs/index.md`：文档总索引
- `docs/CONTRIBUTING.md`：贡献指南
- `docs/spec/_template.md`：Spec 模板
- `docs/prd/_template.md`：PRD 模板
- `docs/phase/_template.md`：Phase 模板
- `docs/architecture/overview.md`：架构总览
- `docs/reference/README.md`：参考资料索引

### 1.4 临时工作目录（.working/）

sdd-input / sdd-prd / sdd-phase 等辅助技能在对应产物目录下可创建 `.working/` 临时区，存放阶段性工作产物（问题清单、ADR 草稿、任务分解等）。约定：

- 路径：`docs/<spec|prd|phase>/.working/YYYY-MM-DD-<name>/`
- 生命周期：阶段 4（精简与提交）完成后**必须清理**整个 `.working/<name>/` 目录
- `.working/` 不纳入 `docs/index.md` 索引，不计入文档统计
- `.working/` 下的文件不遵循命名规范（仅供工作流内部使用）

示例：
```
docs/prd/
├── _template.md
├── 2026-06-23-user-authentication.md
└── .working/
    └── 2026-06-23-user-authentication/
        ├── problem-list.md      # 阶段 1 产物，阶段 4 后删除
        ├── adr-set.md           # 阶段 2 产物，合并后删除
        └── constraint-set.md    # 阶段 3 产物，并入后删除
```
## 2. 命名规范

### 2.0 Spec 命名

**格式**：`YYYY-MM-DD-<spec-name>.md`

**规则**：
- 日期使用当天日期（YYYY-MM-DD）
- `<spec-name>` 使用小写字母和连字符，简洁描述需求主题
- Spec 与后续 PRD / Phase 建议使用相同日期前缀，便于接力追踪

**示例**：
- ✅ `2026-06-23-user-authentication.md`
- ✅ `2026-06-23-payment-flow.md`
- ❌ `Spec-001.md`（缺少日期）
- ❌ `2026-6-23-user-auth.md`（日期格式错误）
- ❌ `User_Auth.md`（使用了下划线和大写）

### 2.1 PRD 命名

**格式**：`YYYY-MM-DD-<prd-name>.md`

**规则**：
- 日期使用当天日期（YYYY-MM-DD）
- `<prd-name>` 使用小写字母和连字符，简洁描述 PRD 主题
- 同一天的多个 PRD 通过 `<prd-name>` 区分

**示例**：
- ✅ `2026-06-23-user-authentication.md`
- ✅ `2026-06-23-payment-integration.md`
- ❌ `2026-6-23-user-auth.md`（日期格式错误）
- ❌ `2026-06-23_User_Authentication.md`（使用了下划线和大写）
- ❌ `PRD-001.md`（缺少日期）

### 2.2 Phase 命名

**格式**：`YYYY-MM-DD-<phase-name>.md`

**规则**：
- 日期与对应 PRD 一致
- `<phase-name>` 描述阶段主题
- Phase 与 PRD 必须一一对应

**示例**：
- ✅ `2026-06-23-foundation-setup.md`（对应 `2026-06-23-foundation-setup.md` PRD）
- ✅ `2026-06-23-api-development.md`
- ❌ `2026-06-24-foundation-setup.md`（日期与 PRD 不一致）

### 2.3 Architecture 命名

**格式**：`<topic>.md`

**规则**：
- 使用小写字母和连字符
- 名称应清晰描述文档主题
- 避免过于宽泛的名称

**示例**：
- ✅ `overview.md`（架构总览）
- ✅ `api-design.md`
- ✅ `security-architecture.md`
- ✅ `data-model.md`
- ❌ `architecture.md`（过于宽泛）
- ❌ `API_Design.md`（使用了大写和下划线）

### 2.4 Reference 命名

**格式**：`<source-name>.md`

**规则**：
- 使用小写字母和连字符
- 名称应反映资料来源或主题
- 外部文档可保留原名（转换为小写和连字符）

**示例**：
- ✅ `pdm2-api.md`
- ✅ `oauth2-specification.md`
- ✅ `kubernetes-deployment.md`
- ❌ `PDM2_API.md`（使用了大写和下划线）

## 3. PRD 规范

### 3.1 必需章节

PRD 必须包含以下章节（可调整顺序，但不可省略）：

1. **背景与目标**：业务背景、产品目标、成功指标
2. **用户与场景**：目标用户、使用场景
3. **功能需求**：功能清单、详细功能描述
4. **非功能需求**：性能、安全、可用性要求
5. **验收标准**：功能验收、非功能验收

### 3.2 可选章节

根据项目需要可添加：
- 数据需求
- 界面需求
- 集成需求
- 上线计划
- 风险与约束
- 附录

### 3.3 对应 Phase

**强制规则**：每个 PRD 必须有对应的 Phase 文档

- PRD 和 Phase 使用相同日期前缀
- PRD 中必须链接到对应的 Phase
- Phase 中必须链接到对应的 PRD

### 3.4 状态管理

PRD 状态值域（单一事实来源，sdd-prd 归档机制必须以此为准）：

| 状态 | 含义 | 物理位置 | 触发条件 |
|---|---|---|---|
| **草稿** | 初稿编写中 | `docs/prd/` | sdd-prd 阶段 1-3 |
| **评审中** | 提交评审，收集反馈 | `docs/prd/` | sdd-prd 阶段 4 提交后 |
| **已评审** | 评审通过，进入实施 | `docs/prd/` | 评审通过 |
| **已归档** | 目标达成，停止加载 | `docs/prd/archive/` | 验收开关全勾 / 用户确认目标达成 |
| **已替换** | 被新 PRD 替代 | `docs/prd/`（原地标注） | 新 PRD 替代旧目标 |
| **已废弃** | 不再推进 | `docs/prd/`（原地标注） | 用户明确"不做了" |

**归档 = 状态字段变更 + 文件移动**，二者必须同步，不使用 HTML 注释等第二套标记：
- 归档：`> 状态：已归档` + 移动到 `docs/prd/archive/`
- 替换：`> 状态：已替换 by <新 PRD 路径>`（不移动文件）
- 废弃：`> 状态：已废弃（原因：...）`（不移动文件）

在文档头部标注状态：
```markdown
# XXX PRD

> 状态：草稿 | 评审中 | 已评审 | 已归档 | 已替换 | 已废弃
```

## 4. Phase 规范

### 4.1 必需章节

Phase 必须包含以下章节：

1. **阶段目标**：阶段定位、目标、完成标准
2. **任务分解**：任务清单、任务详情
3. **里程碑**：关键节点和交付物
4. **风险与问题**：阶段风险、待解决问题
5. **验收**：验收清单、验收记录

### 4.2 可选章节

- 依赖与协作
- 时间规划
- 资源需求

### 4.3 对应 PRD

**强制规则**：每个 Phase 必须有对应的 PRD

- Phase 头部必须链接到对应 PRD
- Phase 任务应覆盖 PRD 中的所有功能需求

### 4.4 状态管理

Phase 状态：
- **未开始**：任务尚未启动
- **进行中**：任务正在执行
- **已完成**：任务完成并验收

## 5. Architecture 规范

### 5.1 架构总览（overview.md）

`overview.md` 是架构文档的入口，必须包含：

1. **系统定位**：一句话描述系统
2. **架构原则**：指导架构设计的核心原则
3. **系统架构**：架构全景图、技术栈
4. **核心模块**：模块清单、模块关系
5. **数据架构**：数据模型、数据存储

### 5.2 专题架构

专题架构文档聚焦特定领域：
- API 设计
- 安全架构
- 部署架构
- 数据架构
- 集成架构

### 5.3 与代码同步

**核心原则**：架构文档必须与代码保持同步

- 架构变更时，同步更新文档
- 代码重构时，检查是否影响架构文档
- 发现不一致时，立即修正

### 5.4 架构图规范

推荐使用 mermaid 绘制架构图：

```markdown
```mermaid
graph TB
    A[组件 A] --> B[组件 B]
    B --> C[组件 C]
```（注意：实际使用时去掉外层反引号）
```

支持的图表类型：
- `graph`：流程图
- `sequenceDiagram`：时序图
- `classDiagram`：类图
- `stateDiagram`：状态图
- `erDiagram`：ER 图

## 6. Reference 规范

### 6.1 参考资料类型

- **内部规范**：公司内部规范、标准
- **外部系统文档**：第三方系统、服务的文档
- **API 文档**：外部 API 接口文档
- **技术标准**：行业标准、协议规范
- **其他资料**：技术文章、最佳实践

### 6.2 引用规范

引用外部资料时：
- 提供完整链接（如可公开访问）
- 标注版本或日期
- 简要说明资料内容和用途
- 如资料可能失效，保留本地副本

### 6.3 索引维护

`reference/README.md` 必须维护完整索引：
- 按类型分类
- 包含文档名称、链接、说明
- 标注最后更新日期

## 7. 索引维护规范

### 7.1 index.md 维护

`docs/index.md` 是文档总入口，必须维护：

- **快速导航**：核心文档的快速链接
- **Spec 列表**：所有结构化需求输入的索引（按日期倒序）
- **PRD 列表**：所有 PRD 的索引（按日期倒序）
- **Phase 列表**：所有 Phase 的索引（按日期倒序）
- **Architecture 列表**：所有架构文档的索引
- **Reference 列表**：参考资料的简要索引（详细见 `reference/README.md`）
- **文档统计**：各类文档的数量

### 7.2 目录 README.md 维护

各目录的 `README.md` 维护该目录的详细索引：
- `spec/README.md`：Spec 列表和接力状态
- `prd/README.md`：PRD 列表和状态
- `phase/README.md`：Phase 列表和状态
- `reference/README.md`：参考资料完整索引

### 7.3 交叉引用

文档间的引用规则：
- 使用相对路径：`[链接文字](相对路径)`
- 避免绝对路径
- 定期检查链接有效性

**示例**：
```markdown
详见 [用户认证 PRD](../prd/2026-06-23-user-authentication.md)
参考 [API 设计规范](../architecture/api-design.md)
```

## 8. Lore 协议规范

### 8.1 查询约束

修改文档前必须查询：

```bash
# 查询硬约束
lore constraints docs/<路径> --json

# 查询已否决方案
lore rejected docs/<路径> --json

# 查询团队约定
lore directives docs/<路径> --json
```

**处理规则**：
- **Constraint**：必须遵守，违反会导致系统不一致
- **Rejected**：不要重复已否决的方案
- **Directive**：应当遵循团队约定

### 8.2 提交变更

使用 lore 提交文档变更：

```bash
echo '{
  "intent": "docs: 添加用户认证 PRD",
  "body": "新增用户认证功能的完整需求文档，包含 OAuth2 和 JWT 两种方案",
  "trailers": {
    "Constraint": ["用户认证必须支持 OAuth2"],
    "Rejected": ["仅使用 Basic Auth | 安全性不足"],
    "Directive": ["PRD 必须包含验收标准"],
    "Confidence": "high",
    "Tested": ["PRD 结构完整", "链接有效"],
    "Not-tested": ["需求评审待进行"]
  }
}' | lore commit
```

### 8.3 Trailers 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `intent` | string | ✅ | 简短描述变更目的（≤72 字符） |
| `body` | string | ❌ | 详细说明变更内容、原因、影响 |
| `Constraint` | string[] | ❌ | 本次变更引入的硬规则 |
| `Rejected` | string[] | ❌ | 被否决的方案，格式：`方案 \| 原因` |
| `Directive` | string[] | ❌ | 团队约定或指示 |
| `Confidence` | string | ❌ | 信心级别：low/medium/high |
| `Tested` | string[] | ❌ | 已验证的内容 |
| `Not-tested` | string[] | ❌ | 未验证的内容 |

## 9. 质量检查清单

### 9.1 创建新文档

- [ ] 查询了 lore 约束（`constraints`、`rejected`、`directives`）
- [ ] 使用了正确的命名格式
- [ ] 遵循了对应文档类型的模板
- [ ] 包含了所有必需章节
- [ ] PRD/Phase 一一对应（如适用）
- [ ] 更新了 `docs/index.md`
- [ ] 更新了目录 `README.md`（如存在）
- [ ] 检查了文档内链接
- [ ] 使用 lore 提交，包含完整 trailers

### 9.2 修改现有文档

- [ ] 查询了 lore 约束
- [ ] 没有违反 Constraint
- [ ] 没有重复 Rejected 方案
- [ ] 遵循了 Directive
- [ ] 同步更新了相关文档
- [ ] 更新了索引（如有需要）
- [ ] 使用 lore 提交

### 9.3 删除文档

- [ ] 确认文档不再需要
- [ ] 从索引中移除
- [ ] 检查其他文档是否引用了该文档
- [ ] 使用 lore 提交，说明删除原因

## 10. 最佳实践

### 10.1 文档编写

- **简洁清晰**：避免冗长描述，使用表格和列表
- **结构化**：使用标题层级组织内容
- **可维护**：避免重复内容，使用引用
- **可追溯**：通过 lore 记录所有变更

### 10.2 协作

- **及时更新**：发现不一致时立即修正
- **充分沟通**：重大变更在 PR 中说明
- **尊重约束**：遵守 Constraint 和 Directive
- **持续改进**：根据实践反馈优化规范

### 10.3 工具使用

- **Markdown 编辑器**：使用支持 Markdown 预览的编辑器
- **链接检查**：定期检查文档内链接有效性
- **格式检查**：使用 Markdown lint 工具检查格式
- **版本控制**：所有文档纳入 Git 管理

## 11. 常见问题

### Q: 如何处理文档冲突？

查询 `lore rejected`，避免重复已否决方案。如有新的约束冲突，在 PR 中说明并请求决策。

### Q: 文档过时了怎么办？

1. 查询 `lore log <文档路径>` 了解变更历史
2. 更新文档内容
3. 使用 lore 提交，说明更新原因

### Q: 如何追溯某个决策？

使用 `lore why <文档路径>` 查看决策原因，或 `lore log <文档路径>` 查看完整历史。

### Q: 可以删除旧文档吗？

可以，但需要：
1. 确认文档不再需要
2. 从所有索引中移除
3. 检查其他文档的引用
4. 使用 lore 提交，说明删除原因

### Q: 如何初始化文档体系？

如果项目中没有 `docs/` 目录，询问用户是否需要初始化。初始化时创建：
- 完整目录结构
- 所有模板文件
- 基础索引文件
- 贡献指南

使用 lore 提交初始化变更。
