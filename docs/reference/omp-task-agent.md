# omp Task Agent 机制

> 修改记录：执行 `lore log docs/reference/omp-task-agent.md`

本文档摘要 omp 的 task agent 发现、合并、装载与执行约束机制，作为三层守门 agent（reviewer / arch-reviewer / sdd-reviewer）设计的运行时依据。权威来源：`omp://task-agent-discovery.md`（omp 16.1.17）。

## 1. Agent 定义形状（AgentDefinition）

每个 agent 由 frontmatter + 正文 system prompt 组成，归一化为 `AgentDefinition`：

| 字段                               | 必需 | 说明                                                             |
| ---------------------------------- | ---- | ---------------------------------------------------------------- |
| `name`                             | ✅   | agent 名，`task(agent="<name>")` 精确匹配（大小写敏感）          |
| `description`                      | ✅   | 驱动 discovery 列表展示                                          |
| `systemPrompt`                     | ✅   | 正文 markdown，解析后注入                                        |
| `tools`                            | ❌   | CSV 或数组；提供后 `yield` 自动追加                              |
| `spawns`                           | ❌   | `*` / CSV / 数组；缺省时若 `tools` 含 `task` 则退化为 `*`        |
| `model`                            | ❌   | 模型覆盖（如 `pi/slow`）                                         |
| `thinking-level` / `thinkingLevel` | ❌   | 思考强度                                                         |
| `output`                           | ❌   | 不透明 schema 数据，驱动结构化 verdict                           |
| `blocking`                         | ❌   | 是否阻塞父会话（仅 `reviewer` = true）                           |
| `autoloadSkills`                   | ❌   | 子会话是否自动装载 skills                                        |
| `read-summarize` / `readSummarize` | ❌   | `false` 强制 `read` 返回原文（`explore`/`librarian` 默认 false） |
| `source`                           | —    | `"bundled" \| "user" \| "project"`（运行时标注）                 |
| `filePath`                         | —    | 来源文件路径（运行时标注）                                       |

**校验规则**（`parseAgentFields`）：

- 缺 `name` 或 `description` → 视为非法，该文件被跳过（不影响同目录其他文件）。
- frontmatter 解析失败 → 降级为简单 `key: value` 行解析；仍缺必需字段则抛 `AgentParsingError` 被 caller 捕获。

## 2. 发现源与优先级（first-wins by name）

`discoverAgents(cwd, home)` 按以下顺序合并，**同名 first-wins 去重**：

| 优先级 | 来源    | 路径                                                                     | 过滤                                |
| ------ | ------- | ------------------------------------------------------------------------ | ----------------------------------- |
| 1      | project | `.omp/agents/`（最近项目配置目录）                                       | `TASK_AGENT_CONFIG_SOURCE = ".omp"` |
| 2      | user    | `~/.omp/agent/agents/`                                                   | `.omp`                              |
| 3      | plugin  | Claude plugin roots 的 `agents/` 子目录（project-scope 先于 user-scope） | 仅当 `claude-plugins` provider 启用 |
| 4      | bundled | 内置（explore/plan/designer/reviewer/librarian/oracle/task/quick_task）  | —                                   |

> sdd-pack 通过 marketplace plugin 的 `agents/` 目录分发，走优先级 3（plugin 路径）。`~/.omp/agent/agents/` 是开发态（优先级 2），同名会覆盖 plugin 分发版。

**关键含义**：

- project `.omp` > user `~/.omp/agent/agents` > plugin `agents/` > bundled。
- 任意非 bundled 源的同名 agent 会覆盖 bundled。sdd-pack 的 `reviewer` 覆盖 bundled `reviewer`。
- 大小写敏感：`Reviewer` ≠ `reviewer`。
- **执行时重新发现**：`TaskTool.#executeSync` 每次调用都跑 `discoverAgents`，所以 session 中途新增 agent 文件无需重启即可生效。

## 3. 装载校验与容错

