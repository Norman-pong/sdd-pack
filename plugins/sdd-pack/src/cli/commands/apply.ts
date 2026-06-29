/**
 * apply.ts — sdd apply 命令
 * 打印 PRD 实施 checklist（不操作文件）
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { ParsedArgs, getBoolOption } from "../lib/arg-parser";

function printUsage(): void {
  console.error(`用法: sdd apply <prd-path> [选项]

打印 PRD 验收标准 checklist。

参数:
  <prd-path>    目标 PRD 文件路径

选项:
  --json         JSON 输出
  --help         显示帮助`);
}

interface CheckItem {
  id: number;
  description: string;
  section: string;
}

export async function applyCommand(args: ParsedArgs): Promise<void> {
  if (args.options["help"] || args.options["h"]) {
    printUsage();
    process.exit(0);
  }

  const prdPath = args.positional[0];
  if (!prdPath) {
    console.error("错误: 未指定 PRD 路径");
    process.exit(1);
  }

  const jsonOutput = getBoolOption(args, "json");
  const fullPath = resolve(prdPath);

  if (!existsSync(fullPath)) {
    console.error(`错误: 文件不存在: ${prdPath}`);
    process.exit(1);
  }

  const content = readFileSync(fullPath, "utf-8");

  // 提取所有 - [ ] checklist 条目
  const items: CheckItem[] = [];
  let currentSection = "unknown";
  let itemId = 0;

  const lines = content.split("\n");
  for (const line of lines) {
    // 检测章节标题
    const sectionMatch = line.match(/^###?\s+([^#].+)/);
    if (sectionMatch) {
      // 只识别 §8 验收标准下的子章节
      if (sectionMatch[1].includes("验收")) {
        currentSection = sectionMatch[1].trim();
      }
    }

    // 检测 checklist 条目
    const checklistMatch = line.match(/^\s*-\s*\[ ?\]\s*(.+)/);
    if (checklistMatch) {
      itemId++;
      items.push({
        id: itemId,
        description: checklistMatch[1].trim(),
        section: currentSection,
      });
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(items, null, 2));
    process.exit(0);
  }

  if (items.length === 0) {
    console.log(`  无验收标准条目 (${basename(fullPath)})`);
    process.exit(0);
  }

  console.log(`验收标准: ${basename(fullPath)}`);
  console.log(`  ${"-".repeat(60)}`);
  for (const item of items) {
    console.log(`  ${String(item.id).padStart(2)}. [ ] ${item.description}`);
  }
  console.log(`\n  总计: ${items.length} 条`);
}

function basename(p: string): string {
  return p.split("/").pop() || p;
}
