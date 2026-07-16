/**
 * openspec-extension — omp slash command 集合(OpenSpec 范式)
 *
 * 装载: omp --extension plugins/sdd-pack/extensions/openspec-extension/index.ts
 * 决策: docs/architecture/decisions.md ADR-011(双范式架构 — OpenSpec 可选入口)
 *
 * 7 个 slash command 注册(对应 docs/reference/openspec-harness.md):
 *   /openspec-init-check     handleInitCheck    — 检查 OpenSpec 是否就绪
 *   /openspec-status         handleStatus       — 总览(活动/归档/specs 数量)
 *   /openspec-validate       handleValidate     — 校验 spec 格式
 *   /openspec-list           handleList         — 列出变更
 *   /openspec-show           handleShow         — 显示变更详情
 *   /openspec-instructions   handleInstructions — 读 openspec/AGENTS.md
 *   /openspec-archive        handleArchive      — 归档变更
 *
 * 约束:
 * - 单文件 ≤ 400 行
 * - 7 个 slash command 注册
 * - 不用 @oh-my-pi/pi-coding-agent 类型(unknown 兜底,跟 hooks/openspec/index.ts 同构)
 */

import {
  getInitState,
  getStatus,
  validateProject,
  listChanges,
  showItem,
  getInstructions,
  archiveChange,
  type ValidateOptions,
  type ValidateResult,
  type ListOptions,
  type ListResult,
  type ShowResult,
  type InstructionsResult,
  type ArchiveResult,
  type InitState,
  type StatusCounts,
} from "../../src/cli/openspec-api";

// ===== 类型兜底(unknown,跟 hooks/openspec/index.ts 同构) =====
interface ExtensionAPI {
  registerCommand(
    name: string,
    def: {
      description: string;
      handler: (args: string, ctx: unknown) => Promise<unknown> | unknown;
    },
  ): void;
  on(event: string, handler: (e: unknown) => void | Promise<void | ToolCallBlockResult>): void;
  sendMessage(msg: { role: "system" | "user"; content: string }): void;
}
interface ToolCallBlockResult {
  block: true;
  reason: string;
}
interface CommandUI {
  notify(message: string, type?: "info" | "warning" | "error"): void;
  setWidget(key: string, content: string[]): void;
}
interface CommandContext {
  ui: CommandUI;
}

function hasUI(ctx: unknown): ctx is { ui: CommandUI } {
  if (ctx === null || typeof ctx !== "object") return false;
  if (!("ui" in ctx)) return false;
  const ui: unknown = ctx["ui"];
  if (ui === null || typeof ui !== "object") return false;
  return "notify" in ui && "setWidget" in ui;
}
function uiOf(ctx: unknown): CommandContext {
  return hasUI(ctx) ? ctx : { ui: { notify: () => {}, setWidget: () => {} } };
}

function splitArgs(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function severityOf(s: string): "warn" | "error" {
  return s === "warn" ? "warn" : "error";
}

// ===== 从 hooks/openspec/index.ts 合并的 tool_call 拦截逻辑 =====

// --- 类型守卫 ---

interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
}

function isGitCommit(input: Record<string, unknown>): boolean {
  const cmd = input["command"];
  if (typeof cmd !== "string") return false;
  return /\bgit\s+commit(?=\s|$)/.test(cmd);
}

function isLoreCommit(input: Record<string, unknown>): boolean {
  const cmd = input["command"];
  if (typeof cmd !== "string") return false;
  return /\blore\s+commit(?=\s|$)/.test(cmd);
}

function isOpenSpecSpecPath(input: Record<string, unknown>): boolean {
  const path = input["path"];
  if (typeof path !== "string") return false;
  return /(^|\/)openspec\/specs\//.test(path);
}

function isOpenSpecChangePath(input: Record<string, unknown>): boolean {
  const path = input["path"];
  if (typeof path !== "string") return false;
  return /(^|\/)openspec\/changes\//.test(path);
}

function isRootAgentsMd(input: Record<string, unknown>): boolean {
  const path = input["path"];
  if (typeof path !== "string") return false;
  return path === "AGENTS.md" || path.endsWith("/AGENTS.md");
}

// --- message 常量 ---

const OPENSPEC_REMINDER = [
  "📜 OpenSpec Harness reminder (alwaysApply):",
  "",
  "1. 启用判定: openspec/specs/ + openspec/changes/ + openspec/AGENTS.md 全部存在",
  "2. 修改前: `openspec list` 看活动变更,`openspec show <change-id>` 看详情",
  "3. 提交前: `/openspec-validate` + `/openspec-status`(本 hook 自动跑)",
  "4. 规范更新走 /openspec-archive 或 OpenSpec CLI,不要 raw 编辑",
  "5. 本提醒来自 sdd-pack OpenSpec extension(ADR-015,合并自 hooks/openspec/)",
].join("\n");

