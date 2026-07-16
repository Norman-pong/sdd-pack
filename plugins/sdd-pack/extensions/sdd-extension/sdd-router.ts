/**
 * sdd-router.ts — /sdd 主命令路由 + 4 个流转 handler (ADR-018 Phase 001)
 *
 * 子命令: init, review, approve, back
 * 无状态,不做校验逻辑(校验在 api/lib 层)。
 */

import {
  initPrd,
  reviewPrd,
  approvePrd,
  backPrd,
  type InitOptions,
  type InitResult,
  type ReviewResult,
  type ApproveOptions,
  type ApproveResult,
  type BackOptions,
  type BackResult,
} from "../../src/cli/api";
import {
  parseArgs,
  getStringOption,
  getBoolOption,
} from "../../src/cli/lib/orchestration/parseArgs";
import { uiOf, splitArgs } from "./ui-helpers";

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

// ===== /sdd 主命令路由 =====

const SUBCOMMANDS: Record<string, Handler> = {
  init: handleInit,
  review: handleReview,
  approve: handleApprove,
  back: handleBack,
};

export async function handleSdd(args: string, ctx: unknown): Promise<unknown> {
  const tokens = splitArgs(args);
  const sub = tokens[0] ?? "";
  if (!sub) {
    const c = uiOf(ctx);
    c.ui.notify(
      "用法: /sdd <subcommand> [args]\n子命令: init, review, approve, back",
      "info",
    );
    return { error: "missing subcommand" };
  }
  const handler = SUBCOMMANDS[sub];
  if (!handler) {
    const c = uiOf(ctx);
    c.ui.notify(
      `未知子命令: ${sub}\n可用: init, review, approve, back`,
      "error",
    );
    return { error: `unknown subcommand: ${sub}` };
  }
  // 传递 token[] 保留引号边界(如 --title "My PRD" 中的空格)
  return handler(tokens.slice(1), ctx);
}
