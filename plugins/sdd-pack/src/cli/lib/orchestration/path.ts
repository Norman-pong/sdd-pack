/**
 * path.ts — 跨调用方的路径解析
 *
 * api.ts 内部多处需要:
 * - 解析 git staged files(commit 拦截)
 * - 计算 archive dir / dest path(archive 操作)
 * - 默认 docs 目录推导
 *
 * 抽到这里避免 api.ts 内 inline path 操作。
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname, basename } from "path";

/** 默认 docs 目录(相对 cwd) */
export function defaultDocsDir(): string {
  return resolve("docs");
}

/** 默认 archive 目录 */
export function defaultArchiveDir(): string {
  return resolve("docs/prd/archive");
}

/** resolve 绝对路径;若文件不存在抛错 */
export function mustResolve(filePath: string): string {
  const full = resolve(filePath);
  if (!existsSync(full)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return full;
}

/** 计算归档目标路径(reason=completed 时) */
export function archiveDestPath(prdPath: string): string {
  const dir = dirname(prdPath);
  return resolve(dir, "archive", basename(prdPath));
}

/** 文件所在目录 */
export function dirOf(filePath: string): string {
  return dirname(filePath);
}

/** 文件 basename(去 .md) */
export function nameOf(filePath: string): string {
  return basename(filePath, ".md");
}

/** 读文件;存在则返回内容,否则 undefined */
export function tryReadFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

/** 工具:将绝对路径转成 docs/ 相对(用于 index.md 链接) */
export function toDocsRelative(absolutePath: string, docsDir: string): string {
  return absolutePath.startsWith(docsDir)
    ? absolutePath.slice(docsDir.length + 1)
    : absolutePath;
}
