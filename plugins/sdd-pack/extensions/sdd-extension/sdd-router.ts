/**
 * sdd-router.ts — /sdd 主命令路由 + 15 个子命令 handler (ADR-018 Phase 001+002+003)
 *
 * 子命令: init, review, approve, back, plan, start, archive, phase, status,
 *         sync, list, why, apply, validate, gate
 * 无状态,不做校验逻辑(校验在 api/lib 层)。
 */

import {
  initPrd,
  reviewPrd,
  approvePrd,
  backPrd,
  planPrd,
  startPrd,
  archivePrdV2,
  phaseTransition,
  getStatusPanel,
  syncMeta,
  listPrds,
  getWhy,
  getApplyChecklist,
  validateDocs,
  proposePrd,
  migratePrd,
  archivePhase,
  type InitOptions,
  type InitResult,
  type ReviewResult,
  type ApproveOptions,
  type ApproveResult,
  type BackOptions,
  type BackResult,
  type PlanOptions,
  type PlanResult,
  type StartResult,
  type ArchiveOptionsV2,
  type ArchiveResultV2,
  type PhaseTransitionOptions,
  type PhaseTransitionResult,
  type StatusPanelResult,
  type SyncOptions,
  type SyncResult,
  type ListOptions,
  type ListResult,
  type WhyResult,
  type ApplyResult,
  type ValidateOptions,
  type ValidationResult,
  type ProposeOptions,
  type ProposeResult,
  type MigrateOptions,
  type MigrateResult,
  type PhaseArchiveOptions,
  type PhaseArchiveResult,
} from "../../src/cli/api";
import {
  parseArgs,
  getStringOption,
  getBoolOption,
  getEnumOption,
} from "../../src/cli/lib/orchestration/parseArgs";
import { formatHuman, formatSummary } from "../../src/cli/lib/orchestration/format";
import type { CheckSeverity } from "../../src/cli/lib/validator";
import { uiOf, splitArgs } from "./ui-helpers";
import {
  handleGateLint,
  handleGateTest,
  handleGateReview,
  handleGatePrecommit,
  handleGateCommit,
} from "./gate-handlers";

// ===== 辅助: 把流转结果格式化为 widget 行 =====

function resultToWidgetLines(
  title: string,
  result: { status: string; prdId?: string; from?: string; to?: string; errors: string[]; warnings: string[]; next?: string },
): string[] {
  const lines: string[] = [`┌─ ${title}`];
  lines.push(`├─ status: ${result.status}`);
  if (result.prdId) lines.push(`├─ prd: ${result.prdId}`);
  if (result.from && result.to) lines.push(`├─ 流转: ${result.from} → ${result.to}`);
  if (result.errors.length > 0) {
    lines.push(`├─ errors:`);
    for (const e of result.errors) lines.push(`│  ${e}`);
  }
  if (result.warnings.length > 0) {
    lines.push(`├─ warnings:`);
    for (const w of result.warnings) lines.push(`│  ${w}`);
  }
  if (result.next) lines.push(`├─ next: ${result.next}`);
  lines.push("└─");
  return lines;
}

// ===== 辅助: 用法错误统一 UI 反馈(setWidget + notify) =====

function usageError(cmd: string, usage: string, ctx: unknown): { error: string } {
  const c = uiOf(ctx);
  const lines = [
    `┌─ ${cmd}`,
    `├─ status: error`,
    `├─ message: 参数错误`,
    `├─ usage: ${usage}`,
    "└─",
  ];
  c.ui.setWidget("sdd-display", lines);
  c.ui.notify(`用法: ${usage}`, "error");
  return { error: "invalid arguments" };
}

// ===== 4 个流转 handler(接收 token[] 保留引号边界) =====

type Handler = (tokens: string[], ctx: unknown) => Promise<unknown>;

