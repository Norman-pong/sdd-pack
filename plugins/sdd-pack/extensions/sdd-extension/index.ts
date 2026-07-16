/**
 * sdd-extension — omp slash command 集合
 *
 * 装载: omp --extension plugins/sdd-pack/extensions/sdd-extension/index.ts
 * 决策: docs/architecture/decisions.md ADR-009(替代 ADR-008 独立 CLI)
 *
 * 约束:
 * - 单文件 ≤ 400 行(phase doc T002 硬上限)
 * - 8 个 pi.registerCommand
 * - 不用 @oh-my-pi/pi-coding-agent 类型(unknown 兜底,跟 hooks/sdd/index.ts 同构)
 * - 统一 arg parser(parseArgs from lib/orchestration/parseArgs)
 * - 统一 UI adapter(notifyBySeverity)
 */

import {
  validateDocs,
  proposePrd,
  archivePrd,
  migratePrd,
  getStatus,
  listPrds,
  getWhy,
  getApplyChecklist,
  type ValidateOptions,
  type ProposeOptions,
  type ArchiveOptions,
  type MigrateOptions,
  type ListOptions,
  type ValidationResult,
  type ProposeResult,
  type ArchiveResult,
  type MigrateResult,
  type StatusResult,
  type ListResult,
  type WhyResult,
  type ApplyResult,
} from "../../src/cli/api";
import {
  parseArgs,
  getStringOption,
  getBoolOption,
  getEnumOption,
} from "../../src/cli/lib/orchestration/parseArgs";
import { formatHuman, formatSummary } from "../../src/cli/lib/orchestration/format";
import type { CheckSeverity, CheckResult } from "../../src/cli/lib/validator";
import {
  runLint,
  runTest,
  runReview,
  runPrecommit,
  runCommit,
} from "../../src/cli/lib/gate-runner";
import type { GateResult } from "../../src/cli/lib/gate-config";
import { findProjectRoot } from "../../src/cli/lib/path";
import { stagedFiles } from "../../src/cli/lib/orchestration/git";

// ===== 类型兜底(unknown,跟 hooks/sdd/index.ts 同构) =====
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

// ===== 统一 UI adapter:把 ValidationResult 映射到 ctx.ui =====
function notifyBySeverity(
  result: { status: "pass" | "warn" | "error" | "block"; errors: string[]; warnings: string[]; checks: CheckResult[] },
  ctx: CommandContext,
): void {
  const level =
    result.status === "block"
      ? "error"
      : result.status === "error"
        ? "error"
        : result.status === "warn"
          ? "warn"
          : "info";
  ctx.ui.notify(formatSummary(result), level === "warn" ? "warning" : level);
}

// ===== type guard: ctx 是否含 ui =====
function hasUI(ctx: unknown): ctx is { ui: CommandUI } {
  if (ctx === null || typeof ctx !== "object") return false;
  if (!("ui" in ctx)) return false;
  const ui: unknown = ctx["ui"];
  if (ui === null || typeof ui !== "object") return false;
  return "notify" in ui && "setWidget" in ui;
}

// ===== helper: 类型守卫(取 ui) =====
function uiOf(ctx: unknown): CommandContext {
  return hasUI(ctx) ? ctx : { ui: { notify: () => {}, setWidget: () => {} } };
}

// ===== 从 hooks/sdd/index.ts 合并的 tool_call 拦截逻辑 =====

// --- 类型守卫 ---

interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
}

// 匹配 `git commit`(排除 commit-tree/commit-graph)
function isGitCommit(input: Record<string, unknown>): boolean {
  const cmd = input["command"];
  if (typeof cmd !== "string") return false;
  return /\bgit\s+commit(?=\s|$)/.test(cmd);
}

// 匹配 `lore commit`
function isLoreCommit(input: Record<string, unknown>): boolean {
  const cmd = input["command"];
  if (typeof cmd !== "string") return false;
  return /\blore\s+commit(?=\s|$)/.test(cmd);
}

