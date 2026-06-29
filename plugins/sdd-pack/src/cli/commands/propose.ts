/**
 * propose.ts — sdd propose 命令
 * 创建新 PRD 文件或 delta 变更
 */

import { existsSync, writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { ParsedArgs, getStringOption, getBoolOption, getEnumOption } from "../lib/arg-parser";
import { generateTemplate, type TemplateType } from "../lib/template-engine";
import { parseDocument, parseStatusLine, extractStatusLine } from "../lib/doc-parser";
import { validate, type ValidationConfig } from "../lib/validator";

function printUsage(): void {
  console.error(`用法: sdd propose [选项]

创建新 PRD 文件或 delta 变更。

选项:
  --spec <path>         从 spec 文件提纯，创建 full PRD
  --supersedes <path>   标记替代旧 PRD（旧 PRD 必须状态为 已发布）
  --title <name>        PRD 名称（未提供则交互式询问或报错）
  --type <full|delta>   模板类型：full（完整 11 节）或 delta（仅 Δ 段）
  --dry-run             仅打印模板内容不写入
  --help                显示帮助`);
}

function getToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function proposeCommand(args: ParsedArgs): Promise<void> {
  if (args.options["help"] || args.options["h"]) {
    printUsage();
    process.exit(0);
  }

  const specPath = getStringOption(args, "spec");
  const supersedesPath = getStringOption(args, "supersedes");
  const title = getStringOption(args, "title");
  const typeOpt = getEnumOption<TemplateType>(args, "type", ["full", "delta"], "full");
  const dryRun = getBoolOption(args, "dry-run");

  if (!title) {
    console.error("错误: --title 是必需的");
    process.exit(1);
  }

  const today = getToday();
  const prdDir = resolve("docs/prd");
  const fileName = `${today}-${title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "")}.md`;
  const filePath = resolve(prdDir, fileName);

  // 前置校验：路径冲突
  if (!dryRun && existsSync(filePath)) {
    console.error(`错误: 文件已存在: ${fileName}（退出码 2）`);
    process.exit(2);
  }

  // 前置校验：--supersedes 指向的文件必须存在且状态为 已发布
  let supersedesTitle: string | undefined;
  const detectedType = typeOpt;

  if (supersedesPath) {
    if (!existsSync(resolve(supersedesPath))) {
      console.error(`错误: --supersedes 指向的文件不存在: ${supersedesPath}（退出码 1）`);
      process.exit(1);
    }

    const doc = parseDocument(resolve(supersedesPath));
    if (!doc || !doc.parsedStatus) {
      console.error(`错误: 无法解析 ${supersedesPath} 的状态行（退出码 1）`);
      process.exit(1);
    }

    if (doc.parsedStatus.status !== "已发布") {
      console.error(
        `错误: --supersedes 目标状态为 '${doc.parsedStatus.status}'，需要为 '已发布'（退出码 1）`
      );
      process.exit(1);
    }

    // 提取旧 PRD 标题
    const content = readFileSync(resolve(supersedesPath), "utf-8");
    const titleMatch = content.match(/^#\s+(.+)/m);
    supersedesTitle = titleMatch ? titleMatch[1].trim() : fileName;
  }

  // 确定模板类型：--supersedes 时默认 delta
  const templateType = supersedesPath ? (typeOpt === "full" ? "delta" : typeOpt) : typeOpt;

  // 生成模板
  const { content: templateContent, fileName: generatedFileName } = generateTemplate({
    type: templateType,
    title,
    date: today,
    supersedes: supersedesPath ? resolve(supersedesPath) : undefined,
    supersedesTitle,
  });

  if (dryRun) {
    console.log(`--- dry-run: 将创建 ${fileName} ---`);
    console.log(templateContent);
    console.log(`--- end dry-run ---`);
    process.exit(0);
  }

  // 写入文件
  if (!existsSync(prdDir)) {
    // prd 目录不存在时自动创建
    const { mkdirSync } = await import("fs");
    mkdirSync(prdDir, { recursive: true });
  }

  writeFileSync(filePath, templateContent, "utf-8");
  console.log(`已创建: ${filePath}`);

  // 创建后自动 validate
  const validationResult = validate({
    docsDir: resolve("docs"),
    severity: "error",
    rulesOnly: false,
    structureOnly: false,
    files: [filePath],
  });

  if (validationResult.status !== "pass") {
    console.warn("\n⚠ 新 PRD 校验有违规项（草稿阶段可接受）:");
    for (const err of validationResult.errors) {
      console.warn(`  ${err}`);
    }
    for (const warn of validationResult.warnings) {
      console.warn(`  ${warn}`);
    }
  }

  process.exit(0);
}
