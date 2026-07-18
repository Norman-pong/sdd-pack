# omp 架构分层

> 修改记录：执行 `lore log docs/reference/omp-architecture-layers.md`
>
> 实证日期：2026-07-18；omp 安装位置：`~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/dist/`（下称 `$DIST`）。

本文档把 omp 的插件/能力体系按四层拆解，每层只讲"是什么 + sdd-pack 依赖它的哪一点"。用于排查"为什么 plugin 资产装了不生效"类问题时快速定位层。

## 1. 装载层（Loading）

资产从"磁盘上的 plugin 目录"到"omp 进程可用"的路径：

```mermaid
flowchart LR
    Catalog[".omp-plugin/marketplace.json"] --> PM["omp plugin install / link"]
    PM --> NM["~/.omp/plugins/node_modules/<pkg>"]
    NM --> Lock["omp-plugins.lock.json (enabled 状态)"]
    Lock --> Providers["discovery providers 扫描"]
    Providers --> Runtime["进程内能力注册表"]
```

关键事实：

- **`install` vs `link`**：`install` 拷贝到 `~/.omp/plugins/cache/`，`link` 建 symlink 指向工作树。link 模式下源码改动即时生效；install 模式存在 **cache 漂移**——`omp-plugins.lock.json` 记录的版本与 cache 里实际文件可能不一致（见 [omp Extension 实战](omp-extension-cookbook.md) §3）。
- **sub-dirs 发现**：PR #1498（2026-05-29 合入）修复了 plugin 包内子目录（`skills/`、`rules/`、`agents/`）的发现。sdd-pack 依赖此修复才能让 5 个 skill 被 omp-plugins provider 看到。

## 2. capability registry（能力注册表）

omp 把所有可分发资产抽象为 **capability**，每类 capability 有独立的 provider 链（按 priority 合并去重）：

| capability | 载体 | sdd-pack 是否使用 |
|---|---|---|
| skill | `skills/<name>/SKILL.md` | 是（5 个） |
| rule | `rules/*.md`（TTSR） | 是（5 个） |
| agents | `agents/*.md` | 是（3 个守门） |
| slash-command | extension 内 `pi.registerCommand` | 是（`/sdd`） |
| tool | extension 内 `pi.registerTool` | 是（18 个 `sdd_*`） |
| extension-module | `package.json#omp.extensions` | 是（sdd-extension） |
| hook | `omp.hooks` manifest / `--hook` flag | 否（v1.6.0 起并入 extension） |
| context-file / instruction / prompt / system-prompt / mcp / settings / ssh | 各自目录 | 否 |

provider 链（`$DIST/types/discovery/` 有对应 `.d.ts`）：`builtin-defaults`（最低优先级，内建默认）→ `native`（`~/.omp/agent/`）→ `omp-plugins`（priority 90，扫 node_modules 里的 plugin）→ `claude-plugins` / `codex` / `cursor` / `gemini` / `windsurf` / `opencode` / `cline` / `vscode`（兼容其他生态目录）。同名能力 first-wins。

## 3. 运行时层（Runtime）

### 3.1 extension factory

plugin 的 `omp.extensions` 入口被 import 后拿到 `pi: ExtensionAPI`，可注册三类东西：

- `pi.registerCommand(name, handler)` — slash command（人类入口，`/sdd`）
- `pi.registerTool(def)` — omp tool（LLM 入口，与 read/write/bash 同协议）
- `pi.on(event, handler)` — 事件钩子；支持事件（`$DIST/types/extensibility/hooks/types.d.ts` 的 `HookEvent` 联合类型）：`session_start` / `tool_call` / `tool_result` / `before_agent_start` / `agent_start` / `agent_end` / `turn_start` / `turn_end` / `context` / `tts_triggered` / `auto_compaction_*` / `auto_retry_*` / `todo_reminder`

**`tool_call` 是唯一支持程序级拦截的事件**：handler 返回 `ToolCallEventResult`（`{ block?: boolean; reason?: string }`，`$DIST/types/extensibility/shared-events.d.ts`），`block: true` 时 tool 在发起前被拒绝，`reason` 作为错误回给 LLM。`tool_result` handler 只能改写结果（`content`/`details`/`isError`），不能拦截。

### 3.2 TTSR rule 管线

