/**
 * sdd-extension — omp slash command 集合
 *
 * 装载: omp --extension plugins/sdd-pack/extensions/sdd-extension/index.ts
 * 决策: docs/architecture/decisions.md ADR-009(替代 ADR-008 独立 CLI)
 *
 * 约束:
 * - 单文件 ≤ 400 行(phase doc T002 硬上限)
 * - 8 个 pi.registerCommand
 * - 不用 @oh-my-pi/pi-coding-agent 类型(unknown 兜底,跟 hooks/index.ts 同构)
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
import type { CheckSeverity } from "../../src/cli/lib/validator";

// ===== 类型兜底(unknown,跟 hooks/index.ts 同构) =====
interface ExtensionAPI {
  registerCommand(
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

// ===== 统一 UI adapter:把 ValidationResult 映射到 ctx.ui =====
function notifyBySeverity(
  result: { status: string; errors: string[]; warnings: string[] },
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
  ctx.ui.notify(level, formatSummary(result));
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
  c.ui.setWidget(formatHuman(result));
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
    c.ui.notify("info", `已创建: ${result.path}\n${result.next ?? ""}`);
  } else {
    c.ui.notify("error", `创建失败: ${result.errors.join("; ")}`);
  }
  return result;
}

async function handleArchive(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
  const pos = opts.positional[0];
  if (!pos) {
    const c = uiOf(ctx);
    c.ui.notify(
      "error",
      "用法: /sdd-archive <prd-path> [--reason <type>] [--merge-delta] [--dry-run] [--no-commit] [--new-prd <path>]",
    );
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
  if (result.status === "pass") c.ui.notify("info", `归档完成: ${pos} (${reason})`);
  else c.ui.notify("error", `归档失败: ${result.errors.join("; ")}`);
  return result;
}

async function handleMigrate(args: string, ctx: unknown): Promise<unknown> {
  const opts = parseArgs(splitArgs(args));
  const pos = opts.positional[0];
  if (!pos) {
    const c = uiOf(ctx);
    c.ui.notify("error", "用法: /sdd-migrate <prd-path> [--dry-run] [--no-backup]");
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
    c.ui.notify("info", `迁移完成: 解析 ${result.parsedEntries} 个版本`);
  else c.ui.notify("error", `迁移失败: ${result.errors.join("; ")}`);
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
  c.ui.setWidget(lines.join("\n"));
  c.ui.notify("info", `状态总览: ${result.items.length} 个文档`);
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
  c.ui.setWidget(lines.join("\n"));
  c.ui.notify("info", `列表: ${result.matched} 个匹配`);
  return result;
}

async function handleWhy(args: string, ctx: unknown): Promise<unknown> {
  const target = splitArgs(args)[0] ?? "";
  const result: WhyResult = await getWhy(target);
  const c = uiOf(ctx);
  if (result.error) c.ui.notify("error", result.error);
  else c.ui.notify("info", result.text || "(无输出)");
  return result;
}

async function handleApply(args: string, ctx: unknown): Promise<unknown> {
  const prdPath = splitArgs(args)[0] ?? "";
  const c = uiOf(ctx);
  if (!prdPath) {
    c.ui.notify("error", "用法: /sdd-apply <prd-path>");
    return { error: "missing prd-path" };
  }
  try {
    const result: ApplyResult = await getApplyChecklist(prdPath);
    if (result.total === 0) c.ui.notify("warn", "未找到 checklist 条目");
    else {
      const lines = [`验收标准: ${result.prdPath}`, ""];
      for (const item of result.items)
        lines.push(`  ${String(item.id).padStart(2)}. [ ] ${item.description}`);
      lines.push(`\n总计: ${result.total} 条`);
      c.ui.setWidget(lines.join("\n"));
      c.ui.notify("info", `提取 ${result.total} 条 checklist`);
    }
    return result;
  } catch (e) {
    c.ui.notify("error", e instanceof Error ? e.message : String(e));
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ===== Extension factory:8 个 slash command 注册 =====
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
    description: "状态行堆叠清理 → 单行 + CHANGELOG",
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
}