async function handleInit(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  // --title 优先(显式指定),否则用 positional(支持多词标题)
  const titleOption = getStringOption(opts, "title");
  const titlePositional = opts.positional.join(" ");
  const title = titleOption || titlePositional || "";
  if (!title) {
    return usageError("sdd init", "/sdd init <title> [--force] [--dry-run]", ctx);
  }
  const options: InitOptions = {
    title,
    force: getBoolOption(opts, "force"),
    dryRun: getBoolOption(opts, "dry-run"),
  };
  const result: InitResult = await initPrd(options);
  const c = uiOf(ctx);
  c.ui.setWidget("sdd-display", resultToWidgetLines("sdd init", result));
  if (result.status === "pass") {
    c.ui.notify(`已创建 PRD: ${result.prdId}\n${result.path ?? ""}\n${result.next ?? ""}`, "info");
  } else {
    c.ui.notify(`创建失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handleReview(_tokens: string[], ctx: unknown): Promise<unknown> {
  const result: ReviewResult = await reviewPrd();
  const c = uiOf(ctx);
  c.ui.setWidget("sdd-display", resultToWidgetLines("sdd review", result));
  if (result.status === "pass") {
    c.ui.notify(`流转成功: ${result.from} → ${result.to}\n${result.next ?? ""}`, "info");
  } else if (result.status === "warn") {
    c.ui.notify(`流转成功(警告): ${result.from} → ${result.to}\n${result.warnings.join("; ")}\n${result.next ?? ""}`, "warning");
  } else {
    c.ui.notify(`流转失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handleApprove(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const options: ApproveOptions = {
    skipReviewer: getBoolOption(opts, "skip-reviewer"),
  };
  const result: ApproveResult = await approvePrd(options);
  const c = uiOf(ctx);
  c.ui.setWidget("sdd-display", resultToWidgetLines("sdd approve", result));
  if (result.status === "pass") {
    c.ui.notify(`流转成功: ${result.from} → ${result.to}\n${result.next ?? ""}`, "info");
  } else {
    c.ui.notify(`流转失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handleBack(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const toRaw = getStringOption(opts, "to");
  if (!toRaw || (toRaw !== "draft" && toRaw !== "pending")) {
    return usageError("sdd back", "/sdd back --to <draft|pending>", ctx);
  }
  const options: BackOptions = { to: toRaw };
  const result: BackResult = await backPrd(options);
  const c = uiOf(ctx);
  c.ui.setWidget("sdd-display", resultToWidgetLines("sdd back", result));
  if (result.status === "pass") {
    c.ui.notify(`回退成功: ${result.from} → ${result.to}\n${result.next ?? ""}`, "info");
  } else {
    c.ui.notify(`回退失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handlePlan(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const phase = getStringOption(opts, "phase");
  const link = getStringOption(opts, "link");
  if (!phase && !link) {
    return usageError("sdd plan", "/sdd plan [--phase <title>] [--link <phase-id>]", ctx);
  }
  const options: PlanOptions = { phase, link };
  const result: PlanResult = await planPrd(options);
  const c = uiOf(ctx);
  c.ui.setWidget("sdd-display", resultToWidgetLines("sdd plan", result));
  if (result.status === "pass") {
    c.ui.notify(`流转成功: ${result.from} → ${result.to}\nPhase: ${result.phaseId}\n${result.next ?? ""}`, "info");
  } else {
    c.ui.notify(`流转失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handleStart(_tokens: string[], ctx: unknown): Promise<unknown> {
  const result: StartResult = await startPrd();
  const c = uiOf(ctx);
  c.ui.setWidget("sdd-display", resultToWidgetLines("sdd start", result));
  if (result.status === "pass") {
    c.ui.notify(`流转成功: ${result.from} → ${result.to}\n${result.next ?? ""}`, "info");
  } else if (result.status === "warn") {
    c.ui.notify(`流转成功(警告): ${result.from} → ${result.to}\n${result.warnings.join("; ")}\n${result.next ?? ""}`, "warning");
  } else {
    c.ui.notify(`流转失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handleArchive(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const reasonRaw = getStringOption(opts, "reason");
  if (!reasonRaw || (reasonRaw !== "completed" && reasonRaw !== "abandoned")) {
    return usageError("sdd archive", "/sdd archive --reason <completed|abandoned>", ctx);
  }
  const options: ArchiveOptionsV2 = { reason: reasonRaw };
  const result: ArchiveResultV2 = await archivePrdV2(options);
  const c = uiOf(ctx);
  c.ui.setWidget("sdd-display", resultToWidgetLines("sdd archive", result));
  if (result.status === "pass") {
    c.ui.notify(`归档成功: ${result.from} → ${result.to}\n${result.movedTo ? `已移动到: ${result.movedTo}\n` : ""}${result.next ?? ""}`, "info");
  } else {
    c.ui.notify(`归档失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handlePhase(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const actionRaw = opts.positional[0];
  if (!actionRaw || (actionRaw !== "start" && actionRaw !== "complete" && actionRaw !== "abandon")) {
    return usageError("sdd phase", "/sdd phase <start|complete|abandon> [--id <phase-id>]", ctx);
  }
  const options: PhaseTransitionOptions = {
    action: actionRaw,
    id: getStringOption(opts, "id"),
  };
  const result: PhaseTransitionResult = await phaseTransition(options);
  const c = uiOf(ctx);
  c.ui.setWidget("sdd-display", resultToWidgetLines("sdd phase", result));
  if (result.status === "pass") {
    c.ui.notify(`Phase 流转成功: ${result.from} → ${result.to}\n${result.next ?? ""}`, "info");
  } else if (result.status === "warn") {
    c.ui.notify(`Phase 流转成功(警告): ${result.from} → ${result.to}\n${result.warnings.join("; ")}\n${result.next ?? ""}`, "warning");
  } else {
    c.ui.notify(`Phase 流转失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handleStatus(_tokens: string[], ctx: unknown): Promise<unknown> {
  const result: StatusPanelResult = await getStatusPanel();
  const c = uiOf(ctx);
  const lines: string[] = [`┌─ sdd status`];
  lines.push(`├─ status: ${result.status}`);
  if (result.prdId) lines.push(`├─ prd: ${result.prdId}`);
  if (result.title) lines.push(`├─ title: ${result.title}`);
  if (result.prdStatus) lines.push(`├─ prdStatus: ${result.prdStatus}`);
  if (result.phaseCount !== undefined) lines.push(`├─ phaseCount: ${result.phaseCount}`);
  if (result.phases && result.phases.length > 0) {
    lines.push(`├─ phases:`);
    for (const p of result.phases) {
      lines.push(`│  ${p.id} [${p.status}] ${p.title}`);
    }
  }
  if (result.availableActions && result.availableActions.length > 0) {
    lines.push(`├─ availableActions:`);
    for (const a of result.availableActions) {
      lines.push(`│  ${a}`);
    }
  }
  if (result.errors.length > 0) {
    lines.push(`├─ errors:`);
    for (const e of result.errors) lines.push(`│  ${e}`);
  }
  lines.push("└─");
  c.ui.setWidget("sdd-display", lines);
  if (result.status === "pass") {
    c.ui.notify(`PRD: ${result.prdId} [${result.prdStatus}] | Phase: ${result.phaseCount} 个`, "info");
  } else {
    c.ui.notify(`获取状态失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

// ===== Phase 003: sync / list / why / apply / validate / gate handler =====

async function handleSync(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const options: SyncOptions = {
    fix: getBoolOption(opts, "fix"),
  };
  const result: SyncResult = await syncMeta(options);
  const c = uiOf(ctx);
  const lines: string[] = [`┌─ sdd sync`];
  lines.push(`├─ status: ${result.status}`);
  if (result.mismatches.length > 0) {
    lines.push(`├─ mismatches (${result.mismatches.length}):`);
    for (const m of result.mismatches) {
      lines.push(`│  ${m.filePath} [${m.kind}] meta=${m.metaStatus} md=${m.markdownStatus}`);
    }
  }
  if (result.fixedCount > 0) lines.push(`├─ fixed: ${result.fixedCount}`);
  if (result.rebuiltCount > 0) lines.push(`├─ rebuilt: ${result.rebuiltCount}`);
  if (result.errors.length > 0) {
    lines.push(`├─ errors:`);
    for (const e of result.errors) lines.push(`│  ${e}`);
  }
  if (result.warnings.length > 0) {
    lines.push(`├─ warnings:`);
    for (const w of result.warnings) lines.push(`│  ${w}`);
  }
  lines.push("└─");
  c.ui.setWidget("sdd-display", lines);
  if (result.status === "pass") {
    c.ui.notify(`meta↔markdown 一致`, "info");
  } else if (result.status === "warn") {
    c.ui.notify(`发现 ${result.mismatches.length} 处不一致,使用 /sdd sync --fix 修复`, "warning");
  } else {
    c.ui.notify(`同步失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handleList(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const options: ListOptions = {
    status: getStringOption(opts, "status"),
    date: getStringOption(opts, "date"),
    keyword: getStringOption(opts, "keyword"),
    type: getEnumOption(opts, "type", ["prd", "phase", "spec"], "prd") as "prd" | "phase" | "spec",
    json: getBoolOption(opts, "json"),
  };
  const result: ListResult = await listPrds(options);
  const c = uiOf(ctx);
  const lines = [`匹配: ${result.matched}`, ""];
  for (const item of result.items) {
    lines.push(`  ${item.date} | ${item.fileName} | ${item.status} | ${item.title}`);
  }
  c.ui.setWidget("sdd-display", lines.join("\n").split("\n"));
  c.ui.notify(`列表: ${result.matched} 个匹配`, "info");
  return result;
}

async function handleWhy(tokens: string[], ctx: unknown): Promise<unknown> {
  const target = tokens[0] ?? "";
  const result: WhyResult = await getWhy(target);
  const c = uiOf(ctx);
  if (result.error) c.ui.notify(result.error, "error");
  else c.ui.notify(result.text || "(无输出)", "info");
  return result;
}

async function handleApply(tokens: string[], ctx: unknown): Promise<unknown> {
  const prdPath = tokens[0] ?? "";
  const c = uiOf(ctx);
  if (!prdPath) {
    return usageError("sdd apply", "/sdd apply <prd-path>", ctx);
  }
  try {
    const result: ApplyResult = await getApplyChecklist(prdPath);
    if (result.total === 0) c.ui.notify("未找到 checklist 条目", "warning");
    else {
      const lines = [`验收标准: ${result.prdPath}`, ""];
      for (const item of result.items)
        lines.push(`  ${String(item.id).padStart(2)}. [ ] ${item.description}`);
      lines.push(`\n总计: ${result.total} 条`);
      c.ui.setWidget("sdd-display", lines.join("\n").split("\n"));
      c.ui.notify(`提取 ${result.total} 条 checklist`, "info");
    }
    return result;
  } catch (e) {
    c.ui.notify(e instanceof Error ? e.message : String(e), "error");
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function handleValidate(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const options: ValidateOptions = {
    path: getStringOption(opts, "path"),
    staged: getBoolOption(opts, "staged"),
    severity: getEnumOption<CheckSeverity>(opts, "severity", ["warn", "error", "block"], "error"),
    json: getBoolOption(opts, "json"),
    rulesOnly: getBoolOption(opts, "rules-only"),
    structureOnly: getBoolOption(opts, "structure-only"),
  };
  const result: ValidationResult = await validateDocs(options);
  const c = uiOf(ctx);
  c.ui.setWidget("sdd-display", formatHuman(result).split("\n"));
  const level =
    result.status === "block"
      ? "error"
      : result.status === "error"
        ? "error"
        : result.status === "warn"
          ? "warn"
          : "info";
  c.ui.notify(formatSummary(result), level === "warn" ? "warning" : level);
  if (result.status === "block") return { blocked: true, reason: result.errors.join("\n") };
  return { status: result.status, errors: result.errors.length, warnings: result.warnings.length };
}

async function handleGate(tokens: string[], ctx: unknown): Promise<unknown> {
  const stage = tokens[0] ?? "";
  const args = tokens.slice(1).join(" ");
  switch (stage) {
    case "lint":
      return handleGateLint(args, ctx);
    case "test":
      return handleGateTest(args, ctx);
    case "review":
      return handleGateReview(args, ctx);
    case "precommit":
      return handleGatePrecommit(args, ctx);
    case "commit":
      return handleGateCommit(args, ctx);
    default:
      return usageError("sdd gate", "/sdd gate <lint|test|review|precommit|commit> [args]", ctx);
  }
}

// ===== propose / migrate / phase-archive (从旧 sdd-* 命令统一迁移) =====

async function handlePropose(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const options: ProposeOptions = {
    spec: getStringOption(opts, "spec"),
    supersedes: getStringOption(opts, "supersedes"),
    title: getStringOption(opts, "title"),
    type: getEnumOption(opts, "type", ["full", "delta"], "full") as "full" | "delta",
    dryRun: getBoolOption(opts, "dry-run"),
  };
  const result: ProposeResult = await proposePrd(options);
  const c = uiOf(ctx);
  if (result.status === "pass" && result.path) {
    c.ui.notify(`已创建: ${result.path}\n${result.next ?? ""}`, "info");
  } else {
    c.ui.notify(`创建失败: ${result.errors.join("; ")}`, "error");
  }
  return result;
}

async function handleMigrateCmd(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const pos = opts.positional[0];
  if (!pos) {
    const c = uiOf(ctx);
    c.ui.notify("用法: /sdd migrate <prd-path> [--dry-run] [--no-backup]", "error");
    return { error: "missing prd-path" };
  }
  const options: MigrateOptions = {
    prdPath: pos,
    dryRun: getBoolOption(opts, "dry-run"),
    noBackup: getBoolOption(opts, "no-backup"),
  };
  const result: MigrateResult = await migratePrd(options);
  const c = uiOf(ctx);
  if (result.status === "pass")
    c.ui.notify(`迁移完成: 解析 ${result.parsedEntries} 个版本`, "info");
  else c.ui.notify(`迁移失败: ${result.errors.join("; ")}`, "error");
  return result;
}

async function handlePhaseArchive(tokens: string[], ctx: unknown): Promise<unknown> {
  const opts = parseArgs(tokens);
  const pos = opts.positional[0];
  if (!pos) {
    const c = uiOf(ctx);
    c.ui.notify("用法: /sdd phase-archive <phase-path> --reason <completed|abandoned> [--dry-run] [--no-commit]", "error");
    return { error: "missing phase-path" };
  }
  const reason = getEnumOption(opts, "reason", ["completed", "abandoned"], "completed") as "completed" | "abandoned";
  const options: PhaseArchiveOptions = {
    phasePath: pos,
    reason,
    dryRun: getBoolOption(opts, "dry-run"),
    noCommit: getBoolOption(opts, "no-commit"),
  };
  const result: PhaseArchiveResult = await archivePhase(options);
  const c = uiOf(ctx);
  if (result.status === "pass") c.ui.notify(`Phase 归档完成: ${pos} (${reason})`, "info");
  else c.ui.notify(`Phase 归档失败: ${result.errors.join("; ")}`, "error");
  return result;
}

// ===== /sdd 主命令路由 =====

const SUBCOMMANDS: Record<string, Handler> = {
  init: handleInit,
  review: handleReview,
  approve: handleApprove,
  back: handleBack,
  plan: handlePlan,
  start: handleStart,
  archive: handleArchive,
  phase: handlePhase,
  "phase-archive": handlePhaseArchive,
  status: handleStatus,
  sync: handleSync,
  list: handleList,
  why: handleWhy,
  apply: handleApply,
  validate: handleValidate,
  propose: handlePropose,
  migrate: handleMigrateCmd,
  gate: handleGate,
};

const SUBCOMMAND_LIST = "init, review, approve, back, plan, start, archive, phase, phase-archive, status, sync, list, why, apply, validate, propose, migrate, gate";

export async function handleSdd(args: string, ctx: unknown): Promise<unknown> {
  const tokens = splitArgs(args);
  const sub = tokens[0] ?? "";
  if (!sub) {
    const c = uiOf(ctx);
    c.ui.notify(
      `用法: /sdd <subcommand> [args]\n子命令: ${SUBCOMMAND_LIST}`,
      "info",
    );
    return { error: "missing subcommand" };
  }
  const handler = SUBCOMMANDS[sub];
  if (!handler) {
    const c = uiOf(ctx);
    c.ui.notify(
      `未知子命令: ${sub}\n可用: ${SUBCOMMAND_LIST}`,
      "error",
    );
    return { error: `unknown subcommand: ${sub}` };
  }
  return handler(tokens.slice(1), ctx);
}
