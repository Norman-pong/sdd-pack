/**
 * archive.ts — sdd archive 命令
 * 归档 PRD，同步 index.md / supersedes 链 / Phase 引用
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import { ParsedArgs, getStringOption, getBoolOption } from "../lib/arg-parser";
import { parseDocument, parseReferences, extractStatusLine } from "../lib/doc-parser";
import { validate, type ValidationConfig } from "../lib/validator";
import { loreCommit, buildTrailer, isLoreAvailable } from "../lib/lore-wrapper";

type ArchiveReason = "completed" | "replaced" | "abandoned";

function printUsage(): void {
  console.error(`用法: sdd archive <prd-path> [选项]

归档 PRD。

参数:
  <prd-path>           目标 PRD 文件路径

选项:
  --reason <type>       归档原因: completed | replaced | abandoned (默认 completed)
  --merge-delta         合并 delta 段到完整 PRD
  --dry-run             仅打印操作清单不执行
  --no-commit           跳过 lore commit
  --new-prd <path>      (--reason replaced 时) 替代本 PRD 的新 PRD 路径
  --help                显示帮助`);
}

export async function archiveCommand(args: ParsedArgs): Promise<void> {
  if (args.options["help"] || args.options["h"]) {
    printUsage();
    process.exit(0);
  }

  const prdPath = args.positional[0];
  if (!prdPath) {
    console.error("错误: 未指定 PRD 路径");
    printUsage();
    process.exit(1);
  }

  const reason = getStringOption(args, "reason", "completed") as ArchiveReason;
  const mergeDelta = getBoolOption(args, "merge-delta");
  const dryRun = getBoolOption(args, "dry-run");
  const noCommit = getBoolOption(args, "no-commit");
  const newPrdPath = getStringOption(args, "new-prd");

  const fullPath = resolve(prdPath);

  // 前置校验
  if (!existsSync(fullPath)) {
    console.error(`错误: 文件不存在: ${prdPath}`);
    process.exit(1);
  }

  const doc = parseDocument(fullPath);
  if (!doc) {
    console.error(`错误: 无法解析 PRD: ${prdPath}`);
    process.exit(1);
  }

  // replaced 需要 --new-prd
  if (reason === "replaced" && !newPrdPath) {
    console.error("错误: --reason replaced 需要 --new-prd <path>");
    process.exit(1);
  }

  if (newPrdPath && !existsSync(resolve(newPrdPath))) {
    console.error(`错误: --new-prd 文件不存在: ${newPrdPath}`);
    process.exit(1);
  }

  // 归档前 validate
  const validationResult = validate({
    docsDir: resolve("docs"),
    severity: "error",
    rulesOnly: false,
    structureOnly: false,
    files: [fullPath],
  });

  if (validationResult.status !== "pass" && validationResult.status !== "warn") {
    console.error("错误: 归档前 validate 不通过，拒绝归档:");
    for (const err of validationResult.errors) {
      console.error(`  ${err}`);
    }
    process.exit(1);
  }

  // 构建操作清单
  const operations: string[] = [];
  const content = readFileSync(fullPath, "utf-8");
  let newContent = content;

  switch (reason) {
    case "completed":
      operations.push(`1. 更新状态行为 "已归档"`);
      operations.push(`2. 移动文件到 docs/prd/archive/`);
      operations.push(`3. 更新 docs/index.md`);
      break;
    case "replaced":
      operations.push(`1. 更新状态行为 "已替换"`);
      operations.push(`2. 添加 > 已被: 反向引用指向新 PRD`);
      operations.push(`3. 更新新 PRD 的 > 替代: 引用`);
      operations.push(`4. 更新 docs/index.md`);
      break;
    case "abandoned":
      operations.push(`1. 更新状态行为 "已废弃"`);
      operations.push(`2. 文件原地不动`);
      operations.push(`3. 更新 docs/index.md`);
      break;
  }

  if (mergeDelta && reason === "replaced" && newPrdPath) {
    operations.push(`5. 合并 delta 段到 ${basename(newPrdPath)}`);
  }

  if (!noCommit && !dryRun) {
    operations.push(`${operations.length + 1}. lore commit`);
  }

  if (dryRun) {
    console.log(`--- dry-run: 归档 ${basename(prdPath)} (reason: ${reason}) ---`);
    for (const op of operations) {
      console.log(`  ${op}`);
    }
    console.log(`--- end dry-run ---`);
    process.exit(0);
  }

  // 执行归档操作
  console.log(`归档: ${basename(prdPath)} (reason: ${reason})`);

  // 1. 更新状态行
  let newStatus: string;
  let destPath: string | undefined;
  const today = new Date().toISOString().split("T")[0];

  switch (reason) {
    case "completed":
      newStatus = `> 状态：已归档 | 发布日期：${today}`;
      destPath = resolve(dirname(fullPath), "archive", basename(fullPath));
      break;
    case "replaced":
      newStatus = `> 状态：已替换 | 发布日期：${today}`;
      break;
    case "abandoned":
      newStatus = `> 状态：已废弃 | 发布日期：${today}`;
      break;
  }

  const statusLine = extractStatusLine(content);
  if (statusLine) {
    newContent = content.replace(statusLine, newStatus);
  }

  // 2. replaced: 添加 > 已被: 反向引用
  if (reason === "replaced" && newPrdPath) {
    const newPrdRel = `../prd/${basename(resolve(newPrdPath))}`;
    if (!newContent.includes("> 已被:")) {
      newContent = newContent.replace(
        /(> 状态[：:][^\n]+\n)/,
        `$1> 已被：[${basename(resolve(newPrdPath), ".md")}](${newPrdRel}) 替代\n`,
      );
    }
  }

  // 3. 写入
  writeFileSync(fullPath, newContent, "utf-8");

  // 4. 移动文件（completed）
  if (reason === "completed" && destPath) {
    const archiveDir = dirname(destPath);
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }
    renameSync(fullPath, destPath);
    console.log(`  已移动: ${fullPath} → ${destPath}`);
  }
  // 5. 更新新 PRD 的 supersedes 引用
  if (reason === "replaced" && newPrdPath) {
    const newPrdFull = resolve(newPrdPath);
    if (existsSync(newPrdFull)) {
      let newContent2 = readFileSync(newPrdFull, "utf-8");
      const relPath = `../prd/${basename(fullPath)}`;
      if (!newContent2.includes("> 替代:")) {
        newContent2 = newContent2.replace(
          /(> 状态[：:][^\n]+\n)/,
          `$1> 替代：[${basename(fullPath, ".md")}](${relPath})\n`,
        );
        writeFileSync(newPrdFull, newContent2, "utf-8");
        console.log(`  已更新新 PRD supersedes: ${basename(newPrdFull)}`);
      }
    }
  }

  console.log(`  状态行已更新`);

  // 5b. index.md 同步（completed 用移动后的路径，其他用原始路径）
  const indexPath = resolve("docs/index.md");
  if (existsSync(indexPath)) {
    try {
      const { addPrdEntry } = await import("../lib/index-sync");
      const indexTargetPath = reason === "completed" ? destPath : fullPath;
      addPrdEntry(indexPath, indexTargetPath, reason === "completed" ? "已归档" : reason === "replaced" ? "已替换" : "已废弃", basename(fullPath, ".md"));
      console.log(`  index.md 已同步`);
    } catch (e) {
      console.warn(`  index.md 同步失败: ${e.message}`);
    }
  }

  // 5c. merge-delta: 将新 PRD 的 Δ 段合并到旧 PRD（--reason replaced 时）
  if (mergeDelta && reason === "replaced" && newPrdPath) {
    const newPrdFull = resolve(newPrdPath);
    if (existsSync(newPrdFull)) {
      let newContent2 = readFileSync(newPrdFull, "utf-8");
      const deltaSection = newContent2.match(/## Δ 变更摘要[\s\S]*?(?=\n## \d)/);
      if (deltaSection) {
        // 解析 Δ 段中的 ADDED/MODIFIED/REMOVED 条目
        const addedLines: string[] = [];
        const modifiedLines: string[] = [];
        const removedLines: string[] = [];
        let currentTable = "";
        for (const line of deltaSection[0].split("\n")) {
          if (line.includes("### ADDED")) currentTable = "added";
          else if (line.includes("### MODIFIED")) currentTable = "modified";
          else if (line.includes("### REMOVED")) currentTable = "removed";
          else if (line.startsWith("| A") && currentTable === "added") addedLines.push(line);
          else if (line.startsWith("| M") && currentTable === "modified") modifiedLines.push(line);
          else if (line.startsWith("| R") && currentTable === "removed") removedLines.push(line);
        }

        // 将 ADDED 条目追加到旧 PRD 对应章节末尾
        let oldContent = newContent;
        if (addedLines.length > 0) {
          const addedBlock = "\n\n### ADDED (merge-delta)\n\n| # | 目标章节 | 新增内容摘要 | 原因 |\n|---|---------|-------------|------|\n" + addedLines.join("\n") + "\n";
          oldContent = oldContent.replace(/(## \d+\.)/, (match) => `## Δ 合并变更\n${addedBlock}\n\n${match}`);
        }
        if (modifiedLines.length > 0) {
          const modBlock = "\n\n### MODIFIED (merge-delta)\n\n| # | 目标章节 | 原内容 | 新内容 | 原因 |\n|---|---------|--------|--------|------|\n" + modifiedLines.join("\n") + "\n";
          oldContent = oldContent.replace(/(## \d+\.)/, (match) => `${modBlock}\n\n${match}`);
        }
        if (removedLines.length > 0) {
          const remBlock = "\n\n### REMOVED (merge-delta)\n\n| # | 目标章节 | 移除内容 | 原因 |\n|---|---------|---------|------|\n" + removedLines.join("\n") + "\n";
          oldContent = oldContent.replace(/(## \d+\.)/, (match) => `${remBlock}\n\n${match}`);
        }

        // 新旧都写回
        writeFileSync(fullPath, oldContent, "utf-8");
        // 移除新 PRD 的 Δ 段
        newContent2 = newContent2.replace(/## Δ 变更摘要[\s\S]*?(?=\n## \d)/, "");
        writeFileSync(newPrdFull, newContent2, "utf-8");
        console.log(`  Δ 段已从 ${basename(newPrdFull)} 移除并合并到 ${basename(fullPath)}`);
      }
    }
  }

  // 6. lore commit
  if (!noCommit) {
    if (isLoreAvailable()) {
      const trailer = buildTrailer(
        "archive",
        `归档 PRD: ${basename(prdPath)} (reason: ${reason})`,
        "docs",
        [prdPath],
      );
      const result = await loreCommit(`归档 ${basename(prdPath)}: ${reason}`, trailer);
      if (result.success) {
        console.log(`  lore commit 成功`);
      } else {
        console.warn(`  lore commit 失败: ${result.stderr}`);
      }
    } else {
      console.warn(`  警告: lore 不可用，跳过 lore commit`);
    }
  }

  console.log(`完成: ${basename(prdPath)} 已归档 (${reason})`);
}