const RAW_SPEC_WRITE_WARNING = [
  "⚠ openspec-spec-guard [hook]: 检测到直接写入 openspec/specs/**",
  "   OpenSpec 工作流: 编辑应走 change proposal 路径",
  "   → /openspec-show <change-id>  → 编辑 specs/<area>/spec.md delta",
  "   → /openspec-archive          → 合并 delta 回 openspec/specs/",
].join("\n");

const RAW_CHANGE_WRITE_WARNING = [
  "⚠ openspec-change-guard [hook]: 检测到直接写入 openspec/changes/<id>/**",
  "   OpenSpec 生命周期: 通过 slash command 创建/修改变更,不走 raw edit",
  "   → /openspec-list    → 找到现有变更",
  "   → /openspec-show    → 读 proposal/tasks/spec deltas",
  "   → /openspec-archive → 变更完成时归档",
].join("\n");

const AGENTS_MD_GUARD = [
  "⚠ openspec-agents-guard [hook]: 检测到直接编辑 AGENTS.md。",
  "   OpenSpec init 后,根 AGENTS.md 由 openspec/AGENTS.md 接管,",
  "   修改应走 OpenSpec 生命周期(/openspec-* 或 openspec CLI)而非 raw edit。",
  "   例外: 引入新 AI 工具时,可走 `openspec update` 刷新子工具绑定。",
].join("\n");

// --- OpenSpec 守卫 gate:在 commit 时跑 validate + status ---

// --- OpenSpec 守卫 gate:在 commit 时跑 validate + status(in-process) ---
async function runOpenSpecGate(): Promise<ToolCallBlockResult | null> {
  try {
    const v = await validateProject({ severity: "error" });
    if (v.status === "error") {
      return {
        block: true,
        reason: `🚫 OpenSpec validate 失败:\n${v.errors.join("\n")}`,
      };
    }
    // status 检查: 仅确认 openspec 目录结构存在,不 block
    await getStatus();
  } catch (e) {
    // OpenSpec 未初始化或异常 → 放行(不 block),仅警告
    return null;
  }
  return null;
}

// ===== 7 个 command handlers =====
async function handleInitCheck(_args: string, ctx: unknown): Promise<unknown> {
  const r: InitState = await getInitState();
  const c = uiOf(ctx);
  if (r.initialized) c.ui.notify(`OpenSpec 已就绪(scripts/changes/AGENTS.md 齐全)`, "info");
  else c.ui.notify(`OpenSpec 未就绪,缺失: ${r.missing.join(", ") || "(未知)"}`, "warning");
  return r;
}

async function handleStatus(_args: string, ctx: unknown): Promise<unknown> {
  const r: StatusCounts = await getStatus();
  const c = uiOf(ctx);
  const lines = [
    `活动变更: ${r.activeChanges}`,
    `归档变更: ${r.archivedChanges}`,
    `spec areas: ${r.specAreas}`,
  ];
  c.ui.setWidget("openspec-display", lines.join("\n").split("\n"));
  c.ui.notify(`OpenSpec 状态总览`, "info");
  return r;
}

async function handleValidate(args: string, ctx: unknown): Promise<unknown> {
  const a = splitArgs(args);
  const changeIdIdx = a.indexOf("--change");
  const changeId = changeIdIdx >= 0 ? a[changeIdIdx + 1] : undefined;
  const sevIdx = a.indexOf("--severity");
  const sev = sevIdx >= 0 ? severityOf(a[sevIdx + 1]) : "error";
  const options: ValidateOptions = { changeId, severity: sev };
  const r: ValidateResult = await validateProject(options);
  const c = uiOf(ctx);
  if (r.status === "error") c.ui.notify(`校验失败: ${r.errors.length} 个错误`, "error");
  else if (r.status === "warn") c.ui.notify(`校验通过但有警告`, "warning");
  else c.ui.notify(`校验通过 (${r.changesChecked} 个变更)`, "info");
  return r;
}

async function handleList(args: string, ctx: unknown): Promise<unknown> {
  const a = splitArgs(args);
  const statusIdx = a.indexOf("--status");
  const status = statusIdx >= 0 && a[statusIdx + 1] === "archived" ? "archived" : "active";
  const options: ListOptions = { status };
  const r: ListResult = await listChanges(options);
  const c = uiOf(ctx);
  const lines = [`匹配: ${r.matched}`, ""];
  for (const item of r.items) {
    lines.push(`  [${item.status.toUpperCase()}] ${item.changeId} — ${item.title}`);
  }
  c.ui.setWidget("openspec-display", lines.join("\n").split("\n"));
  c.ui.notify(`列表: ${r.matched} 个变更`, "info");
  return r;
}

