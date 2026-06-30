/**
 * api-runner.ts — CI 逃生通道
 * 用法: bun run plugins/sdd-pack/src/cli/api-runner.ts <command> [args]
 * 退出码: pass=0, warn=0, error=1, block=2
 * 约束: ≤ 100 行
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
  type CheckSeverity,
} from "./api";
import {
  parseArgs,
  getStringOption,
  getBoolOption,
  getEnumOption,
} from "./lib/orchestration/parseArgs";
import { formatHuman } from "./lib/orchestration/format";

const cmd = process.argv[2];
if (!cmd || cmd === "--help" || cmd === "-h") {
  console.error(
    "用法: bun run api-runner.ts <validate|propose|archive|migrate|status|list|why|apply> [args]",
  );
  process.exit(cmd ? 0 : 1);
}
const opts = parseArgs(process.argv.slice(3));
const json = getBoolOption(opts, "json");
const sev = getEnumOption<CheckSeverity>(opts, "severity", ["warn", "error", "block"], "error");
const enumOpt = <T extends string>(name: string, vals: readonly T[], def: T): T =>
  getEnumOption(opts, name, vals, def);

async function main(): Promise<void> {
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
        type: enumOpt("type", ["full", "delta"], "full"),
        dryRun: getBoolOption(opts, "dry-run"),
      });
      break;
    case "archive": {
      const pos = opts.positional[0] ?? (console.error("错误: 缺少 prd-path"), process.exit(1));
      result = await archivePrd({
        prdPath: pos,
        reason: enumOpt("reason", ["completed", "replaced", "abandoned"], "completed"),
        mergeDelta: getBoolOption(opts, "merge-delta"),
        dryRun: getBoolOption(opts, "dry-run"),
        noCommit: getBoolOption(opts, "no-commit"),
        newPrdPath: getStringOption(opts, "new-prd"),
      });
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
      result = await getStatus();
      break;
    case "list":
      result = await listPrds({
        status: getStringOption(opts, "status"),
        date: getStringOption(opts, "date"),
        keyword: getStringOption(opts, "keyword"),
        type: enumOpt("type", ["prd", "phase", "spec"], "prd"),
        json,
      });
      break;
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
  if (json || !("checks" in (result as object))) console.log(JSON.stringify(result, null, 2));
  else console.log(formatHuman(result as Parameters<typeof formatHuman>[0]));
  const status = (result as { status?: string })?.status;
  process.exit(status === "block" ? 2 : status === "error" ? 1 : 0);
}
main().catch((e: unknown) => {
  console.error("错误:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
