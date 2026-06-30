/**
 * parseArgs.ts — 跨调用方的统一命令行参数解析
 *
 * extension handler(omp 注入 `args: string`)和 api-runner(从 process.argv 切片)
 * 共用同一份解析逻辑，避免重复实现。
 *
 * 支持: --name value, --name=value, --flag, 位置参数
 */

export interface ParsedArgs {
  /** 位置参数(非 flag 开头的 token) */
  positional: string[];
  /** 命名参数(以 -- 开头的 flag) */
  options: Record<string, string | boolean | undefined>;
}

/**
 * 解析命令行参数数组
 * - `--name value` → options.name = "value"
 * - `--name=value` → options.name = "value"
 * - `--flag`(无值)→ options.name = true
 * - `value`(非 -- 前缀)→ positional.push(value)
 */
export function parseArgs(raw: string[]): ParsedArgs {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        // --name=value
        const name = arg.slice(2, eqIdx);
        options[name] = arg.slice(eqIdx + 1);
      } else {
        const name = arg.slice(2);
        // 下一个参数若是值(非 -- 前缀)则消费
        if (i + 1 < raw.length && !raw[i + 1].startsWith("--")) {
          i++;
          options[name] = raw[i];
        } else {
          options[name] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, options };
}

/** 取字符串选项值(默认 undefined) */
export function getStringOption(
  args: ParsedArgs,
  name: string,
  defaultValue?: string,
): string | undefined {
  const val = args.options[name];
  if (val === undefined || val === true) return defaultValue;
  return String(val);
}

/** 取布尔选项值 */
export function getBoolOption(args: ParsedArgs, name: string): boolean {
  return args.options[name] === true || args.options[name] === "true";
}

/** 取枚举选项值(带 default) */
export function getEnumOption<T extends string>(
  args: ParsedArgs,
  name: string,
  validValues: readonly T[],
  defaultValue: T,
): T {
  const val = getStringOption(args, name);
  if (val && (validValues as readonly string[]).includes(val)) {
    return val as T;
  }
  return defaultValue;
}
