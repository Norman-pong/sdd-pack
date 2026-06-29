/**
 * arg-parser.ts — 命令行参数解析
 */

export interface ParsedArgs {
  /** 位置参数 */
  positional: string[];
  /** 命名参数 */
  options: Record<string, string | boolean | undefined>;
}

/**
 * 解析命令行参数数组
 * --name value, --name=value, --flag, --name value
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
        // 检查下一个参数是否为值（非 -- 前缀）
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

/**
 * 获取字符串选项值
 */
export function getStringOption(
  args: ParsedArgs,
  name: string,
  defaultValue?: string,
): string | undefined {
  const val = args.options[name];
  if (val === undefined || val === true) return defaultValue;
  return String(val);
}

/**
 * 获取布尔选项值
 */
export function getBoolOption(args: ParsedArgs, name: string): boolean {
  return args.options[name] === true || args.options[name] === "true";
}

/**
 * 获取枚举选项值
 */
export function getEnumOption<T extends string>(
  args: ParsedArgs,
  name: string,
  validValues: readonly T[],
  defaultValue: T,
): T {
  const val = getStringOption(args, name);
  if (val && validValues.includes(val as T)) {
    return val as T;
  }
  return defaultValue;
}
