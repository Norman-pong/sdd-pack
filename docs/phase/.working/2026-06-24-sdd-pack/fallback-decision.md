# M1 应急决策 — 不实施 hook extension fallback

> 触发: B1.2 验证失败(详见 PRD §11.3 验证报告)
> 决策日期: 2026-06-24
> 决策人: norman
> 对应 PRD: [SDD Pack PRD](../../prd/2026-06-24-sdd-pack.md)

## 1. 触发事实

B1.2 验证在 omp v16.1.16 上**两种安装模式均失败**:

| 安装模式            | 命令                                              | 物理产物                                                                                      | omp 启动时 rules 列表  |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------- |
| marketplace install | `omp plugin install test-plugin@test-marketplace` | `~/.omp/plugins/cache/plugins/test-marketplace___test-plugin___0.0.1/rules/test-rule.md` 存在 | `test-rule` **不出现** |
| local link          | `omp plugin link /tmp/test-link-plugin`           | `~/.omp/plugins/node_modules/test-link-plugin` symlink → 源存在                               | `test-rule` **不出现** |

omp 启动时报 `Unknown rule: test-rule`,available 列表只含 native provider 加载的 24 个 rules(位于 `~/.omp/agent/rules/`)。

## 2. 用户确认的路径

按 plan §"Context" 记录的用户选择:

> **T002 失败时不实现 fallback**: 若 rules 发现验证失败,改写 PRD §4.1 与 §10.2 约束并仅发布 `0.9.0-rc` tag,v1.0.0 推迟到 v1.1 解决(对应 Phase §T003 改写为应急路径,不再实施 hook extension)。

本决策文件即「不实施 fallback」的事实记录,与之对齐。

## 3. 0.9.0-rc 范围调整

- **可发**: skills(omp-plugins provider 在 omp 16.x 下对 skills 发现正常,本约束未在 B1.2 验证失败之列)
- **可发**: docs-check.sh、package.json、marketplace.json、README.md
- **不可发**:
  - 「`omp plugin install` 后 4 个 rule 自动生效」(对应 PRD §0 第 3 条业务验收 + §8.1 第 7 条功能验收)
  - 「`omp plugin link` 后 rules 可读」(对应 PRD §0 第 5 条技术验收、第 5 条业务验收间接相关)
  - 「native rules 移除后 plugin rules 接管」(对应 Phase T015 验收)

**保留 native rules 不动**: `~/.omp/agent/rules/{lore-protocol,docs-update-guard,lore-commit-guard,sdd-doc-edit-guard}.md` 必须**保留**。若在 0.9.0-rc 中移除(plan §B3.4 原动作),用户将**失去** lore 提交协议与文档同步门控 — 这是直接的工作流破坏,远超"暂未发布的 plugin"。

## 4. v1.1 跟踪(对应 PRD §11.3 §11.4 待补充)

- 上游 issue: 需在 omp 仓库跟踪(本计划不在范围)
- 触发条件: omp 上游修复 `omp-plugins provider` rules 发现,或 plugin 走 extension module / hook extension
- 0.9.0-rc README 必须含「状态:0.9.0-rc — rules 验证未通过,完整功能请等 v1.1」声明(对应 plan §EP.3)

## 5. 与原 PRD/Phase 的偏差

| 维度                 | 原 PRD/Phase                 | 0.9.0-rc 实际                                           | 影响                                         |
| -------------------- | ---------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| PRD §0 业务验收 5 条 | 全部 P0                      | 第 3 条(规则自动生效)降级为「需配合 native rules 共存」 | 目标声明部分完成                             |
| Phase T003           | 设计 hook extension fallback | 跳过,转入应急路径                                       | Phase 任务列表需后续更新                     |
| Phase T015           | 移除 native rules            | **不执行**                                              | 工作流依赖 native rules,plugin rules 待 v1.1 |

## 6. 提交策略

本决策随 B1.4 提交,带 Constraint(0.9.0-rc 范围边界)+ Directive(native rules 保留至 v1.1)。