// 路径在 docs/ 下
function isDocWritePath(input: Record<string, unknown>): boolean {
  const path = input["path"];
  if (typeof path !== "string") return false;
  return path.startsWith("docs/") || /(^|\/)docs\//.test(path);
}

// --- message 常量 ---

const LORE_PROTOCOL_REMINDER = [
  "📜 lore 提交协议(始终生效,plugin hook 注入):",
  "",
  "1. 修改文件前: `lore constraints <path> --json` / `lore rejected <path> --json` / `lore directives <path> --json`",
  "2. 提交用 `lore commit`(禁止裸 `git commit`): 带 intent + Constraint/Rejected/Directive 等 JSON trailer",
  "3. 文档同步: `sdd validate --staged` 自动校验(已集成到 commit guard)",
  "4. 完整 schema: `rule://lore-protocol`(alwaysApply)",
  "5. 本提醒来自 sdd-pack SDD 范式 extension(ADR-015,合并自 hooks/sdd/)",
].join("\n");

const DOCS_UPDATE_HINT =
  "💡 docs-update-guard [hook]: 检测到 commit 命令。如果本次改动触及 docs/ 请确认 PRD↔Phase 双向引用已更新(skill://sdd-core)。";

const LORE_COMMIT_BLOCK_REASON = [
  "🚫 lore-commit-guard [hook]: 请走 sdd-gate 门禁流水线:",
  "",
  "   编码 -> /sdd-gate-lint -> /sdd-gate-test -> reviewer -> /sdd-gate-review -> /sdd-gate-precommit -> /sdd-gate-commit",
  "",
  "   依次执行:",
  "   1. /sdd-gate-lint         # lint 门禁(block=exit 2, fail=exit 1)",
  "   2. /sdd-gate-test         # 功能验证(可选,缺则 skip)",
  "   3. spawn reviewer agent    # 审查 staged diff,写 .sdd/review/staged.json",
  "   4. /sdd-gate-review       # 检查 review 产物(缺则 block)",
  "   5. /sdd-gate-precommit    # 再跑 lint + lore 约束检查",
  '   6. /sdd-gate-commit --message \'{"intent":"...","trailers":{}}\'',
  "",
  "   裸 `git commit` / 裸 `lore commit` 都会绕过门禁,禁止直接使用。",
  "   lint 命令在 .sdd/gate.json 配置;无配置时自动检测项目类型(vp check / cargo clippy / go vet 等)。",
].join("\n");

const DOC_EDIT_GUIDANCE = [
  "📝 sdd-doc-edit-guard [hook]: 检测到写 docs/ 目录。",
  "   docs/ 写入请走 skill://sdd-core 流程:",
  "   - 新需求 → skill://sdd-input → spec → PRD → Phase",
  "   - PRD 修改 → skill://sdd-prd",
  "   - Phase 任务 → skill://sdd-phase",
].join("\n");

// --- 辅助函数 ---

// 提取 effective severity(环境变量 SDD_VALIDATE_SEVERITY)
function getValidateSeverity(): CheckSeverity {
  const sev = process.env.SDD_VALIDATE_SEVERITY;
  if (sev === "warn" || sev === "error" || sev === "block") return sev;
  return "warn";
}

