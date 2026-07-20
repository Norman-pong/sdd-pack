/**
 * gate-handlers.ts — sdd-gate 5 个门禁阶段 handler
 *
 * 从 index.ts 提取,保持门禁逻辑内聚。
 */

import {
  runLint,
  runTest,
  runReview,
  runPrecommit,
  runCommit,
  runCommitWithFile,
} from "../../src/cli/lib/gate-runner";
import type { GateResult } from "../../src/cli/lib/gate-config";
import { findProjectRoot } from "../../src/cli/lib/path";
import {
  parseArgs,
  getStringOption,
} from "../../src/cli/lib/orchestration/parseArgs";
import { uiOf, splitArgs } from "./ui-helpers";

// ===== 辅助 =====

function gateLevel(status: string): "info" | "warn" | "error" {
  if (status === "fail" || status === "block") return "error";
  if (status === "skip") return "warn";
  return "info";
}

function gateNotify(result: GateResult, ctx: unknown): void {
  const c = uiOf(ctx);
  const lines: string[] = [
    `┌─ sdd-gate: ${result.stage}`,
    `├─ status: ${result.status}`,
  ];
  if (result.command) lines.push(`├─ command: ${result.command}`);
  lines.push(`├─ exit code: ${result.exitCode}`);
  if (result.message) {
    for (const line of result.message.split("\n")) lines.push(`├─ ${line}`);
  }
  if (result.stdout) {
    lines.push("├─ stdout:");
    for (const line of result.stdout.trim().split("\n").slice(0, 30)) {
      lines.push(`│  ${line}`);
    }
    const total = result.stdout.trim().split("\n").length;
    if (total > 30) lines.push(`│  ... (${total - 30} more lines)`);
  }
  if (result.stderr) {
    lines.push("├─ stderr:");
    for (const line of result.stderr.trim().split("\n").slice(0, 20)) {
      lines.push(`│  ${line}`);
    }
  }
  lines.push("└─");
  c.ui.setWidget("sdd-display", lines.join("\n").split("\n"));
  c.ui.notify(`sdd-gate ${result.stage}: ${result.status}`, gateLevel(result.status) === "error" ? "error" : gateLevel(result.status) === "warn" ? "warning" : "info");
}

// ===== 5 个 gate command handlers =====

export async function handleGateLint(_args: string, ctx: unknown): Promise<unknown> {
  const result = runLint(findProjectRoot());
  gateNotify(result, ctx);
  return result;
}

export async function handleGateTest(_args: string, ctx: unknown): Promise<unknown> {
  const result = runTest(findProjectRoot());
  gateNotify(result, ctx);
  return result;
}

export async function handleGateReview(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
  const sha = getStringOption(opts, "sha");
  const result = runReview(findProjectRoot(), sha);
  gateNotify(result, ctx);
  return result;
}

export async function handleGatePrecommit(_args: string, ctx: unknown): Promise<unknown> {
  const result = runPrecommit(findProjectRoot());
  gateNotify(result, ctx);
  return result;
}

export async function handleGateCommit(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
  const messageFile = getStringOption(opts, "message-file");
  const message = getStringOption(opts, "message");
  const repoRoot = findProjectRoot();
  // runCommit 内部自带 review 门禁(missing/failed 阻塞, stale-pass 放行)
  const result = messageFile
    ? runCommitWithFile(repoRoot, messageFile)
    : runCommit(repoRoot, message);
  gateNotify(result, ctx);
  return result;
}
