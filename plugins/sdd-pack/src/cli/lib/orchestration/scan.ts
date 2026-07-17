/**
 * scan.ts — 跨调用方的目录扫描
 *
 * api.ts 的 getStatus / listPrds 需要扫描 docs/prd 和 docs/phase;
 * 抽到这里避免 inline readdirSync + filtering 逻辑。
 */

import { existsSync, readdirSync, statSync } from "fs";
import { resolve, basename } from "path";

/** 扫描目录下所有 .md(排除 archive 和 template) */
export function listMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "_template.md")
    .map((f) => resolve(dir, f))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
}


/** 从文件路径提取日期前缀(YYYY-MM-DD) */
export function dateFromPath(filePath: string): string {
  const name = basename(filePath);
  const m = name.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
