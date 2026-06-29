/**
 * why.ts — sdd why 命令
 * 查询 lore 决策上下文（包装 lore why）
 */

import { ParsedArgs, getBoolOption } from "../lib/arg-parser";
import { isLoreAvailable } from "../lib/lore-wrapper";

function printUsage(): void {
  console.error(`用法: sdd why <file>:<line> [选项]

查询 lore 决策上下文（包装 lore why）。

参数:
  <file>:<line>   文件路径加行号

选项:
  --json          尝试解析 lore 输出为 JSON
  --help          显示帮助`);
}

export async function whyCommand(args: ParsedArgs): Promise<void> {
  if (args.options["help"] || args.options["h"]) {
    printUsage();
    process.exit(0);
  }

  const target = args.positional[0];
  if (!target) {
    console.error("错误: 未指定目标 (file:line)");
    process.exit(1);
  }

  if (!isLoreAvailable()) {
    console.error("错误: lore CLI 不可用，请先安装 lore");
    process.exit(1);
  }

  const jsonOutput = getBoolOption(args, "json");

  const { spawnSync } = await import("bun");
  const loreArgs = ["why", target];
  const result = spawnSync(["lore", ...loreArgs]);

  if (result.exitCode !== 0) {
    console.error(`lore why 失败: ${result.stderr.toString()}`);
    process.exit(result.exitCode ?? 1);
  }

  const output = result.stdout.toString().trim();

  if (jsonOutput) {
    try {
      const parsed = JSON.parse(output);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(JSON.stringify({ text: output }));
    }
  } else {
    console.log(output);
  }
}
