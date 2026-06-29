/**
 * status.ts — sdd status 命令
 * 所有 PRD/Phase 状态总览
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve, relative } from "path";
import { ParsedArgs, getBoolOption } from "../lib/arg-parser";
import { parseDocument, isTemplateFile } from "../lib/doc-parser";

function printUsage(): void {
  console.error(`用法: sdd status [选项]

显示所有 PRD/Phase 状态总览。

选项:
  --json     JSON 输出
  --help     显示帮助`);
}

interface StatusItem {
  path: string;
  fileName: string;
  type: "prd" | "phase";
  status: string;
  version?: string;
  publishDate?: string;
  references: string[];
}

export async function statusCommand(args: ParsedArgs): Promise<void> {
  if (args.options["help"] || args.options["h"]) {
    printUsage();
    process.exit(0);
  }

  const jsonOutput = getBoolOption(args, "json");
  const docsDir = resolve("docs");
  const items: StatusItem[] = [];

  // 扫描 PRD 目录
  const prdDir = resolve(docsDir, "prd");
  if (existsSync(prdDir)) {
    for (const entry of readdirSync(prdDir)) {
      if (!entry.endsWith(".md") || isTemplateFile(entry)) continue;
      const filePath = resolve(prdDir, entry);
      if (!statSync(filePath).isFile()) continue;

      const doc = parseDocument(filePath);
      if (doc && doc.parsedStatus) {
        const refs: string[] = [];
        if (doc.references.phaseRef) refs.push(`phase: ${basename(doc.references.phaseRef)}`);
        if (doc.references.supersedes) refs.push(`supersedes: ${basename(doc.references.supersedes)}`);
        if (doc.references.supersededBy) refs.push(`superseded-by: ${basename(doc.references.supersededBy)}`);

        items.push({
          path: relative(docsDir, filePath),
          fileName: entry,
          type: "prd",
          status: doc.parsedStatus.status,
          version: doc.parsedStatus.version,
          publishDate: doc.parsedStatus.publishDate,
          references: refs,
        });
      }
    }
  }

  // 扫描 Phase 目录
  const phaseDir = resolve(docsDir, "phase");
  if (existsSync(phaseDir)) {
    for (const entry of readdirSync(phaseDir)) {
      if (!entry.endsWith(".md") || isTemplateFile(entry)) continue;
      const filePath = resolve(phaseDir, entry);
      if (!statSync(filePath).isFile()) continue;

      const doc = parseDocument(filePath);
      if (doc && doc.parsedStatus) {
        const refs: string[] = [];
        if (doc.references.prdRef) refs.push(`prd: ${basename(doc.references.prdRef)}`);

        items.push({
          path: relative(docsDir, filePath),
          fileName: entry,
          type: "phase",
          status: doc.parsedStatus.status,
          version: doc.parsedStatus.version,
          publishDate: doc.parsedStatus.publishDate,
          references: refs,
        });
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(items, null, 2));
    process.exit(0);
  }

  // 人读格式
  if (items.length === 0) {
    console.log("  无文档");
    process.exit(0);
  }

  // PRD 表
  console.log("PRD:");
  console.log("  " + "-".repeat(80));
  console.log("  | 文件名 | 状态 | 版本 | 引用 |");
  console.log("  " + "-".repeat(80));
  for (const item of items.filter((i) => i.type === "prd")) {
    console.log(
      `  | ${item.fileName} | ${item.status} | ${item.version || "-"} | ${item.references.join(", ") || "-"} |`,
    );
  }

  // Phase 表
  console.log("\nPhase:");
  console.log("  " + "-".repeat(80));
  console.log("  | 文件名 | 状态 | 版本 | 引用 |");
  console.log("  " + "-".repeat(80));
  for (const item of items.filter((i) => i.type === "phase")) {
    console.log(
      `  | ${item.fileName} | ${item.status} | ${item.version || "-"} | ${item.references.join(", ") || "-"} |`,
    );
  }

  console.log(`\n总计: ${items.length} 文档`);
}

function basename(p: string): string {
  return p.split("/").pop() || p;
}
