/**
 * archive-ops.ts — archive 操作的具体步骤
 *
 * api.ts archivePrd 的实际工作拆到这里,保证 api.ts 每个函数 ≤ 80 行。
 *
 * 拆解: buildStatusLine / applyStatusLine / moveToArchive /
 *       updateNewPrdSupersedes / mergeDelta
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import { dirname, basename, resolve } from "path";

import { extractStatusLine } from "../doc-parser";
import { addPrdEntry } from "../index-sync";

/** reason → 新状态行 */
export function buildArchiveStatusLine(
  reason: "completed" | "replaced" | "abandoned",
  today: string,
): string {
  switch (reason) {
    case "completed":
      return `> 状态：已归档 | 发布日期：${today}`;
    case "replaced":
      return `> 状态：已替换 | 发布日期：${today}`;
    case "abandoned":
      return `> 状态：已废弃 | 发布日期：${today}`;
  }
}

/** 把 content 中旧状态行替换为新状态行 */
export function applyStatusLine(content: string, newLine: string): string {
  const old = extractStatusLine(content);
  if (!old) return content;
  return content.replace(old, newLine);
}

/** reason=completed 时计算归档目标路径 */
export function archiveDestPath(prdPath: string): string {
  return resolve(dirname(prdPath), "archive", basename(prdPath));
}

/** 移动文件到 archive/(并创建 dir);返回新路径 */
export function moveToArchive(prdPath: string): string {
  const dest = archiveDestPath(prdPath);
  const dir = dirname(dest);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  renameSync(prdPath, dest);
  return dest;
}

/** reason=replaced 时:给旧 PRD 加 > 已被: 反向引用 */
export function appendReplacedByRef(content: string, newPrdPath: string): string {
  if (content.includes("> 已被:")) return content;
  const newPrdRel = `../prd/${basename(resolve(newPrdPath))}`;
  const newPrdName = basename(resolve(newPrdPath), ".md");
  return content.replace(/(> 状态[：:][^\n]+\n)/, `$1> 已被：[${newPrdName}](${newPrdRel}) 替代\n`);
}

/** reason=replaced 时:给新 PRD 加 > 替代: 反向引用 */
export function appendSupersedesRef(newPrdPath: string, oldPrdPath: string): void {
  if (!existsSync(newPrdPath)) return;
  let content = readFileSync(newPrdPath, "utf-8");
  if (content.includes("> 替代:")) return;
  const relPath = `../prd/${basename(oldPrdPath)}`;
  const oldName = basename(oldPrdPath, ".md");
  content = content.replace(/(> 状态[：:][^\n]+\n)/, `$1> 替代：[${oldName}](${relPath})\n`);
  writeFileSync(newPrdPath, content, "utf-8");
}

/** index.md 同步(reason 决定最终状态) */
export function syncIndex(
  indexPath: string,
  targetPath: string,
  reason: "completed" | "replaced" | "abandoned",
  linkText: string,
): boolean {
  if (!existsSync(indexPath)) return false;
  const statusLabel =
    reason === "completed" ? "已归档" : reason === "replaced" ? "已替换" : "已废弃";
  try {
    return addPrdEntry(indexPath, targetPath, statusLabel, linkText);
  } catch {
    return false;
  }
}

/** merge-delta: 解析新 PRD 的 Δ 段,把 ADDED/MODIFIED/REMOVED 合并到旧 PRD,
 *  然后从新 PRD 移除 Δ 段 */
export function mergeDelta(
  oldPrdPath: string,
  newPrdPath: string,
): { merged: boolean; oldBytesDelta: number } {
  if (!existsSync(newPrdPath)) return { merged: false, oldBytesDelta: 0 };
  const newContent = readFileSync(newPrdPath, "utf-8");
  const m = newContent.match(/## Δ 变更摘要[\s\S]*?(?=\n## \d)/);
  if (!m) return { merged: false, oldBytesDelta: 0 };

  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];
  let table: "added" | "modified" | "removed" | "" = "";
  for (const line of m[0].split("\n")) {
    if (line.includes("### ADDED")) table = "added";
    else if (line.includes("### MODIFIED")) table = "modified";
    else if (line.includes("### REMOVED")) table = "removed";
    else if (line.startsWith("| A") && table === "added") added.push(line);
    else if (line.startsWith("| M") && table === "modified") modified.push(line);
    else if (line.startsWith("| R") && table === "removed") removed.push(line);
  }

  let oldContent = readFileSync(oldPrdPath, "utf-8");
  const before = oldContent.length;
  if (added.length > 0) {
    const block = `\n\n### ADDED (merge-delta)\n\n| # | 目标章节 | 新增内容摘要 | 原因 |\n|---|---------|-------------|------|\n${added.join("\n")}\n`;
    oldContent = oldContent.replace(/(## \d+\.)/, `## Δ 合并变更\n${block}\n\n$1`);
  }
  if (modified.length > 0) {
    const block = `\n\n### MODIFIED (merge-delta)\n\n| # | 目标章节 | 原内容 | 新内容 | 原因 |\n|---|---------|--------|--------|------|\n${modified.join("\n")}\n`;
    oldContent = oldContent.replace(/(## \d+\.)/, `${block}\n\n$1`);
  }
  if (removed.length > 0) {
    const block = `\n\n### REMOVED (merge-delta)\n\n| # | 目标章节 | 移除内容 | 原因 |\n|---|---------|---------|------|\n${removed.join("\n")}\n`;
    oldContent = oldContent.replace(/(## \d+\.)/, `${block}\n\n$1`);
  }
  writeFileSync(oldPrdPath, oldContent, "utf-8");
  // 从新 PRD 移除 Δ 段
  const stripped = newContent.replace(/## Δ 变更摘要[\s\S]*?(?=\n## \d)/, "");
  writeFileSync(newPrdPath, stripped, "utf-8");
  return { merged: true, oldBytesDelta: oldContent.length - before };
}
