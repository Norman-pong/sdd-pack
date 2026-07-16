/**
 * ui-helpers.ts — extension 共享 UI 类型与工具函数
 *
 * 从 index.ts 提取,供 sdd-router.ts / gate-handlers.ts 复用。
 */

// ===== 类型兜底(unknown,跟 hooks/sdd/index.ts 同构) =====

export interface CommandUI {
  notify(text: string, level?: "info" | "warn" | "error" | "warning"): void;
  setWidget(key: string, content: string[]): void;
}

export interface CommandContext {
  ui: CommandUI;
}

// ===== type guard: ctx 是否含 ui =====

function hasUI(ctx: unknown): ctx is { ui: CommandUI } {
  if (ctx === null || typeof ctx !== "object") return false;
  if (!("ui" in ctx)) return false;
  const ui: unknown = ctx["ui"];
  if (ui === null || typeof ui !== "object") return false;
  return "notify" in ui && "setWidget" in ui;
}

// ===== helper: 类型守卫(取 ui) =====

export function uiOf(ctx: unknown): CommandContext {
  return hasUI(ctx) ? ctx : { ui: { notify: () => {}, setWidget: () => {} } };
}

// ===== arg split(omp 注入 `args: string` 而非 argv) =====

/**
 * 分词命令行参数,支持单/双引号与反斜杠转义
 * 示例: `--title "My PRD"` → ["--title", "My PRD"]
 *       `--title 'My PRD'` → ["--title", "My PRD"]
 *       `--title My\ PRD` → ["--title", "My PRD"]
 */
export function splitArgs(s: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  let escaped = false;

  for (const char of s.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inQuote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) result.push(current);
  return result;
}
