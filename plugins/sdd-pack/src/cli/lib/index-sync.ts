/**
 * index-sync.ts — docs/index.md 自动同步
 *
 * 解析 docs/index.md 表格结构，添加/移动/更新条目
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, relative, basename } from "path";

/** 索引条目 */
export interface IndexEntry {
  date: string;
  name: string;
  path: string;
  status: string;
  linkText: string;
}

/**
 * 解析 index.md 的 PRD 表格
 * 返回表格行数组（简单字符串行，不做完整 markdown AST 解析）
 */
export function parsePrdTable(indexPath: string): string[] {
  const content = readFileSync(indexPath, "utf-8");
  const lines = content.split("\n");

  let inPrdTable = false;
  let inPhaseTable = false;
  const prdRows: string[] = [];
  const phaseRows: string[] = [];

  for (const line of lines) {
    // 检测表格开始
    if (line.includes("## 产品需求文档（PRD）")) {
      inPrdTable = true;
      inPhaseTable = false;
      continue;
    }
    if (line.includes("## 阶段文档（Phase）")) {
      inPrdTable = false;
      inPhaseTable = true;
      continue;
    }
    if (line.startsWith("## ")) {
      inPrdTable = false;
      inPhaseTable = false;
    }

    if (inPrdTable && line.startsWith("|")) {
      prdRows.push(line);
    }
    if (inPhaseTable && line.startsWith("|")) {
      phaseRows.push(line);
    }
  }

  return prdRows;
}

/**
 * 在 index.md 的 PRD 表格中添加新条目
 */
export function addPrdEntry(indexPath: string, filePath: string, status: string, linkText: string): boolean {
  if (!existsSync(indexPath)) return false;

  const content = readFileSync(indexPath, "utf-8");
  const bn = basename(filePath);
  const date = bn.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "????-??-??";

  const newRow = `| [${date}](${relative(resolve("."), filePath)}) | [${linkText}](${relative(resolve("."), filePath)}) | ${status} | — | — |`;

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
    if (inPrdTable && line.includes("|---")) {
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
 * 更新 index.md 中某文件的条目行
 */
export function updateIndexEntry(
  indexPath: string,
  targetFile: string,
  newStatus: string,
): boolean {
  if (!existsSync(indexPath)) return false;

  const content = readFileSync(indexPath, "utf-8");
  const bn = basename(targetFile);

  const lines = content.split("\n");
  let updated = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(bn) && lines[i].startsWith("|")) {
      // 将状态列（第 3 列）替换为新状态
      const cols = lines[i].split("|");
      if (cols.length >= 4) {
        cols[3] = ` ${newStatus} `;
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
