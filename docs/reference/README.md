# 参考资料索引

> 修改记录：执行 `lore log docs/reference/README.md`

本文档索引 sdd-pack 仓库开发与发布过程中参考的外部资料、omp 官方文档与规范。

## 1. omp 内部规范

| 文档名称              | 来源                                               | 说明                                           | 版本     |
| --------------------- | -------------------------------------------------- | ---------------------------------------------- | -------- |
| omp marketplace 文档  | `omp://marketplace.md`                             | omp 插件市场机制说明                           | 持续更新 |
| omp skills 文档       | `omp://skills.md`                                  | omp 技能发现与加载机制                         | 持续更新 |
| omp rulebook 匹配管道 | `omp://rulebook-matching-pipeline.md`              | omp 规则匹配管道（priority、condition、scope） | 持续更新 |
| 编写 marketplace 指南 | `omp://skills/authoring-marketplaces.md`           | 如何编写 marketplace                           | 持续更新 |
| 插件管理器实现细节    | `omp://plugin-manager-installer-plumbing.md`       | 插件安装/链接内部机制                          | 持续更新 |
| 最小 marketplace 示例 | `omp://skills/examples/mini-marketplace/README.md` | omp 官方最小 marketplace 示例                  | 持续更新 |

## 2. SDD 技能家族引用

| 文档名称             | 来源                                                         | 说明                                   |
| -------------------- | ------------------------------------------------------------ | -------------------------------------- |
| sdd-core SKILL.md    | `plugins/sdd-pack/skills/sdd-core/SKILL.md`                  | 文档体系管理（init/index/lore commit） |
| sdd-core conventions | `plugins/sdd-pack/skills/sdd-core/references/conventions.md` | PRD/Phase 双向引用强制规则             |
| sdd-core docs-check  | `plugins/sdd-pack/skills/sdd-core/references/docs-check.sh`  | 4 项结构校验脚本                       |
| sdd-input SKILL.md   | `plugins/sdd-pack/skills/sdd-input/SKILL.md`                 | 从口语化想法产出 spec                  |
| sdd-prd SKILL.md     | `plugins/sdd-pack/skills/sdd-prd/SKILL.md`                   | 从 spec 提纯为 PRD                     |
| sdd-phase SKILL.md   | `plugins/sdd-pack/skills/sdd-phase/SKILL.md`                 | PRD 拆解为可执行阶段                   |

## 3. omp 规则（rules）引用

| 规则名             | 来源                                           | alwaysApply | condition                 | 说明                      |
| ------------------ | ---------------------------------------------- | ----------- | ------------------------- | ------------------------- |
| lore-protocol      | `plugins/sdd-pack/rules/lore-protocol.md`      | true        | —                         | lore 查询 + commit schema |
| docs-update-guard  | `plugins/sdd-pack/rules/docs-update-guard.md`  | —           | `(git\|lore)\s+commit`    | 提交前 docs 同步检查      |
| lore-commit-guard  | `plugins/sdd-pack/rules/lore-commit-guard.md`  | —           | `(git\|lore)\s+commit`    | 提交质量门                |
| sdd-doc-edit-guard | `plugins/sdd-pack/rules/sdd-doc-edit-guard.md` | —           | `tool:write/edit docs/**` | 写 docs/ 时路由 SDD 技能  |

## 4. 外部标准与规范

| 标准名称             | 文档链接                                                  | 发布机构   | 说明                          |
| -------------------- | --------------------------------------------------------- | ---------- | ----------------------------- |
| SemVer               | https://semver.org/                                       | SemVer.org | plugin version 遵循语义化版本 |
| omp 规则 frontmatter | `omp://rulebook-matching-pipeline.md`（内含 YAML schema） | omp        | rule frontmatter 字段定义     |

## 5. PR / 内部变更

| 编号     | 标题                                        | 影响                                                              |
| -------- | ------------------------------------------- | ----------------------------------------------------------------- |
| PR #1173 | `.omp-plugin/marketplace.json` 优先路径支持 | 决定 catalog 放置位置（选 `.omp-plugin/` 而非 `.claude-plugin/`） |

## 6. omp Task Agent 机制

| 文档名称                | 来源                               | 说明                                                     | 版本        |
| ----------------------- | ---------------------------------- | -------------------------------------------------------- | ----------- |
| Task Agent Discovery    | `omp://task-agent-discovery.md`    | agent 发现/合并/装载/执行约束机制（权威来源）            | omp 16.1.17 |
| omp Task Agent 机制摘要 | `docs/reference/omp-task-agent.md` | 本仓库整理的 agent 机制参考，三层守门 agent 的运行时依据 | 2026-06-25  |

## 7. 三层守门 Agent（sdd-pack 自有）

