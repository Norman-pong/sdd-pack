/**
 * openspec-api-runner.ts — OpenSpec CI 逃生通道
 * 用法: bun run plugins/sdd-pack/src/cli/openspec-api-runner.ts <command> [args]
 *
 * 7 命令 → 7 export 映射:
 *   init-check     → getInitState()
 *   status         → getStatus()
 *   validate       → validateProject({changeId?, severity?})
 *   list           → listChanges({status?})
 *   show           → showItem(changeId)
 *   instructions   → getInstructions()
 *   archive        → archiveChange({changeId, noCommit?})
 *
 * 退出码: pass=0, warn=0, error=1, not-initialized=2
 * 约束: ≤ 100 行
 */

import {
  getInitState,
  getStatus,
  validateProject,
  listChanges,
  showItem,
  getInstructions,
  archiveChange,
} from "./openspec-api";

const cmd = process.argv[2];
if (!cmd || cmd === "--help" || cmd === "-h") {
  console.error(
    "用法: bun run openspec-api-runner.ts " +
      "<init-check|status|validate|list|show|instructions|archive> [args]",
  );
  process.exit(cmd ? 0 : 1);
}

function argValue(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : fallback;
}
function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  let result: unknown;
  switch (cmd) {
    case "init-check":
      result = await getInitState();
      break;
    case "status":
      result = await getStatus();
      break;
    case "validate":
      result = await validateProject({
        changeId: argValue("change") || undefined,
        severity: argValue("severity") === "warn" ? "warn" : "error",
      });
      break;
    case "list":
      result = await listChanges({
        status: argValue("status") === "archived" ? "archived" : "active",
      });
      break;
    case "show": {
      const id = process.argv[3];
      if (!id) {
        console.error("错误: 缺少 change-id");
        process.exit(1);
      }
      result = await showItem(id);
      break;
    }
    case "instructions":
      result = await getInstructions();
      break;
    case "archive": {
      const id = process.argv[3];
      if (!id) {
        console.error("错误: 缺少 change-id");
        process.exit(1);
      }
      result = await archiveChange({ changeId: id, noCommit: argFlag("no-commit") });
      break;
    }
    default:
      console.error(`未知命令: ${cmd}`);
      process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
  const status = (result as { status?: string }).status;
  const initialized = (result as { initialized?: boolean }).initialized;
  if (initialized === false) process.exit(2);
  process.exit(status === "error" ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error("错误:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
