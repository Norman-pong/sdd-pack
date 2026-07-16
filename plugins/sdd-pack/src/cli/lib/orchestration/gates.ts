/**
 * gates.ts — 跨调用方的前置/后置校验
 *
 * api.ts 各函数的"前置检查"集中到此处,避免函数体内 inline
 * existsSync / parseStatus 之类的判断。
 */

import { existsSync } from "fs";
import { resolve } from "path";

import { PrdStatus, parseStatus } from "../prd-state-machine";
import { parseDocument, parseStatusLine } from "../doc-parser";

/** 文件必须存在;不存在抛错 */
export function requireFile(filePath: string): string {
  const full = resolve(filePath);
  if (!existsSync(full)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return full;
}

/** 读取 PRD 当前状态(供 archive 前置校验) */
export function currentStatusOf(prdPath: string): PrdStatus | null {
  const doc = parseDocument(prdPath);
  if (!doc) return null;
  const line = doc.statusLine;
  if (!line) return null;
  const parsed = parseStatusLine(line);
  if (!parsed) return null;
  return parseStatus(parsed.status);
}

/** 目标路径不冲突检测(供 propose 前置) */
export function assertNoConflict(filePath: string): void {
  if (existsSync(filePath)) {
    throw new Error(`目标文件已存在: ${filePath}`);
  }
}

/** 必需的字符串参数;为空抛错 */
export function requireString(value: string | undefined, name: string): string {
  if (!value || value.length === 0) {
    throw new Error(`缺少必需参数: ${name}`);
  }
  return value;
}


/** --supersedes 指向的旧 PRD 必须是 已归档 状态（ADR-016：已完成/已中止 已合并入 已归档 子态） */
export function assertSupersedesArchived(prdPath: string): void {
  if (status !== PrdStatus.Archived) {
    throw new Error(`--supersedes 目标必须为"已归档"状态,实际: ${status ?? "(无法解析)"}`);
  }
}
