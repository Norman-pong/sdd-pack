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
 * - 不用 @oh-my-pi/pi-coding-agent 类型(unknown 兜底,跟 hooks/index.ts 同构)
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

// ===== 类型兜底(unknown,跟 hooks/index.ts 同构) =====
interface ExtensionAPI {
  reg(
    name: string,
    def: {
      description: string;
      handler: (args: string, ctx: unknown) => Promise<unknown> | unknown;
    },
  ): void;
}
interface CommandUI {
  notify(level: "info" | "warn" | "error", message: string): void;
  setWidget(content: string): void;
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

// ===== 7 个 command handlers =====
async function handleInitCheck(_args: string, ctx: unknown): Promise<unknown> {
  const r: InitState = await getInitState();
  const c = uiOf(ctx);
  if (r.initialized) c.ui.notify("info", `OpenSpec 已就绪(scripts/changes/AGENTS.md 齐全)`);
  else c.ui.notify("warn", `OpenSpec 未就绪,缺失: ${r.missing.join(", ") || "(未知)"}`);
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
  c.ui.setWidget(lines.join("\n"));
  c.ui.notify("info", `OpenSpec 状态总览`);
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
  if (r.status === "error") c.ui.notify("error", `校验失败: ${r.errors.length} 个错误`);
  else if (r.status === "warn") c.ui.notify("warn", `校验通过但有警告`);
  else c.ui.notify("info", `校验通过 (${r.changesChecked} 个变更)`);
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
  c.ui.setWidget(lines.join("\n"));
  c.ui.notify("info", `列表: ${r.matched} 个变更`);
  return r;
}

async function handleShow(args: string, ctx: unknown): Promise<unknown> {
  const changeId = splitArgs(args)[0] ?? "";
  const c = uiOf(ctx);
  if (!changeId) {
    c.ui.notify("error", "用法: /openspec-show <change-id>");
    return { error: "missing change-id" };
  }
  const r: ShowResult = await showItem(changeId);
  if (!r.exists) {
    c.ui.notify("error", `变更不存在: ${changeId}`);
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
  c.ui.setWidget(lines.join("\n"));
  c.ui.notify(
    "info",
    `${r.changeId}: proposal=${r.proposal ? "✓" : "✗"} tasks=${r.tasks ? "✓" : "✗"} deltas=${r.specDeltas.length}`,
  );
  return r;
}

async function handleInstructions(_args: string, ctx: unknown): Promise<unknown> {
  const r: InstructionsResult = await getInstructions();
  const c = uiOf(ctx);
  if (!r.available) {
    c.ui.notify("error", r.error ?? "不可用");
    return r;
  }
  c.ui.setWidget(r.content);
  c.ui.notify("info", `openspec/AGENTS.md: ${r.content.length} 字符`);
  return r;
}

async function handleArchive(args: string, ctx: unknown): Promise<unknown> {
  const a = splitArgs(args);
  const changeId = a[0];
  const c = uiOf(ctx);
  if (!changeId) {
    c.ui.notify("error", "用法: /openspec-archive <change-id> [--no-commit]");
    return { error: "missing change-id" };
  }
  const noCommit = a.includes("--no-commit");
  const r: ArchiveResult = await archiveChange({ changeId, noCommit });
  if (r.status === "pass") c.ui.notify("info", `归档完成: ${r.changeId}`);
  else c.ui.notify("error", `归档失败: ${r.errors.join("; ")}`);
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
}
