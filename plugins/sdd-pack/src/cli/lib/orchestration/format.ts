/**
 * format.ts — 跨调用方的结果格式化
 *
 * api.ts 8 个函数返回结构化对象,extension handler 走 ctx.ui.notify/setWidget,
 * api-runner 走 stdout + JSON。两者共用底层 formatter,但入口分流。
 */

import type { ValidationResult } from "../validator";

/** ValidationResult → 人读字符串(CLI 终端 / omp notify 共用) */
export function formatHuman(result: ValidationResult): string {
  const lines: string[] = [];
  lines.push(`sdd validate 结果: ${result.status.toUpperCase()}`);
  lines.push("");

  for (const check of result.checks) {
    const icon = check.passed ? "✓" : "✗";
    const tag = check.passed ? "" : ` [${check.severity.toUpperCase()}]`;
    lines.push(`  ${icon} #${check.ruleId} ${check.name}${tag}`);
    if (!check.passed && check.message) {
      lines.push(`    ${check.message}`);
    }
  }

  lines.push("");
  if (result.errors.length > 0) {
    lines.push(`错误(${result.errors.length}):`);
    for (const err of result.errors) lines.push(`  ${err}`);
  }
  if (result.warnings.length > 0) {
    lines.push(`警告(${result.warnings.length}):`);
    for (const w of result.warnings) lines.push(`  ${w}`);
  }

  lines.push(`\n总计: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  return lines.join("\n");
}

/** 将 ValidationResult 压成简短摘要(用于 omp notify) */
export function formatSummary(result: ValidationResult): string {
  return `status=${result.status} errors=${result.errors.length} warnings=${result.warnings.length}`;
}

/** ValidationResult → omp 终端用 ANSI 彩色行(extension handler 可选) */
export function formatAnsi(result: ValidationResult, color: boolean): string {
  if (!color) return formatHuman(result);
  // 简化:仅给 status 行加色
  const c = (s: string, code: string) => `\x1b[${code}m${s}\x1b[0m`;
  const status = (() => {
    switch (result.status) {
      case "pass":
        return c("PASS", "32");
      case "warn":
        return c("WARN", "33");
      case "error":
        return c("ERROR", "31");
      case "block":
        return c("BLOCK", "1;31");
    }
  })();
  return formatHuman(result).replace(result.status.toUpperCase(), status);
}