rule（`.md` + YAML frontmatter）在 LLM 输出流上匹配 `condition`（regex）/ `astCondition`（ast-grep pattern），命中后按 `interruptMode`（`never`/`prose-only`/`tool-only`/`always`）把规则正文注入 steering 队列，**由 LLM 自觉遵守**。

**rule 无程序级拦截能力**：`$DIST/types/capability/rule.d.ts` 的 `RuleFrontmatter` 只有 `description/globs/alwaysApply/condition/astCondition/scope/interruptMode`，无 `block`/`permissionDecision` 字段；`$DIST/types/` 全目录 grep `permissionDecision` 零命中。结论：硬门禁只能走 extension `tool_call`，rule 只是软提示层。

### 3.3 hook（过渡形态）

omp 另有独立 hook 机制（`--hook <file>` CLI flag 装载，`omp.hooks` manifest 字段）。sdd-pack v1.4.x 用它做 commit 拦截，v1.6.0 起并入 extension（ADR-015）。新代码不要再加独立 hook。

## 4. 宿主层（Host）

- **agent loop**：omp 主循环驱动 LLM ↔ tool 往返；`pi.on` 事件在循环各节点触发。
- **task() spawn**：`task` tool 可 spawn 子 agent。内置 agent type 由 `$DIST/cli.js` 中 agent 定义数组决定（grep 法见 §6）；sdd-pack 的 reviewer / arch-reviewer / sdd-reviewer 以 `agents/*.md` 形式注入，通过 `task(agent: "reviewer")` 调用。
- **UI API**：`pi.ui.{notify,setStatus,setWidget,select,confirm,input,editor}`。RPC 模式（headless）下交互式方法（select/confirm/input/editor）不可用或退化，extension 需做模式判断；`notify`/`setStatus` 两种模式都可用。sdd-extension 的 gate 交互只依赖非交互方法，兼容 RPC。

## 5. 关键事实（实证 2026-07-18）

以下三条经本 session 在 omp 安装产物上交叉验证，每条附证据路径：

1. **marketplace install 路径下 extension module 曾不被装载**——omp-plugins provider 的早期过滤逻辑漏掉 extension-module capability（ADR-015 的根因背景；PR #1498 修复 sub-dirs 发现后，extension 经 `omp.extensions` manifest 正常装载）。证据：ADR-015 + `$DIST/types/discovery/omp-plugins.d.ts`。
2. **rule capability 无程序拦截字段**——`$DIST/types/capability/rule.d.ts`（85 行全文）的 `RuleFrontmatter`/`Rule` 无 `block`/`permissionDecision`；`grep -rn 'permissionDecision' $DIST/types/` 零命中。→ 硬门禁只能走 extension/hook 的 `tool_call`。
3. **slash command 与 tool 装载路径不同**——slash command 定义经 marketplace cache 分发（install 模式下存在漂移），tool 由 extension factory 在进程启动时同步注册（始终与代码一致）。这是 sdd-pack ADR-019e「command/tool 共存」策略的根因。详见 [omp Extension 实战](omp-extension-cookbook.md) §2/§3。

Caveat：`$DIST/cli.js`（压缩运行时）可能存在 `.d.ts` 未暴露的内部机制；sdd-pack 只依赖公开类型契约，不依赖私有实现。

## 6. 来源指引

 omp 源码（类型 + 运行时）在本机全局安装目录：

```
~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/dist/{cli.js,types/}
```

常用查证命令：

```sh
D=~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/dist
# 列内置 agent type（在压缩 cli.js 里找 agent 定义数组）
grep -oE 'fileName:"[^"]*"' $D/cli.js | sort -u
# 列 discovery provider 名
grep -oE 'name:"[a-z-]+"' $D/cli.js | sort -u
# 查 rule 是否有程序拦截字段（期望零命中）
grep -rn 'permissionDecision' $D/types/
# 查 tool_call 拦截返回类型
grep -n 'ToolCallEventResult' -A6 $D/types/extensibility/shared-events.d.ts
```

## 7. 关联文档

- [omp Extension 实战](omp-extension-cookbook.md) — 本层（§3）的落地踩坑与代码模式
- [架构决策记录](../architecture/decisions.md) — ADR-006（hook 演进）/ ADR-015（extension 合并）/ ADR-019（command+tool 共存）