async function handleShow(args: string, ctx: unknown): Promise<unknown> {
  const changeId = splitArgs(args)[0] ?? "";
  const c = uiOf(ctx);
  if (!changeId) {
    c.ui.notify("用法: /openspec-show <change-id>", "error");
    return { error: "missing change-id" };
  }
  const r: ShowResult = await showItem(changeId);
  if (!r.exists) {
    c.ui.notify(`变更不存在: ${changeId}`, "error");
    return r;
  }
  const lines = [`变更: ${r.changeId}`, `路径: ${r.path}`, ""];
  if (r.proposal) lines.push(`--- proposal ---`, r.proposal);
  if (r.tasks) lines.push(`--- tasks ---`, r.tasks);
  if (r.design) lines.push(`--- design ---`, r.design);
  if (r.specDeltas.length > 0) {
    lines.push(`--- spec deltas ---`);
    for (const d of r.specDeltas) lines.push(`### ${d.name}`, d.content);
  }
  c.ui.setWidget("openspec-display", lines.join("\n").split("\n"));
  c.ui.notify(`${r.changeId}: proposal=${r.proposal ? "✓" : "✗"} tasks=${r.tasks ? "✓" : "✗"} deltas=${r.specDeltas.length}`, "info");
  return r;
}

async function handleInstructions(_args: string, ctx: unknown): Promise<unknown> {
  const r: InstructionsResult = await getInstructions();
  const c = uiOf(ctx);
  if (!r.available) {
    c.ui.notify(r.error ?? "不可用", "error");
    return r;
  }
  c.ui.setWidget("openspec-display", r.content.split("\n"));
  c.ui.notify(`openspec/AGENTS.md: ${r.content.length} 字符`, "info");
  return r;
}

async function handleArchive(args: string, ctx: unknown): Promise<unknown> {
  const a = splitArgs(args);
  const changeId = a[0];
  const c = uiOf(ctx);
  if (!changeId) {
    c.ui.notify("用法: /openspec-archive <change-id> [--no-commit]", "error");
    return { error: "missing change-id" };
  }
  const noCommit = a.includes("--no-commit");
  const r: ArchiveResult = await archiveChange({ changeId, noCommit });
  if (r.status === "pass") c.ui.notify(`归档完成: ${r.changeId}`, "info");
  else c.ui.notify(`归档失败: ${r.errors.join("; ")}`, "error");
  return r;
}

// ===== Extension factory:7 个 slash command 注册 =====
export default function (pi: ExtensionAPI): void {
  pi.registerCommand("openspec-init-check", {
    description: "检查 OpenSpec 是否就绪(目录 + AGENTS.md)",
    handler: handleInitCheck,
  });
  pi.registerCommand("openspec-status", {
    description: "OpenSpec 状态总览(活动/归档变更数 + spec areas 数)",
    handler: handleStatus,
  });
  pi.registerCommand("openspec-validate", {
    description: "校验 OpenSpec spec 格式(SHALL/MUST + Requirement + Scenario)",
    handler: handleValidate,
  });
  pi.registerCommand("openspec-list", {
    description: "列出活动(--status archived 查归档)OpenSpec 变更",
    handler: handleList,
  });
  pi.registerCommand("openspec-show", {
    description: "显示单个 OpenSpec 变更详情(proposal/tasks/design/spec deltas)",
    handler: handleShow,
  });
  pi.registerCommand("openspec-instructions", {
    description: "读 openspec/AGENTS.md 内容(AI 助手协议)",
    handler: handleInstructions,
  });
  pi.registerCommand("openspec-archive", {
    description: "归档 OpenSpec 变更 → openspec/changes/archive/",
    handler: handleArchive,
  });

  // ===== session_start — 注入 OpenSpec reminder =====
  pi.on("session_start", (_e) => {
    pi.sendMessage({ role: "system", content: OPENSPEC_REMINDER });
  });

  // ===== tool_call — commit 硬拦截 + openspec/ 路径提示 =====
  pi.on("tool_call", async (e) => {
    const ev = e as ToolCallEvent;
    const toolName = ev.toolName;
    const input = ev.input ?? {};

    if (toolName === "bash" && (isGitCommit(input) || isLoreCommit(input))) {
      const cmd = typeof input["command"] === "string" ? (input["command"] as string) : "";
      const isLore = isLoreCommit(input);
      // isGit 需排除 lore commit 的情况(lore commit 内部可能含 git commit 字样)
      const isGit = isGitCommit(input) && !isLore;

      if (isGit) {
        return {
          block: true,
          reason:
            "🚫 openspec-commit-guard [hook] 禁止 `git commit`(任意 flag):\n`git commit` 绕过 OpenSpec 变更上下文,本插件硬拦截。\n请改用 `lore commit`(或先跑 `/openspec-validate` + `/openspec-status`)。",
        };
      }

      if (isLore && /(?:^|\s)--amend(?:\s|$)/.test(cmd)) {
        return; // lore commit --amend 放行
      }

      const gateBlock = await runOpenSpecGate();
      if (gateBlock) return gateBlock;
      return;
    }

    if (toolName === "write" || toolName === "edit") {
      if (isOpenSpecSpecPath(input))
        pi.sendMessage({ role: "system", content: RAW_SPEC_WRITE_WARNING });
      else if (isOpenSpecChangePath(input))
        pi.sendMessage({ role: "system", content: RAW_CHANGE_WRITE_WARNING });
      else if (isRootAgentsMd(input)) pi.sendMessage({ role: "system", content: AGENTS_MD_GUARD });
    }
  });
}