| Agent         | 来源                                       | blocking | 触发                  | verdict 字段          | 说明                                                                  |
| ------------- | ------------------------------------------ | -------- | --------------------- | --------------------- | --------------------------------------------------------------------- |
| reviewer      | `plugins/sdd-pack/agents/reviewer.md`      | true     | commit-review.ts 自动 | `overall_correctness` | Layer 1 commit gate：runtime bug + patch-local design + lore/SDD 探针 |
| arch-reviewer | `plugins/sdd-pack/agents/arch-reviewer.md` | false    | 手动 task()           | `overall_quality`     | Layer 2 PR/plan gate：layering/SOLID/coupling/ADR，code+plan 双模式   |
| sdd-reviewer  | `plugins/sdd-pack/agents/sdd-reviewer.md`  | false    | 手动 task()           | `overall_conformance` | Layer 3 phase/merge gate：PRD 验收/Phase 覆盖/ADR/lore/docs-sync      |

设计理念见 `skill://omp-three-layer-reviewer`（三层分离 vs 单体 reviewer 的权衡）。

## 8. 其他资料

- omp 内部文档通过 `omp://` URI 访问（harness 内部协议）
- 项目内开发文档通过 `docs/` 目录查阅

## 9. Omp Extension API 参考（sdd-extension 实施依据）

### 9.1 本仓库整理摘要

| 文档名称                   | 来源                                  | 说明                                                                                                                | 版本       |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Omp Extension API 参考** | `docs/reference/omp-extension-api.md` | 本仓库整理的 extension / slash command / UI / manifest / 安装路径摘要，作为 sdd-extension（方案 A）实施期的一手参考 | 2026-06-30 |

### 9.2 omp 官方权威源（11 份）

| 文档                               | 来源                                                                                                                                                                                 | 用途                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Extension API Reference（官方）    | `https://github.com/can1357/oh-my-pi/blob/refs/heads/main/docs/extensions.md`                                                                                                        | ExtensionAPI / registerCommand / registerTool 权威定义                        |
| Extension Authoring 指南           | `https://omp.sh/docs/extension-authoring`                                                                                                                                            | 如何创建一个 omp extension（含最小完整示例）                                  |
| Custom Tools 文档                  | `https://github.com/can1357/oh-my-pi/blob/main/docs/custom-tools.md`                                                                                                                 | ToolDefinition Schema / Zod 参数校验                                          |
| Extension UI Sub-Protocol          | `https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md` + `packages/coding-agent/src/modes/rpc/rpc-types.ts`                                                                     | RPC 模式下 UI 调用（notify / setStatus / setWidget / select / confirm）       |
| Extension Discovery 源码           | `https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/extensibility/plugins/loader.ts`                                                                            | 实际如何从 node_modules / lockfile 装载 plugin 清单（`omp` 或 `pi` manifest） |
| install 命令实现                   | `https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/commands/install.ts`                                                                                        | omp install 路由表（本地路径 → plugin link，远程 → plugin install）           |
| Extension System DeepWiki          | `https://deepwiki.com/can1357/oh-my-pi/11-extension-system`                                                                                                                          | Extension 体系结构总览                                                        |
| Custom Tools and Commands DeepWiki | `https://deepwiki.com/can1357/oh-my-pi/11.3-custom-tools-and-commands`                                                                                                               | Command 注册 / arg completion / 冲突后缀机制                                  |
| @oh-my-pi/cli（独立 CLI 唯一先例） | `https://registry.npmjs.org/%40oh-my-pi%2Fcli`                                                                                                                                       | omp 生态中**独立 CLI**的唯一先例（npm 路径，不走 marketplace）                |
| Pi 单仓库镜像 docs                 | `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md` + `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md` | 与 omp docs 等价的备选阅读路径                                                |
| Discovery wiring PR #1498          | `https://github.com/can1357/oh-my-pi/pull/1498`                                                                                                                                      | `omp plugin install/link` 注册的 sub-dirs 发现修复（2026-05-29）              |
| Manifest 目录形式修复 PR #2714     | `https://github.com/can1357/oh-my-pi/pull/2714`                                                                                                                                      | `pi.extensions: ["./extensions"]` 目录形式解析支持                            |

### 9.3 生态参考项目（扩展思路借鉴）

| 项目                                     | 路径                                                                                                                                                  | 借鉴点                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `Dwsy/pi-extensions-skill`               | `https://github.com/Dwsy/pi-extensions-skill/blob/main/guides/01-quickstart.md`                                                                       | 最小完整 extension 示例（greet command）                  |
| `salesforce/sf-pi`                       | `https://github.com/salesforce/sf-pi/blob/main/lib/common/safe-command-handler.ts`                                                                    | command handler 异常安全包装                              |
| `screenfluent/omp-semantic-grep`         | `https://github.com/screenfluent/omp-semantic-grep`                                                                                                   | hybrid tool + ui.notify                                   |
| `usr-bin-roygbiv/omp-cmux-browser-tools` | `https://github.com/usr-bin-roygbiv/omp-cmux-browser-tools`                                                                                           | extension + marketplace 双重发布                          |
| `pi-mono` examples                       | `https://app.unpkg.com/@oh-my-pi/pi-coding-agent@16.1.11/files/examples/extensions/reload-runtime.ts` + `06-extensions.ts` + `extensions/commands.ts` | 综合性 extension / reload-runtime / 列表 + arg completion |
| `@aliou/pi-dev-kit`                      | `https://cdn.jsdelivr.net/npm/@aliou/pi-dev-kit@0.8.0/src/skills/pi-extension/references/messages.md`                                                 | persistent vs ephemeral 消息区分                          |
