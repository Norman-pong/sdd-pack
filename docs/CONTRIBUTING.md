# 文档贡献指南

> 修改记录：执行 `lore log docs/CONTRIBUTING.md`

本文档说明 sdd-pack 仓库的文档结构、贡献流程与质量检查规范。

## 1. 文档结构

sdd-pack 仓库采用 SDD（Software Development Documentation）文档体系：

```
docs/
├── index.md              # 文档总索引（必须存在）
├── CONTRIBUTING.md       # 本文档
├── spec/                 # 结构化需求输入（当前为空，按需创建）
├── prd/                  # 产品需求文档
├── phase/                # 阶段任务文档
├── architecture/         # 架构文档
└── reference/            # 参考资料
```

### 1.1 必须存在的文件

- `docs/index.md`：文档总索引
- `docs/CONTRIBUTING.md`：贡献指南
- `docs/spec/_template.md`：Spec 模板
- `docs/prd/_template.md`：PRD 模板
- `docs/phase/_template.md`：Phase 模板
- `docs/architecture/overview.md`：架构总览
- `docs/reference/README.md`：参考资料索引

### 1.2 命名规范

- **PRD**：`YYYY-MM-DD-<prd-name>.md`
- **Phase**：`YYYY-MM-DD-<phase-name>.md`（与对应 PRD 同日期前缀）
- **Spec**：`YYYY-MM-DD-<spec-name>.md`
- **Architecture**：`<topic>.md`（如 `overview.md`）
- **Reference**：`<source-name>.md`

## 2. 工作流程

### 2.1 创建新文档

1. **查询 lore 约束**：
   ```bash
   lore constraints docs/<path> --json
   lore rejected docs/<path> --json
   lore directives docs/<path> --json
   ```

2. **复制模板**：从 `docs/<type>/_template.md` 拷贝（项目内唯一事实源）

3. **命名文件**：遵循 §1.2 命名规范

4. **更新索引**：更新 `docs/index.md` 对应章节

5. **提交变更**：使用 `lore commit`（不要直接 `git commit`）

### 2.2 修改现有文档

1. 查询约束（见 §2.1）
2. 检查冲突：遵守 Constraint、避免 Rejected
3. 修改文档
4. 同步更新相关引用与索引
5. 跑 `docs-check.sh` 验证（见 §3）
6. lore commit

## 3. 质量检查

提交前必须运行：

```bash
bash <sdd-core>/references/docs-check.sh docs
```

校验 4 项：
1. PRD ↔ Phase 双向引用
2. 回指格式规范（`> 对应阶段:` / `> 对应 PRD:`）
3. index.md 覆盖度
4. 相对路径 markdown 链接有效性

退出码 0 才可提交。

## 4. sdd-pack 仓库特殊约定

### 4.1 插件内容与文档分离

sdd-pack 仓库**有两个**内容区域：

| 区域 | 路径 | 性质 |
|------|------|------|
| 文档体系 | `docs/` | 项目本身的开发文档（本文档所在） |
| 插件分发内容 | `plugins/sdd-pack/` | 通过 omp marketplace 分发的 skills + rules |

**约束**：
- 改 skills/rules 内容只动 `plugins/sdd-pack/`
- 改插件的设计、路线、版本才动 `docs/`
- 两者提交可分开，但 plugin version 变更时 docs/ 对应 PRD/Phase 必须同步

### 4.2 插件版本与文档同步

- 每次 plugin version 递增（修改 `plugins/sdd-pack/package.json` 或 `.omp-plugin/marketplace.json`），对应 docs/prd/ 顶部应更新 `version` 备注（如有）
- git tag = plugin version

### 4.3 PRD ↔ Phase 强制对应

每个 PRD 必须有 Phase 文档对应。Phase 必含 sdd-core conventions.md §4.1 强制 5 章节 + 顶部 `> 对应 PRD:` 反向链接。

## 5. Lore 协议

### 5.1 提交格式

```bash
echo '{
  "intent": "<一句话目的，≤72 字符>",
  "body": "<详细说明>",
  "trailers": {
    "Constraint": ["<硬规则>"],
    "Rejected": ["<方案 | 否决原因>"],
    "Directive": ["<团队约定>"],
    "Confidence": "low|medium|high",
    "Tested": ["<已验证>"],
    "Not-tested": ["<未验证>"]
  }
}' | lore commit
```

字段 schema 详见 `rule://lore-protocol`。

## 6. 常见问题

### Q: 什么时候该改 docs/，什么时候改 plugins/？

- 改**插件如何被发现/安装/工作**的设计 → docs/（PRD/Phase/Architecture）
- 改**技能内容**或**规则内容**本身 → plugins/sdd-pack/（skills/ 或 rules/）

### Q: 文档冲突如何处理？

查询 `lore rejected` 避免重复已否决方案。如有新的约束冲突，在 PR 中说明并请求决策。

### Q: 如何追溯文档变更？

```bash
lore log docs/<path>            # 带 Lore trailer 的 git log
lore why <file>:<line>          # 查某行背后的决策上下文
```

## 7. 联系方式

- 文档负责人：norman
- 反馈渠道：GitHub Issues
