/**
 * sdd-extension — omp slash command 集合
 *
 * 装载: omp --extension plugins/sdd-pack/extensions/sdd-extension/index.ts
 * 决策: docs/architecture/decisions.md ADR-009(替代 ADR-008 独立 CLI)
 *
 * 约束:
 * - 15 个 pi.registerCommand(1 个 /sdd 主命令 + 14 个旧 sdd-* 命令,Phase 003 统一别名)
 * - 不用 @oh-my-pi/pi-coding-agent 类型(unknown 兜底,跟 hooks/sdd/index.ts 同构)
 * - 统一 arg parser(parseArgs from lib/orchestration/parseArgs)
 * - 统一 UI adapter(notifyBySeverity)
 * - /sdd 路由 + 15 个子命令 handler 在 sdd-router.ts(ADR-018)
 * - 5 个 gate handler 在 gate-handlers.ts
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
  archivePhase,
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
  type ApplyResult,
  type WhyResult,
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
import type { CheckSeverity, CheckResult } from "../../src/cli/lib/validator";
import { stagedFiles } from "../../src/cli/lib/orchestration/git";
import { uiOf, splitArgs, type CommandContext, type CommandUI } from "./ui-helpers";
import { handleSdd } from "./sdd-router";
import {
  handleGateLint,
  handleGateTest,
  handleGateReview,
  handleGatePrecommit,
  handleGateCommit,
} from "./gate-handlers";
import { runReview } from "../../src/cli/lib/gate-runner";

// ===== 类型兜底(unknown,跟 hooks/sdd/index.ts 同构) =====
interface ExtensionAPI {
  registerCommand(
    name: string,
    def: { description: string; handler: (args: string, ctx: unknown) => Promise<unknown> | unknown },
  ): void;
  on(event: string, handler: (e: unknown) => void | Promise<unknown>): void;
  sendMessage(msg: { role: "system" | "user"; content: string }): void;
}
interface ToolCallBlockResult {
  block: true;
  reason: string;
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

// 路径是 PRD 或 Phase 文件
function isPrdOrPhaseFile(path: string): boolean {
  return /\/(prd|phase)\//.test(path);
}

// 检测是否触碰状态行(write 或 edit)
function touchesStatusLine(input: Record<string, unknown>, toolName: string): boolean {
  if (!isPrdOrPhaseFile(String(input.path ?? input.filePath ?? ""))) return false;
  if (toolName === "write") {
    return /^>\s*状态[：:]/m.test(String(input.content ?? ""));
  }
  if (toolName === "edit") {
    return /^\+>\s*状态[：:]/m.test(String(input.body ?? input.new_string ?? ""));
  }
  return false;
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

const SDD_COMMAND_REMINDER = [
  "📜 SDD 文档状态流转协议(始终生效,sdd-pack extension 注入):",
  "",
  "文档状态变更必须通过 /sdd 命令,禁止直接 edit 状态行:",
  "  /sdd init <title>                        # 创建新 PRD(草稿)",
  "  /sdd review                              # 草稿 -> 待评审",
  "  /sdd approve                             # 待评审 -> 已评审",
  "  /sdd plan --phase <title>                # 已评审 -> 已规划任务",
  "  /sdd start                               # 已规划任务 -> 进行中",
  "  /sdd archive --reason <completed|abandoned>",
  "  /sdd back --to <draft|pending>           # 回退",
  "  /sdd phase <start|complete|abandon>      # Phase 流转",
  "  /sdd status                              # 状态面板",
  "  /sdd sync [--fix]                        # meta↔markdown 同步",
  "",
  "状态行篡改会被 tool_call 硬拦截(block)。",
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

const DOC_EDIT_GUIDANCE_DOC = [
  "📝 sdd-doc-edit-guard [hook]: 检测到写 docs/ 目录。",
  "   docs/ 写入请走 skill://sdd-core 流程:",
  "   - 新需求 → skill://sdd-input → spec → PRD → Phase",
  "   - PRD 修改 → skill://sdd-prd",
  "   - Phase 任务 → skill://sdd-phase",
].join("\n");

const DOC_EDIT_GUIDANCE_PHASE = [
  "📝 sdd-doc-edit-guard [hook]: 检测到写 docs/phase/ 目录。",
  "   Phase 写入请走 skill://sdd-phase 流程。Phase 归档用 /sdd-archive-phase（ADR-017）。",
].join("\n");

const DOC_EDIT_GUIDANCE_ARCH_REF = [
  "📝 sdd-doc-edit-guard [hook]: 检测到写 docs/architecture/ 或 docs/reference/ 目录。",
  "   架构文档变更需同步 ADR（docs/architecture/decisions.md）;参考文档变更请确保引用路径有效。",
].join("\n");

const STATUS_LINE_BLOCK_REASON = [
  "🚫 sdd-status-line-guard [hook] 禁止直接编辑 PRD/Phase 状态行:",
  "状态行必须通过 /sdd <transition> 命令流转,不可直接 edit。",
  "可用命令: /sdd init/review/approve/plan/start/archive/back/phase/sync",
].join("\n");

// ===== 旧命令 deprecated 警告(每次执行时) =====

function deprecatedNotify(oldCmd: string, newCmd: string, ctx: unknown): void {
  const c = uiOf(ctx);
  c.ui.notify(`⚠️ /${oldCmd} 已废弃,请使用 /sdd ${newCmd},v1.10.0 删除`, "warning");
}

/** 把旧命令参数转发到 /sdd 子命令 */
function forwardToSdd(subcommand: string, args: string, ctx: unknown): Promise<unknown> {
  return handleSdd(`${subcommand} ${args}`.trim(), ctx);
}