// in-process 调 api.validateDocs()
async function runSddValidate(pi: ExtensionAPI): Promise<void> {
  try {
    const files = stagedFiles();
    if (files.length === 0) return;
    const result = await validateDocs({ staged: true, files, severity: getValidateSeverity() });
    if (result.status === "block") {
      pi.sendMessage({
        role: "system",
        content: `🚫 sdd validate 硬拦截:\n${result.errors.join("\n")}`,
      });
    } else if (result.status === "error") {
      pi.sendMessage({
        role: "system",
        content: `⚠ sdd validate 错误(灰度阶段,仅警告):\n${result.errors.join("\n")}`,
      });
    }
  } catch (e) {
    pi.sendMessage({
      role: "system",
      content: `⚠ sdd validate 异常(已跳过): ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

// 调 runReview 检查 reviewer 产物,返回 block result 或 null
function runLoreReviewGate(): ToolCallBlockResult | null {
  const result = runReview(process.cwd());
  if (result.status === "block") {
    return {
      block: true,
      reason: `🚫 sdd-gate-review 硬拦截:\n${result.message ?? "reviewer 产物缺失或未通过"}`,
    };
  }
  return null;
}

// ===== arg split(omp 注入 `args: string` 而非 argv) =====
function splitArgs(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

// ===== 8 个 command handlers =====
async function handleValidate(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
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
  notifyBySeverity(result, c);
  if (result.status === "block") return { blocked: true, reason: result.errors.join("\n") };
  return { status: result.status, errors: result.errors.length, warnings: result.warnings.length };
}

async function handlePropose(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
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

async function handleArchive(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
  const pos = opts.positional[0];
  if (!pos) {
    const c = uiOf(ctx);
    c.ui.notify("用法: /sdd-archive <prd-path> [--reason <type>] [--merge-delta] [--dry-run] [--no-commit] [--new-prd <path>]", "error");
    return { error: "missing prd-path" };
  }
  const reason = getEnumOption(
    opts,
    "reason",
    ["completed", "replaced", "abandoned"],
    "completed",
  ) as "completed" | "replaced" | "abandoned";
  const options: ArchiveOptions = {
    prdPath: pos,
    reason,
    mergeDelta: getBoolOption(opts, "merge-delta"),
    dryRun: getBoolOption(opts, "dry-run"),
    noCommit: getBoolOption(opts, "no-commit"),
    newPrdPath: getStringOption(opts, "new-prd"),
  };
  const result: ArchiveResult = await archivePrd(options);
  const c = uiOf(ctx);
  if (result.status === "pass") c.ui.notify(`归档完成: ${pos} (${reason})`, "info");
  else c.ui.notify(`归档失败: ${result.errors.join("; ")}`, "error");
  return result;
}

async function handleMigrate(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
  const pos = opts.positional[0];
  if (!pos) {
    const c = uiOf(ctx);
    c.ui.notify("用法: /sdd-migrate <prd-path> [--dry-run] [--no-backup]", "error");
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

async function handleStatus(_args: string, ctx: unknown): Promise<unknown> {
  const result: StatusResult = await getStatus();
  const c = uiOf(ctx);
  const lines = [`PRD: ${result.prdCount}, Phase: ${result.phaseCount}`, ""];
  for (const item of result.items) {
    lines.push(
      `  [${item.type.toUpperCase()}] ${item.fileName} — ${item.status}${item.version ? ` (v${item.version})` : ""}`,
    );
  }
  c.ui.setWidget("sdd-display", lines.join("\n").split("\n"));
  c.ui.notify(`状态总览: ${result.items.length} 个文档`, "info");
  return result;
}

async function handleList(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
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

async function handleWhy(args: string, ctx: unknown): Promise<unknown> {
  const target = splitArgs(args)[0] ?? "";
  const result: WhyResult = await getWhy(target);
  const c = uiOf(ctx);
  if (result.error) c.ui.notify(result.error, "error");
  else c.ui.notify(result.text || "(无输出)", "info");
  return result;
}

async function handleApply(args: string, ctx: unknown): Promise<unknown> {
  const prdPath = splitArgs(args)[0] ?? "";
  const c = uiOf(ctx);
  if (!prdPath) {
    c.ui.notify("用法: /sdd-apply <prd-path>", "error");
    return { error: "missing prd-path" };
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

// ===== 5 个 gate command handlers =====

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

async function handleGateLint(_args: string, ctx: unknown): Promise<unknown> {
  const result = runLint(findProjectRoot());
  gateNotify(result, ctx);
  return result;
}

async function handleGateTest(_args: string, ctx: unknown): Promise<unknown> {
  const result = runTest(findProjectRoot());
  gateNotify(result, ctx);
  return result;
}

async function handleGateReview(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
  const sha = getStringOption(opts, "sha");
  const result = runReview(findProjectRoot(), sha);
  gateNotify(result, ctx);
  return result;
}

async function handleGatePrecommit(_args: string, ctx: unknown): Promise<unknown> {
  const result = runPrecommit(findProjectRoot());
  gateNotify(result, ctx);
  return result;
}

async function handleGateCommit(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
  const message = getStringOption(opts, "message");
  const result = runCommit(findProjectRoot(), message);
  gateNotify(result, ctx);
  return result;
}

// ===== Extension factory: 13 个 slash command 注册 =====
export default function (pi: ExtensionAPI): void {
  pi.registerCommand("sdd-validate", {
    description: "校验 docs/ 文档结构 + 状态机 + 交叉引用一致性",
    handler: handleValidate,
  });
  pi.registerCommand("sdd-propose", {
    description: "创建新 PRD(full / delta 型)",
    handler: handlePropose,
  });
  pi.registerCommand("sdd-archive", {
    description: "归档 PRD(reason: completed|replaced|abandoned)",
    handler: handleArchive,
  });
  pi.registerCommand("sdd-migrate", {
    description: "状态行堆叠清理 -> 单行 + CHANGELOG",
    handler: handleMigrate,
  });
  pi.registerCommand("sdd-status", {
    description: "所有 PRD/Phase 状态总览",
    handler: handleStatus,
  });
  pi.registerCommand("sdd-list", { description: "带过滤的文档列表", handler: handleList });
  pi.registerCommand("sdd-why", {
    description: "查询 lore 决策上下文(file:line)",
    handler: handleWhy,
  });
  pi.registerCommand("sdd-apply", { description: "打印 PRD 实施 checklist", handler: handleApply });
  pi.registerCommand("sdd-gate-lint", { description: "门禁阶段1: lint（失败阻断后续）", handler: handleGateLint });
  pi.registerCommand("sdd-gate-test", { description: "门禁阶段2: 功能验证测试（缺则 skip）", handler: handleGateTest });
  pi.registerCommand("sdd-gate-review", { description: "门禁阶段3: 检查 reviewer 产物存在且通过", handler: handleGateReview });
  pi.registerCommand("sdd-gate-precommit", { description: "门禁阶段4: 再跑 lint + lore 约束检查", handler: handleGatePrecommit });
  pi.registerCommand("sdd-gate-commit", { description: "门禁阶段5: lore commit（--message 传 JSON）", handler: handleGateCommit });

  // ===== session_start — 注入 lore protocol reminder =====
  pi.on("session_start", (_e) => {
    pi.sendMessage({ role: "system", content: LORE_PROTOCOL_REMINDER });
  });

  // ===== tool_call — commit 硬拦截 + docs/ 写入提示 =====
  pi.on("tool_call", async (e) => {
    const ev = e as ToolCallEvent;
    const toolName = ev.toolName;
    const input = ev.input ?? {};

    if (toolName === "bash" && (isGitCommit(input) || isLoreCommit(input))) {
      const cmd = typeof input["command"] === "string" ? (input["command"] as string) : "";
      const isLore = isLoreCommit(input);
      // isGit 需排除 lore commit 的情况(lore commit 内部可能含 git commit 字样)
      const isGit = isGitCommit(input) && !isLore;
      pi.sendMessage({ role: "system", content: DOCS_UPDATE_HINT });

      if (isGit) {
        return {
          block: true,
          reason:
            "🚫 lore-commit-guard [hook] 禁止 `git commit`(任意 flag):\n`git commit` 绕过 lore trailer + SDD 上下文,本插件硬拦截。\n请改用 `lore commit`(或先跑 `/sdd-gate-lint` -> reviewer -> `/sdd-gate-commit` 流水线)。",
        };
      }

      if (isLore && /(?:^|\s)--amend(?:\s|$)/.test(cmd)) {
        return; // lore commit --amend 放行
      }

      pi.sendMessage({ role: "system", content: LORE_COMMIT_BLOCK_REASON });
      await runSddValidate(pi);
      const reviewBlock = runLoreReviewGate();
      if (reviewBlock) return reviewBlock;
      return;
    }

    if ((toolName === "write" || toolName === "edit") && isDocWritePath(input)) {
      pi.sendMessage({ role: "system", content: DOC_EDIT_GUIDANCE });
    }
  });
}
