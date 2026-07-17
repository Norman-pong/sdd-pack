/**
 * index-sync.ts — docs/index.md 自动同步
 *
 * 解析 docs/index.md 表格结构，添加/移动/更新条目
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, relative, basename, dirname } from "path";

/**
 * 在 index.md 的 PRD 表格中添加新条目
 */
export function addPrdEntry(
  indexPath: string,
  filePath: string,
  status: string,
  linkText: string,
): boolean {
  if (!existsSync(indexPath)) return false;

  const content = readFileSync(indexPath, "utf-8");
  const bn = basename(filePath);
  const date = bn.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "????-??-??";
  const newRow = `| [${date}](${relative(dirname(indexPath), filePath)}) | [${linkText}](${relative(dirname(indexPath), filePath)}) | ${status} | — | — |`;


  // 在 PRD 表格的最后一行前插入（在分隔行后）
  const lines = content.split("\n");
  let prdTableEnd = -1;
  let inPrdTable = false;
  let dividerFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("## 产品需求文档（PRD）")) {
      inPrdTable = true;
      dividerFound = false;
      continue;
    }
    if (inPrdTable && /^\|\s*-{3,}/.test(line)) {
      dividerFound = true;
      continue;
    }
    if (inPrdTable && dividerFound && !line.startsWith("|")) {
      prdTableEnd = i;
      break;
    }
    if (line.startsWith("## ") && inPrdTable) {
      prdTableEnd = i;
      break;
    }
  }

  if (prdTableEnd > 0) {
    lines.splice(prdTableEnd, 0, newRow);
    writeFileSync(indexPath, lines.join("\n"), "utf-8");
    return true;
  }

  return false;
}

/**
 * 更新 index.md 中某文件的条目行(状态列;newPath 提供时同步重写链接目标)
 */
export function updateIndexEntry(
  indexPath: string,
  targetFile: string,
  newStatus: string,
  newPath?: string,
): boolean {
  if (!existsSync(indexPath)) return false;

  const content = readFileSync(indexPath, "utf-8");
  const bn = basename(targetFile);
  // 新链接目标(相对 index.md 所在目录)
  const newLink = newPath ? relative(dirname(indexPath), newPath) : null;

  const lines = content.split("\n");
  let updated = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(bn) && lines[i].startsWith("|")) {
      const cols = lines[i].split("|");
      if (cols.length >= 4) {
        // 更新状态列(第 3 列)
        cols[3] = ` ${newStatus} `;
        // 移动后重写链接目标(日期列 + 名称列的相对路径)
        if (newLink) {
          for (let c = 1; c <= 2; c++) {
            cols[c] = cols[c].replace(/\]\([^)]+\)/g, `](${newLink})`);
          }
        }
        lines[i] = cols.join("|");
        updated = true;
      }
    }
  }

  if (updated) {
    writeFileSync(indexPath, lines.join("\n"), "utf-8");
  }

  return updated;
}

/**
 * 检查 index.md 是否已包含某文件
 */
export function indexContains(indexPath: string, fileName: string): boolean {
  if (!existsSync(indexPath)) return false;
  const content = readFileSync(indexPath, "utf-8");
  return content.includes(fileName);
}
