/**
 * list.ts — sdd list 命令
 * 带过滤的文档列表
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
import { ParsedArgs, getStringOption, getBoolOption } from "../lib/arg-parser";
import { parseDocument, isTemplateFile, extractH1 } from "../lib/doc-parser";

function printUsage(): void {
  console.error(`用法: sdd list [选项]

带过滤的文档列表。

选项:
  --status <状态>      按状态过滤（如 草稿）
  --date <YYYY-MM-DD>   按日期过滤
  --keyword <关键词>    按标题/文件名模糊匹配
  --type <prd|phase>    限制文档类型
  --json                JSON 输出
  --help                显示帮助`);
}

interface ListItem {
  date: string;
  fileName: string;
  type: string;
  status: string;
  title: string;
  path: string;
}

function scanDir(dirPath: string, type: string): ListItem[] {
  const items: ListItem[] = [];

  if (!existsSync(dirPath)) return items;

  for (const entry of readdirSync(dirPath)) {
    if (!entry.endsWith(".md") || isTemplateFile(entry)) continue;
    const filePath = resolve(dirPath, entry);
    if (!statSync(filePath).isFile()) continue;

    const content = readFileSync(filePath, "utf-8");
    const title = extractH1(content) || entry;
    const doc = parseDocument(filePath);
    const status = doc?.parsedStatus?.status || "?";
    const date = entry.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "????-??-??";

    items.push({ date, fileName: entry, type, status, title, path: filePath });
  }

  return items;
}

export async function listCommand(args: ParsedArgs): Promise<void> {
  if (args.options["help"] || args.options["h"]) {
    printUsage();
    process.exit(0);
  }

  const statusFilter = getStringOption(args, "status");
  const dateFilter = getStringOption(args, "date");
  const keyword = getStringOption(args, "keyword");
  const typeFilter = getStringOption(args, "type");
  const jsonOutput = getBoolOption(args, "json");

  const docsDir = resolve("docs");
  let items: ListItem[] = [];

  if (!typeFilter || typeFilter === "prd") {
    items.push(...scanDir(resolve(docsDir, "prd"), "prd"));
  }
  if (!typeFilter || typeFilter === "phase") {
    items.push(...scanDir(resolve(docsDir, "phase"), "phase"));
  }

  // 过滤
  if (statusFilter) {
    items = items.filter((i) => i.status === statusFilter);
  }
  if (dateFilter) {
    items = items.filter((i) => i.date === dateFilter);
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    items = items.filter(
      (i) => i.title.toLowerCase().includes(kw) || i.fileName.toLowerCase().includes(kw),
    );
  }

  // 按日期排序（倒序）
  items.sort((a, b) => b.date.localeCompare(a.date));

  if (jsonOutput) {
    console.log(JSON.stringify(items, null, 2));
    process.exit(0);
  }

  if (items.length === 0) {
    console.log("  无匹配文档");
    process.exit(0);
  }

  console.log("  日期        | 文件名                                      | 类型  | 状态    | 标题");
  console.log("  " + "-".repeat(100));
  for (const item of items) {
    console.log(
      `  ${item.date} | ${item.fileName.padEnd(45)} | ${item.type.padEnd(4)} | ${item.status.padEnd(6)} | ${item.title}`,
    );
  }

  console.log(`\n匹配: ${items.length} 文档`);
}
