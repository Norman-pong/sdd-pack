/**
 * migrate.ts — sdd migrate 命令
 * 状态行堆叠 → 规范格式 + CHANGELOG
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import { ParsedArgs, getBoolOption } from "../lib/arg-parser";
import { parseStackedStatusLine, extractStatusLine, parseStatusLine, parseDocument } from "../lib/doc-parser";
import { validate, type ValidationConfig } from "../lib/validator";

type MigrationEntry = {
  version: string;
  date?: string;
  description: string;
};

function printUsage(): void {
  console.error(`用法: sdd migrate <prd-path> [选项]

状态行堆叠 → 规范格式 + CHANGELOG。

参数:
  <prd-path>     目标 PRD 文件路径

选项:
  --dry-run       仅预览不写入
  --no-backup     跳过备份
  --help          显示帮助`);
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateChangelog(entries: MigrationEntry[], sourceFile: string): string {
  const name = basename(sourceFile, ".md");
  const today = getToday();

  let changelog = `# ${name} 变更历史

> 来源：从 PRD 状态行自动迁移（sdd migrate）
> 迁移日期：${today}

| 版本 | 日期 | 变更内容 |
|------|------|---------|
`;

  for (const entry of entries) {
    const date = entry.date || "日期待确认";
    changelog += `| ${entry.version} | ${date} | ${entry.description} |\n`;
  }

  return changelog;
}

export async function migrateCommand(args: ParsedArgs): Promise<void> {
  if (args.options["help"] || args.options["h"]) {
    printUsage();
    process.exit(0);
  }

  const prdPath = args.positional[0];
  if (!prdPath) {
    console.error("错误: 未指定 PRD 路径");
    process.exit(1);
  }

  const dryRun = getBoolOption(args, "dry-run");
  const noBackup = getBoolOption(args, "no-backup");

  const fullPath = resolve(prdPath);
  if (!existsSync(fullPath)) {
    console.error(`错误: 文件不存在: ${prdPath}`);
    process.exit(1);
  }

  const content = readFileSync(fullPath, "utf-8");
  const statusLine = extractStatusLine(content);
  if (!statusLine) {
    console.error(`错误: 未找到状态行`);
    process.exit(1);
  }

  // 解析堆叠状态行
  const stackedEntries = parseStackedStatusLine(statusLine);
  if (!stackedEntries) {
    // 尝试解析为规范格式
    const parsed = parseStatusLine(statusLine);
    if (parsed) {
      console.log(`状态行已是规范格式，无需迁移`);
      process.exit(0);
    }
    console.log(`SKIP: 无法解析状态行格式，建议手动清理: ${statusLine}`);
    process.exit(0);
  }

  // 转换为迁移条目
  const entries: MigrationEntry[] = stackedEntries.map((e) => ({
    version: e.version,
    date: e.date,
    description: e.description || e.status || "",
  }));

  // 找出最新版本
  const latestEntry = entries[0];
  const latestStatus = parseStatusLine(statusLine);

  if (dryRun) {
    console.log(`--- dry-run: 迁移 ${basename(prdPath)} ---`);
    console.log(`将清理 ${entries.length} 个堆叠版本:`);
    for (const entry of entries) {
      console.log(`  v${entry.version}${entry.date ? ` (${entry.date})` : ""}: ${entry.description}`);
    }
    console.log(`\n新状态行预览:`);
    const currentStatus = latestStatus?.status || stackedEntries[0]?.status || "已发布";
    console.log(`  > 状态：${currentStatus} | 发布日期：${latestEntry.date || "YYYY-MM-DD"} | 版本：${latestEntry.version}`);
    console.log(`  > 变更历史：见 [CHANGELOG](./CHANGELOG-${basename(prdPath)})`);
    console.log(`将生成 CHANGELOG (${entries.length} 行)`);
    console.log(`--- end dry-run ---`);
    process.exit(0);
  }

  // 备份
  if (!noBackup) {
    const backupDir = resolve(dirname(fullPath), ".migration-backup");
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }
    const backupPath = resolve(backupDir, `${basename(fullPath)}.bak`);
    writeFileSync(backupPath, content, "utf-8");
    console.log(`已备份: ${backupPath}`);
  }

  // 生成 CHANGELOG
  const changelogDir = resolve(dirname(fullPath), "archive");
  if (!existsSync(changelogDir)) {
    mkdirSync(changelogDir, { recursive: true });
  }
  const changelogPath = resolve(dirname(fullPath), `CHANGELOG-${basename(fullPath)}`);
  const changelogContent = generateChangelog(entries, fullPath);
  writeFileSync(changelogPath, changelogContent, "utf-8");
  console.log(`已生成 CHANGELOG: ${changelogPath}`);

  // 规范化状态行
  const currentStatus = latestStatus?.status || stackedEntries[0]?.status || "已发布";
  const newStatusLine = `> 状态：${currentStatus} | 发布日期：${latestEntry.date || getToday()} | 版本：${latestEntry.version}`;
  const changelogRel = `./CHANGELOG-${basename(fullPath)}`;
  const newChangelogLine = `> 变更历史：见 [CHANGELOG](${changelogRel})`;

  const newContent = content
    .replace(statusLine, newStatusLine + "\n" + newChangelogLine);

  writeFileSync(fullPath, newContent, "utf-8");
  console.log(`已更新状态行: ${newStatusLine}`);

  // 验证
  const validationResult = validate({
    docsDir: resolve("docs"),
    severity: "error",
    rulesOnly: false,
    structureOnly: false,
    files: [fullPath],
  });

  if (validationResult.status === "pass") {
    console.log(`✓ 迁移后 validate 通过`);
  } else {
    console.warn(`⚠ 迁移后 validate 有违规:`);
    for (const err of validationResult.errors) {
      console.warn(`  ${err}`);
    }
  }

  console.log(`完成: ${basename(prdPath)} 状态行已规范化`);
}