- 目录不可读 / 不存在 → 当作空集（`readdir().catch(() => [])`）。
- 单文件解析失败 → warn 日志 + 跳过该文件，不中断同目录其他 agent 发现。
- bundled 用 `level: "fatal"`：malformed bundled frontmatter 会 throw 并可能拖垮整个 discovery。

## 4. 执行期可用性约束

一个 agent 可被发现但仍可能无法运行：

| 约束                              | 检查点                       | 失败行为                                                                           |
| --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `task.disabledAgents`             | 解析 agent 后                | 返回错误并列出可用 agent                                                           |
| 父会话 `spawns` 策略              | `session.getSessionSpawns()` | `*`=允许任意 / `""`=全拒 / CSV=白名单；被拒返回 `Cannot spawn '...'. Allowed: ...` |
| `PI_BLOCKED_AGENT` env            | tool 构造时                  | 匹配则拒绝（自递归防护）                                                           |
| 递归深度 `task.maxRecursionDepth` | `runSubprocess`              | 达上限则移除子会话的 `task` 工具并清空 spawns env                                  |

## 5. 输出 schema 优先级

`TaskTool.#runSpawn` 的 `effectiveOutputSchema`：

1. agent frontmatter `output`（最高）
2. 父会话 `outputSchema`

→ 三层守门 agent 的 verdict schema（`overall_correctness` / `overall_quality` / `overall_conformance`）由各自 frontmatter `output` 锁定，父会话 schema 无法覆盖。

## 6. Plan mode 行为

父会话开启 plan mode 时，`TaskTool.#runSpawn` 构造 `effectiveAgent`：

- 前置 plan-mode 子会话 system prompt。
- 工具限制为 `read, search, find, lsp, web_search` +（当 agent 自身声明时）`ast_grep` / `report_finding`（`PLAN_MODE_AGENT_TOOL_ALLOWLIST`）。
- 清空子 spawns。

→ arch-reviewer 的 plan mode 依赖其 `tools` 含 `ast_grep` + `report_finding` 才能在 plan mode 下保留这两个工具。

## 7. 三层守门 agent 的运行时映射

| Agent           | source                | blocking | spawns    | 触发方式                           | output verdict        |
| --------------- | --------------------- | -------- | --------- | ---------------------------------- | --------------------- |
| `reviewer`      | plugin (覆盖 bundled) | true     | `explore` | `commit-review.ts` 扩展自动调用    | `overall_correctness` |
| `arch-reviewer` | plugin (新增)         | false    | `explore` | 手动 `task(agent="arch-reviewer")` | `overall_quality`     |
| `sdd-reviewer`  | plugin (新增)         | false    | —         | 手动 `task(agent="sdd-reviewer")`  | `overall_conformance` |

## 8. commit-review.ts 兼容性要点

`commit-review.ts` 扩展**不解析** verdict JSON，仅检查 commit message 中的 `[omp-review:ok]` token。LLM 读 verdict 后决定是否追加 token。因此：

- 扩展 `overall_correctness` enum（如新增 `correct-with-debt`）安全。
- 新增 finding category / dimension / check 安全。
- `reviewer` name 与 `report_finding` 工具名必须保持不变。

## 9. 相关文档

| 文档                 | 来源                                       | 说明                     |
| -------------------- | ------------------------------------------ | ------------------------ |
| Task Agent Discovery | `omp://task-agent-discovery.md`            | 本文权威来源             |
| task 工具            | `omp://tools/task.md`                      | task 工具运行时行为      |
| 三层守门设计         | `skill://omp-three-layer-reviewer`         | 三层分离设计理念         |
| reviewer agent       | `plugins/sdd-pack/agents/reviewer.md`      | Layer 1 commit gate      |
| arch-reviewer agent  | `plugins/sdd-pack/agents/arch-reviewer.md` | Layer 2 PR/plan gate     |
| sdd-reviewer agent   | `plugins/sdd-pack/agents/sdd-reviewer.md`  | Layer 3 phase/merge gate |
