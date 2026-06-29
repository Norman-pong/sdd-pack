/**
 * validate.ts — sdd validate 命令
 */

import { existsSync, statSync } from "fs";
import { resolve, relative } from "path";
import { ParsedArgs, getStringOption, getBoolOption, getEnumOption } from "../lib/arg-parser";
import { validate, type ValidationConfig, type CheckSeverity, type ValidationResult } from "../lib/validator";

function printUsage(): void {
  console.error(`用法: sdd validate [path] [选项]

校验文档结构和状态机合规。

参数:
  [path]              校验范围（文件/目录路径，省略则全量 docs/）

选项:
  --staged            仅校验 git staged 变更涉及的 docs 文件
  --severity <level>  校验严格度: warn | error | block (默认 error)
  --json              JSON 输出
  --rules-only        仅状态机校验
  --structure-only    仅文档结构校验
  --help              显示帮助`);
}

function printHuman(result: ValidationResult): void {
  for (const check of result.checks) {
    const icon = check.passed ? "✓" : "✗";
    const severityTag = check.passed ? "" : ` [${check.severity.toUpperCase()}]`;
    console.log(`  ${icon} #${check.ruleId} ${check.name}${severityTag}`);
    if (!check.passed && check.message) {
      console.log(`    ${check.message}`);
    }
  }

  console.log("");
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`  ${err}`);
    }
  }
  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      console.warn(`  ${warn}`);
    }
  }

  console.log(`\n结果: ${result.status.toUpperCase()} (${result.errors.length} error(s), ${result.warnings.length} warning(s))`);
}

export async function validateCommand(args: ParsedArgs): Promise<void> {
  // --help
  if (args.options["help"] || args.options["h"]) {
    printUsage();
    process.exit(0);
  }

  // 互斥检测: --staged 和 [path]
  const isStaged = getBoolOption(args, "staged");
  const pathArg = args.positional[0];
  if (isStaged && pathArg) {
    console.error("错误: --staged 和 [path] 参数互斥");
    process.exit(1);
  }

  const severity = getEnumOption<CheckSeverity>(args, "severity", ["warn", "error", "block"], "error");
  const jsonOutput = getBoolOption(args, "json");
  const rulesOnly = getBoolOption(args, "rules-only");
  const structureOnly = getBoolOption(args, "structure-only");

  // 确定 docs 目录和校验文件
  let docsDir: string;
  let files: string[] | undefined;

  if (pathArg) {
    const resolvedPath = resolve(pathArg);
    if (!existsSync(resolvedPath)) {
      console.error(`错误: 路径不存在: ${pathArg}`);
      process.exit(1);
    }

    if (statSync(resolvedPath).isDirectory()) {
      docsDir = resolvedPath;
    } else {
      // 单个文件
      docsDir = resolve("docs");
      files = [resolvedPath];
    }
  } else {
    docsDir = resolve("docs");
  }

  // --staged 模式：获取 git staged docs 文件
  if (isStaged) {
    if (!existsSync(resolve(".git"))) {
      console.error("错误: 不是 git 仓库");
      process.exit(1);
    }

    const { spawnSync } = await import("bun");
    const result = spawnSync(["git", "diff", "--cached", "--name-only"]);
    const stdout = result.stdout.toString().trim();

    if (!stdout) {
      const emptyResult: ValidationResult = {
        status: "pass",
        errors: [],
        warnings: [],
        checks: [],
      };
      if (jsonOutput) {
        console.log(JSON.stringify(emptyResult, null, 2));
      } else {
        console.log("  无 staged docs 变更");
      }
      process.exit(0);
    }

    const stagedFiles = stdout.split("\n")
      .filter((f: string) => f.startsWith("docs/") && f.endsWith(".md"))
      .map((f: string) => resolve(f));

    if (stagedFiles.length === 0) {
      const emptyResult: ValidationResult = {
        status: "pass",
        errors: [],
        warnings: [],
        checks: [],
      };
      if (jsonOutput) {
        console.log(JSON.stringify(emptyResult, null, 2));
      } else {
        console.log("  无 staged docs 变更");
      }
      process.exit(0);
    }

    docsDir = resolve("docs");
    files = stagedFiles;
  }

  const config: ValidationConfig = {
    docsDir,
    severity,
    rulesOnly,
    structureOnly,
    files,
  };

  const result = validate(config);

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  // 退出码
  if (result.status === "block") process.exit(2);
  if (result.status === "error") process.exit(1);
  process.exit(0);
}