// 向后兼容别名
const DOC_EDIT_GUIDANCE = DOC_EDIT_GUIDANCE_DOC;

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

async function handleArchivePhase(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
  const pos = opts.positional[0];
  if (!pos) {
    const c = uiOf(ctx);
    c.ui.notify("用法: /sdd-archive-phase <phase-path> --reason <completed|abandoned> [--dry-run] [--no-commit]", "error");
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

// ===== Extension factory: 15 个 slash command 注册 =====
export default function (pi: ExtensionAPI): void {
  pi.registerCommand("sdd", {
    description: "SDD 主命令(ADR-018): /sdd <init|review|approve|back|plan|start|archive|phase|status|sync|list|why|apply|validate|gate> [args]",
    handler: handleSdd,
  });
  pi.registerCommand("sdd-validate", {
    description: "校验 docs/ 文档结构 + 状态机 + 交叉引用一致性",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-validate", "validate", ctx);
      return forwardToSdd("validate", args, ctx);
    },
  });
  pi.registerCommand("sdd-propose", {
    description: "创建新 PRD(full / delta 型)",
    handler: handlePropose,
  });
  pi.registerCommand("sdd-archive", {
    description: "归档 PRD(reason: completed|replaced|abandoned)",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-archive", "archive", ctx);
      return forwardToSdd("archive", args, ctx);
    },
  });
  pi.registerCommand("sdd-archive-phase", {
    description: "归档 Phase(reason: completed|abandoned, ADR-017)",
    handler: handleArchivePhase,
  });
  pi.registerCommand("sdd-migrate", {
    description: "状态行堆叠清理 -> 单行 + CHANGELOG",
    handler: handleMigrate,
  });
  pi.registerCommand("sdd-status", {
    description: "所有 PRD/Phase 状态总览",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-status", "status", ctx);
      return forwardToSdd("status", args, ctx);
    },
  });
  pi.registerCommand("sdd-list", {
    description: "带过滤的文档列表",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-list", "list", ctx);
      return forwardToSdd("list", args, ctx);
    },
  });
  pi.registerCommand("sdd-why", {
    description: "查询 lore 决策上下文(file:line)",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-why", "why", ctx);
      return forwardToSdd("why", args, ctx);
    },
  });
  pi.registerCommand("sdd-apply", {
    description: "打印 PRD 实施 checklist",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-apply", "apply", ctx);
      return forwardToSdd("apply", args, ctx);
    },
  });
  pi.registerCommand("sdd-gate-lint", {
    description: "门禁阶段1: lint（失败阻断后续）",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-gate-lint", "gate lint", ctx);
      return forwardToSdd("gate lint", args, ctx);
    },
  });
  pi.registerCommand("sdd-gate-test", {
    description: "门禁阶段2: 功能验证测试（缺则 skip）",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-gate-test", "gate test", ctx);
      return forwardToSdd("gate test", args, ctx);
    },
  });
  pi.registerCommand("sdd-gate-review", {
    description: "门禁阶段3: 检查 reviewer 产物存在且通过",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-gate-review", "gate review", ctx);
      return forwardToSdd("gate review", args, ctx);
    },
  });
  pi.registerCommand("sdd-gate-precommit", {
    description: "门禁阶段4: 再跑 lint + lore 约束检查",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-gate-precommit", "gate precommit", ctx);
      return forwardToSdd("gate precommit", args, ctx);
    },
  });
  pi.registerCommand("sdd-gate-commit", {
    description: "门禁阶段5: lore commit（--message 传 JSON）",
    handler: async (args: string, ctx: unknown) => {
      deprecatedNotify("sdd-gate-commit", "gate commit", ctx);
      return forwardToSdd("gate commit", args, ctx);
    },
  });

  // ===== session_start — 注入 lore protocol + SDD command reminder =====
  pi.on("session_start", (_e) => {
    pi.sendMessage({ role: "system", content: LORE_PROTOCOL_REMINDER });
    pi.sendMessage({ role: "system", content: SDD_COMMAND_REMINDER });
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

    // ===== PRD/Phase 状态行硬拦截(PRD §2.6) =====
    if ((toolName === "write" || toolName === "edit") && touchesStatusLine(input, toolName)) {
      // docs/index.md 不拦截
      const path = String(input.path ?? input.filePath ?? "");
      if (!path.includes("docs/index.md")) {
        return { block: true, reason: STATUS_LINE_BLOCK_REASON };
      }
    }

    if (toolName === "write" || toolName === "edit") {
      const path = typeof input["path"] === "string" ? input["path"] : "";
      if (path.includes("/phase/") || path.startsWith("docs/phase/")) {
        pi.sendMessage({ role: "system", content: DOC_EDIT_GUIDANCE_PHASE });
      } else if (path.includes("/architecture/") || path.includes("/reference/") ||
                 path.startsWith("docs/architecture/") || path.startsWith("docs/reference/")) {
        pi.sendMessage({ role: "system", content: DOC_EDIT_GUIDANCE_ARCH_REF });
      } else if (isDocWritePath(input)) {
        pi.sendMessage({ role: "system", content: DOC_EDIT_GUIDANCE_DOC });
      }
    }
  });
}
