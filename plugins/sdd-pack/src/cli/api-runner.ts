/**
 * api-runner.ts — CI 逃生通道 + bunx sdd 真入口委托层（ADR-019）
 * 用法: bunx sdd <command> [args]  或  bun run plugins/sdd-pack/src/cli/api-runner.ts <command> [args]
 * 退出码: pass=0, warn=0, error=1, block=2
 * 约束: ≤ 250 行（ADR-019 扩 V2 映射后上调）
 */
import { readFileSync } from "node:fs";
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
} from "./api";
import { runLint, runTest, runReview, runPrecommit, runCommit } from "./lib/gate-runner";
import { findRepoRoot } from "./lib/path";
import type { CheckSeverity } from "./lib/validator";
import {
  parseArgs,
  getStringOption,
  getBoolOption,
  getEnumOption,
} from "./lib/orchestration/parseArgs";
import { formatHuman } from "./lib/orchestration/format";

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const cmd = argv[0];
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.error(
      "用法: sdd <command> [args]\n" +
        "  v2: init|review|approve|back|plan|start|archive|phase|phase-archive|sync|status\n" +
        "  legacy-compat: legacy-status\n" +
        "  gate: gate-lint|gate-test|gate-review|gate-precommit|gate-commit",
    );
    process.exit(cmd ? 0 : 1);
  }
  const opts = parseArgs(argv.slice(1));
  const json = getBoolOption(opts, "json");
  const sev = getEnumOption<CheckSeverity>(opts, "severity", ["warn", "error", "block"], "error");
  const enumOpt = <T extends string>(name: string, vals: readonly T[], def: T): T =>
    getEnumOption(opts, name, vals, def);

  let result: unknown;
  switch (cmd) {
    case "validate":
      result = await validateDocs({
        path: getStringOption(opts, "path"),
        staged: getBoolOption(opts, "staged"),
        severity: sev,
        rulesOnly: getBoolOption(opts, "rules-only"),
        structureOnly: getBoolOption(opts, "structure-only"),
      });
      break;
    case "propose":
      result = await proposePrd({
        spec: getStringOption(opts, "spec"),
        supersedes: getStringOption(opts, "supersedes"),
        title: getStringOption(opts, "title"),
        type: enumOpt("type", ["full", "delta"] as const, "full"),
        dryRun: getBoolOption(opts, "dry-run"),
      });
      break;
    case "archive": {
      const reason = enumOpt("reason", ["completed", "abandoned", "replaced"] as const, "completed");
      if (reason === "replaced") {
        // --reason replaced 走 legacy archivePrd（V2 不支持 replaced 语义）
        const pos = opts.positional[0] ?? (console.error("错误: 缺少 prd-path"), process.exit(1));
        result = await archivePrd({
          prdPath: pos,
          reason: "replaced",
          mergeDelta: getBoolOption(opts, "merge-delta"),
          dryRun: getBoolOption(opts, "dry-run"),
          noCommit: getBoolOption(opts, "no-commit"),
          newPrdPath: getStringOption(opts, "new-prd"),
        });
      } else {
        // 默认走 V2（状态机校验 + 7 步同步 + 自检）
        result = await archivePrdV2({ reason });
      }
      break;
    }
    case "migrate": {
      const pos = opts.positional[0] ?? (console.error("错误: 缺少 prd-path"), process.exit(1));
      result = await migratePrd({
        prdPath: pos,
        dryRun: getBoolOption(opts, "dry-run"),
        noBackup: getBoolOption(opts, "no-backup"),
      });
      break;
    }
    case "status":
      // V2 状态面板（含 availableActions；ADR-019 默认走 V2）
      result = await getStatusPanel();
      break;
    case "legacy-status":
      // 保留 legacy getStatus（向后兼容）
      result = await getStatus();
      break;
    case "list":
      result = await listPrds({
        status: getStringOption(opts, "status"),
        date: getStringOption(opts, "date"),
        keyword: getStringOption(opts, "keyword"),
        type: enumOpt("type", ["prd", "phase", "spec"] as const, "prd"),
        json,
      });
      break;
    // ===== ADR-018 V2 状态机命令（bunx sdd <sub>）=====
    case "init":
      result = await initPrd({
        title: getStringOption(opts, "title") || (console.error("错误: 缺少 --title"), process.exit(1)),
        force: getBoolOption(opts, "force"),
        dryRun: getBoolOption(opts, "dry-run"),
      });
      break;
    case "review":
      result = await reviewPrd();
      break;
    case "approve":
      result = await approvePrd({ skipReviewer: getBoolOption(opts, "skip-reviewer") });
      break;
    case "back":
      result = await backPrd({
        to: enumOpt("to", ["draft", "pending"] as const, "draft"),
      });
      break;
    case "plan":
      result = await planPrd({
        phase: getStringOption(opts, "phase"),
        link: getStringOption(opts, "link"),
      });
      break;
    case "start":
      result = await startPrd();
      break;
    case "phase":
      result = await phaseTransition({
        id: getStringOption(opts, "id") || undefined,
        action: enumOpt("action", ["start", "complete", "abandon"] as const, "start"),
      });
      break;
    case "phase-archive": {
      const pos = opts.positional[0] ?? (console.error("错误: 缺少 phase-path"), process.exit(1));
      result = await archivePhase({
        phasePath: pos,
        reason: enumOpt("reason", ["completed", "abandoned"] as const, "completed"),
        dryRun: getBoolOption(opts, "dry-run"),
        noCommit: getBoolOption(opts, "no-commit"),
      });
      break;
    }
    case "sync":
      result = await syncMeta({ fix: getBoolOption(opts, "fix") });
      break;
    case "gate": {
      // sdd-router 的 /sdd gate 是单入口（tokens 分派），api-runner 按 --stage 转发
      const stage = enumOpt("stage", ["lint", "test", "review", "precommit", "commit"] as const, "lint");
      if (stage === "lint") result = runLint(findRepoRoot());
      else if (stage === "test") result = runTest(findRepoRoot());
      else if (stage === "review") result = runReview(findRepoRoot(), getStringOption(opts, "sha") || undefined);
      else if (stage === "precommit") result = runPrecommit(findRepoRoot());
      else {
        const messageFile = getStringOption(opts, "message-file");
        const message = messageFile
          ? readFileSync(messageFile, "utf-8")
          : getStringOption(opts, "message");
        if (!message) {
          console.error("错误: 缺少 commit message。用 --message '<json>' 或 --message-file <path>");
          process.exit(1);
        }
        result = runCommit(findRepoRoot(), message);
      }
      break;
    }
    case "gate-lint":
      result = runLint(findRepoRoot());
      break;
    case "gate-test":
      result = runTest(findRepoRoot());
      break;
    case "gate-review":
      result = runReview(findRepoRoot(), getStringOption(opts, "sha") || undefined);
      break;
    case "gate-precommit":
      result = runPrecommit(findRepoRoot());
      break;
    case "gate-commit": {
      const messageFile = getStringOption(opts, "message-file");
      const message = messageFile
        ? readFileSync(messageFile, "utf-8")
        : getStringOption(opts, "message");
      if (!message) {
        console.error("错误: 缺少 commit message。用 --message '<json>' 或 --message-file <path>");
        process.exit(1);
      }
      result = runCommit(findRepoRoot(), message);
      break;
    }
    case "why":
      result = await getWhy(opts.positional[0] ?? "");
      break;
    case "apply": {
      const pos = opts.positional[0] ?? (console.error("错误: 缺少 prd-path"), process.exit(1));
      result = await getApplyChecklist(pos);
      break;
    }
    default:
      console.error(`未知命令: ${cmd}`);
      process.exit(1);
  }
  if (json || !(result !== null && typeof result === "object" && "checks" in result)) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatHuman(result as Parameters<typeof formatHuman>[0]));
  }
  const status = result !== null && typeof result === "object" && "status" in result
    ? (result as { status?: string }).status
    : undefined;
  process.exit(status === "block" ? 2 : status === "error" ? 1 : 0);
}

// 直接执行（bun run api-runner.ts 或 bunx sdd）时走 main；被 import 时（bin.ts 复用）不自动执行
if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error("错误:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
