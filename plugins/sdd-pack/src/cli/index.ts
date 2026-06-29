#!/usr/bin/env bun
/**
 * sdd CLI 入口
 * 参数解析 + 子命令路由
 */

import { parseArgs } from "./lib/arg-parser";
import { validateCommand } from "./commands/validate";
import { proposeCommand } from "./commands/propose";
import { archiveCommand } from "./commands/archive";
import { statusCommand } from "./commands/status";
import { listCommand } from "./commands/list";
import { migrateCommand } from "./commands/migrate";
import { whyCommand } from "./commands/why";
import { applyCommand } from "./commands/apply";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    process.exit(0);
  }

  if (args[0] === "--version" || args[0] === "-V") {
    printVersion();
    process.exit(0);
  }

  const command = args[0];
  const cmdArgs = parseArgs(args.slice(1));

  switch (command) {
    case "validate":
      await validateCommand(cmdArgs);
      break;
    case "propose":
      await proposeCommand(cmdArgs);
      break;
    case "archive":
      await archiveCommand(cmdArgs);
      break;
    case "status":
      await statusCommand(cmdArgs);
      break;
    case "list":
      await listCommand(cmdArgs);
      break;
    case "migrate":
      await migrateCommand(cmdArgs);
      break;
    case "why":
      await whyCommand(cmdArgs);
      break;
    case "apply":
      await applyCommand(cmdArgs);
      break;
    default:
      console.error(`未知命令: ${command}`);
      console.error("可用命令: validate, propose, archive, status, list, migrate, why, apply");
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`sdd — SDD 文档生命周期 CLI

用法: sdd <命令> [选项]

命令:
  validate [path]  校验文档结构和状态机合规
  propose          创建新 PRD 或 delta 变更
  archive          归档 PRD
  status           显示所有 PRD/Phase 状态总览
  list             带过滤的文档列表
  migrate          状态行堆叠 → 规范格式 + CHANGELOG
  why              查询 lore 决策上下文
  apply            打印实施 checklist

通用选项:
  --help, -h       显示帮助
  --version, -V    显示版本

运行 'sdd <命令> --help' 查看子命令详情`);
}

function printVersion(): void {
  console.log("sdd v1.3.0-rc.1");
}

main().catch((err) => {
  console.error("sdd 错误:", err.message);
  process.exit(1);
});
