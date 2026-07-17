/**
 * validator.ts — SDD 文档校验引擎
 *
 * 11 项检查，分级 severity: warn / error / block
 * 对应 docs-check.sh 超集 + 状态机校验 + 补充检查
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve, dirname, basename, relative } from "path";
import {
  parseStatusLine,
  parseStackedStatusLine,
  parseReferences,
  extractStatusLine,
  isTemplateFile,
  isValidFileName,
  extractRequiredSections,
  extractH1,
} from "./doc-parser";
import { PrdStatus, PhaseStatus, parseStatus } from "./prd-state-machine";
import { readPrdMeta, inferPrdIdFromPath } from "./meta-store";

/** 校验 severity */
export type CheckSeverity = "warn" | "error" | "block";

/** 单个检查结果 */
export interface CheckResult {
  ruleId: number;
  name: string;
  severity: CheckSeverity;
  passed: boolean;
  message?: string;
}

/** 校验结果 */
export interface ValidationResult {
  status: "pass" | "warn" | "error" | "block";
  errors: string[];
  warnings: string[];
  checks: CheckResult[];
}

/** 校验配置 */
export interface ValidationConfig {
  /** 根 docs 目录（默认 docs/） */
  docsDir: string;
  /** 生效的 severity 阈值 */
  severity: CheckSeverity;
  /** 仅状态机校验 */
  rulesOnly: boolean;
  /** 仅结构校验 */
  structureOnly: boolean;
  /** 要检查的文件列表（为空则全量扫描） */
  files?: string[];
}

/** 收集 docs/ 下的所有 PRD 和 Phase 文件 */
function collectDocsFiles(docsDir: string): { prds: string[]; phases: string[]; all: string[] } {
  const prds: string[] = [];
  const phases: string[] = [];
  const all: string[] = [];

  const scanDir = (dir: string) => {
    const fullPath = resolve(docsDir, dir);
    if (!existsSync(fullPath)) return;

    // 递归扫描: ADR-018 Phase 分组目录 docs/phase/<prd-id>/*.md 必须覆盖
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = resolve(d, entry.name);
        if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || entry.name === "archive") continue;
          walk(p);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          all.push(p);
        }
      }
    };
    walk(fullPath);
  };

  scanDir("prd");
  scanDir("phase");

  for (const f of all) {
    const name = basename(f);
    if (isTemplateFile(name)) continue;
    if (f.includes("/prd/")) prds.push(f);
    else if (f.includes("/phase/")) phases.push(f);
  }

  return { prds, phases, all };
}

/**
 * 获取 docs 目录下的所有 md 文件（递归扫描）
 */
function collectAllMdFiles(docsDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "archive") {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  walk(docsDir);
  return files;
}

// ===== 10 项检查实现 =====

interface CheckContext {
  docsDir: string;
  prds: string[];
  phases: string[];
  allMdFiles: string[];
  /** 要扫描链接的文件（config.files 提供时仅含 scoped 文件，否则 = allMdFiles） */
  targetFiles: string[];
}

/**
 * Check #1: PRD ↔ Phase 双向引用
 */
function checkBidirectionalReferences(ctx: CheckContext): CheckResult {
  const errors: string[] = [];
  const docsDir = ctx.docsDir;

  // PRD → Phase 引用
  for (const prd of ctx.prds) {
    const content = readFileSync(prd, "utf-8");
    const refs = parseReferences(content);
    const bn = relative(docsDir, prd);

    if (!refs.phaseRef) {
      errors.push(`PRD 缺少 '> 对应阶段:' 回指行: ${bn}`);
      continue;
    }

    const phasePath = resolve(dirname(prd), refs.phaseRef);
    if (!existsSync(phasePath)) {
      errors.push(`PRD 回指目标不存在: ${bn} -> ${refs.phaseRef}`);
    }
  }

  // Phase → PRD 引用
  for (const phase of ctx.phases) {
    const content = readFileSync(phase, "utf-8");
    const refs = parseReferences(content);
    const bn = relative(docsDir, phase);

    if (!refs.prdRef) {
      errors.push(`Phase 缺少 '> 对应 PRD:' 回指行: ${bn}`);
      continue;
    }

    const prdPath = resolve(dirname(phase), refs.prdRef);
    if (!existsSync(prdPath)) {
      errors.push(`Phase 回指目标不存在: ${bn} -> ${refs.prdRef}`);
    }
  }

  return {
    ruleId: 1,
    name: "PRD ↔ Phase 双向引用",
    severity: "error",
    passed: errors.length === 0,
    message: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

/**
 * Check #2: 回指格式规范
 */
function checkRefFormat(ctx: CheckContext): CheckResult {
  const errors: string[] = [];
  const docsDir = ctx.docsDir;

  const prdPattern = /^>\s*对应 PRD[：:]\s*\[/m;
  const phasePattern = /^>\s*对应阶段[：:]\s*\[/m;

  for (const file of [...ctx.prds, ...ctx.phases]) {
    const content = readFileSync(file, "utf-8");
    const bn = relative(docsDir, file);

    if (file.includes("/prd/")) {
      // PRD 文件应引用 Phase: > 对应阶段: [name](path)
      const match = content.match(phasePattern);
      if (match) continue;
      const alt = content.match(/^>\s*对应\s+(?:阶段|PRD)[：:]/m);
      if (alt) {
        errors.push(`PRD 回指格式不规范: ${bn} (应为 '> 对应阶段: [name](path)')`);
      }
    } else if (file.includes("/phase/")) {
      // Phase 文件应引用 PRD: > 对应 PRD: [name](path)
      const match = content.match(prdPattern);
      if (match) continue;
      const alt = content.match(/^>\s*对应\s+(?:阶段|PRD)[：:]/m);
      if (alt) {
        errors.push(`Phase 回指格式不规范: ${bn} (应为 '> 对应 PRD: [name](path)')`);
      }
    }
  }

  return {
    ruleId: 2,
    name: "回指格式规范",
    severity: "error",
    passed: errors.length === 0,
    message: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

/**
 * Check #3: index.md 覆盖度
 */
function checkIndexCoverage(ctx: CheckContext): CheckResult {
  const docsDir = ctx.docsDir;
  const indexPath = resolve(docsDir, "index.md");

  if (!existsSync(indexPath)) {
    return {
      ruleId: 3,
      name: "index.md 覆盖度",
      severity: "error",
      passed: false,
      message: "index.md 不存在",
    };
  }

  const indexContent = readFileSync(indexPath, "utf-8");
  const missing: string[] = [];

  for (const prd of ctx.prds) {
    const bn = basename(prd);
    if (!indexContent.includes(bn)) {
      missing.push(bn);
    }
  }

  return {
    ruleId: 3,
    name: "index.md 覆盖度",
    severity: "error",
    passed: missing.length === 0,
    message: missing.length > 0 ? `index.md 未覆盖: ${missing.join(", ")}` : undefined,
  };
}

/**
 * Check #4: 相对路径链接有效性（warn）
 */
function checkRelativeLinks(ctx: CheckContext): CheckResult {
  const broken: string[] = [];

  for (const file of ctx.targetFiles) {
    // 跳过 .working 目录
    if (file.includes("/.working/")) continue;

    const content = readFileSync(file, "utf-8");
    const dir = dirname(file);

    // 提取所有 ](link) 模式
    const linkMatches = content.matchAll(/\]\(([^)]+)\)/g);
    for (const match of linkMatches) {
      const link = match[1];
      if (
        !link ||
        link.startsWith("http") ||
        link.startsWith("#") ||
        link.startsWith("mailto:") ||
        link.startsWith("/")
      ) {
        continue;
      }

      const path = link.split("#")[0];
      if (!path) continue;

      const targetPath = resolve(dir, path);
      if (!existsSync(targetPath)) {
        broken.push(`${relative(ctx.docsDir, file)} -> ${link}`);
      }
    }
  }

  return {
    ruleId: 4,
    name: "相对路径链接有效性",
    severity: "warn",
    passed: broken.length === 0,
    message:
      broken.length > 0
        ? `断链: ${broken.slice(0, 10).join("; ")}${broken.length > 10 ? `...(+${broken.length - 10})` : ""}`
        : undefined,
  };
}

/**
 * Check #5: 状态机合规性（block）
 */
function checkStateMachine(ctx: CheckContext): CheckResult {
  const violations: string[] = [];
  const docsDir = ctx.docsDir;
  const warnings: string[] = [];

  for (const file of [...ctx.prds, ...ctx.phases]) {
    const content = readFileSync(file, "utf-8");
    const refs = parseReferences(content);
    const bn = relative(docsDir, file);
    const isPrd = file.includes("/prd/");

    // 优先从 meta.json 读取状态(ADR-018 事实源)
    let status: string | null = null;
    let metaSource = false;
    if (isPrd) {
      const metaId = inferPrdIdFromPath(bn);
      if (metaId) {
        const meta = readPrdMeta(metaId);
        if (meta) {
          status = meta.status;
          metaSource = true;
        }
      }
    }

    // meta.json 缺失时 fallback 到 markdown 状态行
    if (!metaSource) {
      const statusLine = extractStatusLine(content);
      if (statusLine) {
        const stacked = parseStackedStatusLine(statusLine);
        if (stacked) {
          // 堆叠行跳过状态检查，check #8 会报 error
        } else {
          const parsed = parseStatusLine(statusLine);
          if (parsed) {
            status = parsed.status;
            warnings.push(`${bn}: meta.json 缺失, fallback 到 markdown 状态行`);
          }
        }
      }
    }

    // 检查状态声明的合法性
    if (status) {
      const validPrdStatuses = [
        "草稿",
        "待评审",
        "已评审",
        "已规划任务",
        "进行中",
        "已归档",
      ];
      const validPhaseStatuses = Object.values(PhaseStatus);
      const validStatuses = isPrd ? validPrdStatuses : validPhaseStatuses;
      if (!validStatuses.includes(status)) {
        violations.push(
          `${bn}: 状态 '${status}' 不是合法 ${isPrd ? "PRD" : "Phase"} 状态（${validStatuses.join("/")}）`,
        );
      }
    }

    // 检查 supersedes 链: 如果 > 替代: 指向的文件状态应为 已归档（ADR-016）
    if (refs.supersedes) {
      const supersedePath = resolve(dirname(file), refs.supersedes);
      if (existsSync(supersedePath)) {
        const targetContent = readFileSync(supersedePath, "utf-8");
        const targetStatusLine = extractStatusLine(targetContent);
        if (targetStatusLine) {
          const targetParsed = parseStatusLine(targetStatusLine);
          if (targetParsed) {
            const targetStatus = parseStatus(targetParsed.status);
            if (
              targetStatus &&
              targetStatus !== PrdStatus.Archived
            ) {
              violations.push(
                `${bn}: supersedes 目标 ${basename(supersedePath)} 状态为 '${targetParsed.status}', 应已归档`,
              );
            }
          }
        }
      }
    }
  }

  return {
    ruleId: 5,
    name: "状态机合规性",
    severity: "block",
    passed: violations.length === 0,
    message: violations.length > 0 ? violations.join("; ") : undefined,
  };
}

/**
 * Check #6: supersedes 链完整性
 */
function checkSupersedesChain(ctx: CheckContext): CheckResult {
  const errors: string[] = [];
  const docsDir = ctx.docsDir;

  for (const file of [...ctx.prds, ...ctx.phases]) {
    const content = readFileSync(file, "utf-8");
    const refs = parseReferences(content);
    const bn = relative(docsDir, file);

    if (refs.supersedes) {
      // > 替代: 指向的文件必须存在
      const targetPath = resolve(dirname(file), refs.supersedes);
      if (!existsSync(targetPath)) {
        errors.push(`${bn}: > 替代: 目标文件不存在: ${refs.supersedes}`);
        continue;
      }

      // 目标文件应有反向引用
      const targetContent = readFileSync(targetPath, "utf-8");
      const targetRefs = parseReferences(targetContent);
      if (!targetRefs.supersededBy) {
        errors.push(`${bn}: supersedes 目标 ${basename(targetPath)} 缺少 '> 已被:' 反向引用`);
      }
    }

    if (refs.supersededBy) {
      // > 已被: 指向的文件必须存在
      const targetPath = resolve(dirname(file), refs.supersededBy);
      if (!existsSync(targetPath)) {
        errors.push(`${bn}: > 已被: 目标文件不存在: ${refs.supersededBy}`);
      }
    }
  }

  return {
    ruleId: 6,
    name: "supersedes 链完整性",
    severity: "error",
    passed: errors.length === 0,
    message: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

/**
 * Check #7: 命名规范（warn）
 */
function checkNamingConvention(ctx: CheckContext): CheckResult {
  const warnings: string[] = [];
  const docsDir = ctx.docsDir;

  for (const file of [...ctx.prds, ...ctx.phases]) {
    const name = basename(file);
    if (!isValidFileName(name)) {
      const h1 = extractH1(readFileSync(file, "utf-8"));
      warnings.push(
        `${relative(docsDir, file)}: 文件名 '${name}' 不符合 YYYY-MM-DD-<kebab-case>.md 规范${h1 ? ` (标题: ${h1})` : ""}`,
      );
    }
  }

  return {
    ruleId: 7,
    name: "命名规范",
    severity: "warn",
    passed: warnings.length === 0,
    message: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

/**
 * Check #8: 状态行格式（error）
 */
function checkStatusLineFormat(ctx: CheckContext): CheckResult {
  const errors: string[] = [];
  const docsDir = ctx.docsDir;

  for (const file of [...ctx.prds, ...ctx.phases]) {
    const content = readFileSync(file, "utf-8");
    const statusLine = extractStatusLine(content);
    if (!statusLine) continue;

    const bn = relative(docsDir, file);

    // 检测堆叠
    const stacked = parseStackedStatusLine(statusLine);
    if (stacked) {
      errors.push(`${bn}: 状态行堆叠 ${stacked.length} 个版本，应用 'sdd migrate' 清理`);
      continue;
    }

    // 检测规范格式
    const parsed = parseStatusLine(statusLine);
    if (!parsed) {
      errors.push(`${bn}: 状态行格式不规范: '${statusLine.replace(/^>\s*/, "").trim()}'`);
      continue;
    }
  }

  return {
    ruleId: 8,
    name: "状态行格式",
    severity: "error",
    passed: errors.length === 0,
    message: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

/**
 * Check #9: 归档文件位置（warn）
 */
function checkArchiveFileLocation(ctx: CheckContext): CheckResult {
  const warnings: string[] = [];

  // 遍历 ctx.prds（受 config.files scoping 控制）而非 readdirSync 全量扫描
  // 这样 validate({files:[specificPrd]}) 时只检查指定 PRD
  for (const prdPath of ctx.prds) {
    const prdAbs = resolve(ctx.docsDir, prdPath);
    if (!existsSync(prdAbs)) continue;
    const name = basename(prdAbs);
    if (isTemplateFile(name)) continue;

    const content = readFileSync(prdAbs, "utf-8");
    const statusLine = extractStatusLine(content);
    if (!statusLine) continue;

    const parsed = parseStatusLine(statusLine);
    const isInArchive = prdAbs.includes("/archive/");
    const relPath = relative(ctx.docsDir, prdAbs);

    if (!parsed) {
      if (isInArchive) {
        const stacked = parseStackedStatusLine(statusLine);
        if (!stacked) {
          warnings.push(`${relPath}: 无法解析状态行`);
        }
      }
      continue;
    }

    if (isInArchive && parsed.status !== "已归档") {
      warnings.push(`${relPath}: 归档目录下文件状态应为 '已归档'，当前为 '${parsed.status}'`);
    }
    if (!isInArchive && parsed.status === "已归档") {
      warnings.push(`${relPath}: 状态为 '已归档' 但仍在 prd/ 目录下，应移至 archive/`);
    }
  }

  return {
    ruleId: 9,
    name: "归档文件位置",
    severity: "warn",
    passed: warnings.length === 0,
    message: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

/**
 * Check #10: 必需章节完整性（error, PRD 专用）
 */
function checkRequiredSections(ctx: CheckContext): CheckResult {
  const errors: string[] = [];
  const docsDir = ctx.docsDir;

  for (const prd of ctx.prds) {
    const content = readFileSync(prd, "utf-8");
    const missing = extractRequiredSections(content);
    const bn = relative(docsDir, prd);

    if (missing.length > 0) {
      errors.push(`${bn}: 缺少必需章节: ${missing.join(", ")}`);
    }
  }

  return {
    ruleId: 10,
    name: "必需章节完整性",
    severity: "error",
    passed: errors.length === 0,
    message: errors.length > 0 ? errors.join("; ") : undefined,
  };
}
/**
 * Check #11: 全局 PRD 单例（block）
 * 非归档 PRD 在 docs/prd/ 下只能存在 1 份
 */
function checkGlobalSingleton(ctx: CheckContext): CheckResult {
  const activePrds: string[] = [];
  const docsDir = ctx.docsDir;
  const prdDocsDir = resolve(docsDir, "prd");

  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "archive" || entry.name.startsWith(".")) continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md") && !isTemplateFile(entry.name)) {
        const content = readFileSync(fullPath, "utf-8");
        const statusLine = extractStatusLine(content);
        if (!statusLine) continue;
        const parsed = parseStatusLine(statusLine);
        if (!parsed) continue;
        const status = parseStatus(parsed.status);
        if (status && status !== PrdStatus.Archived) {
          activePrds.push(relative(docsDir, fullPath));
        }
      }
    }
  }

  walk(prdDocsDir);

  return {
    ruleId: 11,
    name: "全局 PRD 单例",
    severity: "block",
    passed: activePrds.length <= 1,
    message:
      activePrds.length > 1
        ? `存在 ${activePrds.length} 份非归档 PRD, 仅允许 1 份活跃: ${activePrds.join(", ")}`
        : undefined,
  };
}
/**
 * Check #12: 命令清单漂移校验（ADR-019 §3.2.4 扩面）
 * 比对 sdd-router.ts SUBCOMMANDS + api-runner.ts switch case 两份命令清单一致。
 * 数据源：src/cli/lib/orchestration/commands.generated.json（由 scripts/gen-commands-json.ts 生成）
 * 规则：
 *   - subcommands ⊆ apiRunnerCases（sdd-router 有的 api-runner 必须有）
 *   - apiRunnerCases - subcommands ⊆ allowedExtraInRunner（api-runner 多出的只能是预定义的）
 */
function checkCommandListDrift(_ctx: CheckContext): CheckResult {
  const generatedPath = resolve(import.meta.dir, "orchestration/commands.generated.json");
  if (!existsSync(generatedPath)) {
    return {
      ruleId: 12,
      name: "命令清单漂移",
      severity: "warn",
      passed: true,
      message: "commands.generated.json 不存在，跳过（先跑 bun run scripts/gen-commands-json.ts）",
    };
  }
  const data = JSON.parse(readFileSync(generatedPath, "utf-8")) as {
    subcommands: string[];
    apiRunnerCases: string[];
    allowedExtraInRunner: string[];
  };
  const subSet = new Set(data.subcommands);
  const runnerSet = new Set(data.apiRunnerCases);
  const allowed = new Set(data.allowedExtraInRunner);

  const missingInRunner = data.subcommands.filter((s) => !runnerSet.has(s));
  const extraInRunner = data.apiRunnerCases.filter((s) => !subSet.has(s) && !allowed.has(s));

  const problems: string[] = [];
  if (missingInRunner.length > 0) {
    problems.push(`api-runner 缺失: ${missingInRunner.join(", ")}`);
  }
  if (extraInRunner.length > 0) {
    problems.push(`api-runner 多出(未在 allowedExtraInRunner): ${extraInRunner.join(", ")}`);
  }

  return {
    ruleId: 12,
    name: "命令清单漂移",
    severity: "warn",
    passed: problems.length === 0,
    message: problems.length > 0 ? problems.join("; ") : undefined,
  };
}
// ===== 校验引擎 =====

/**
 * 运行全量校验
 */
export function validate(config: ValidationConfig): ValidationResult {
  const docsDir = resolve(config.docsDir);

  if (!existsSync(docsDir)) {
    return {
      status: "error",
      errors: [`docs 目录不存在: ${docsDir}`],
      warnings: [],
      checks: [],
    };
  }

  let prds: string[];
  let phases: string[];
  let allMdFiles: string[];
  let targetFiles: string[];

  if (config.files && config.files.length > 0) {
    // resolve relative paths against docsDir, 避免 allMdFiles 混用相对/绝对路径导致 ENOENT
    const resolved = config.files.map((f) => resolve(docsDir, f));
    prds = resolved.filter((f) => f.includes("/prd/"));
    phases = resolved.filter((f) => f.includes("/phase/"));
    allMdFiles = [...resolved];

    // 还需要所有 md 文件做链接检查
    for (const f of collectAllMdFiles(docsDir)) {
      if (!allMdFiles.includes(f)) allMdFiles.push(f);
    }
    // scoped: 只扫描指定文件的链接，不扫全量
    targetFiles = [...resolved];
  } else {
    const collected = collectDocsFiles(docsDir);
    prds = collected.prds;
    phases = collected.phases;
    allMdFiles = collectAllMdFiles(docsDir);
    targetFiles = [...allMdFiles];
  }

  const ctx: CheckContext = { docsDir, prds, phases, allMdFiles, targetFiles };

  const allChecks: CheckResult[] = [];

  if (!config.structureOnly) {
    allChecks.push(checkStateMachine(ctx));
  }

  if (!config.rulesOnly) {
    allChecks.push(checkBidirectionalReferences(ctx));
    allChecks.push(checkRefFormat(ctx));
    allChecks.push(checkIndexCoverage(ctx));
    allChecks.push(checkRelativeLinks(ctx));
    allChecks.push(checkSupersedesChain(ctx));
    allChecks.push(checkNamingConvention(ctx));
    allChecks.push(checkStatusLineFormat(ctx));
    allChecks.push(checkArchiveFileLocation(ctx));
    allChecks.push(checkRequiredSections(ctx));
    // 全局单例只在全量扫描时运行(不传 files 时),单文件验证时跳过
    if (!config.files || config.files.length === 0) {
      allChecks.push(checkGlobalSingleton(ctx));
    }
  }
    // Check #12 在全量扫描时运行（不传 files 或非 rulesOnly），命令清单漂移与文档内容无关
    if (!config.rulesOnly) allChecks.push(checkCommandListDrift(ctx));

  // 按 severity 阈值汇总
  const severityOrder: CheckSeverity[] = ["warn", "error", "block"];
  const thresholdIdx = severityOrder.indexOf(config.severity);

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const check of allChecks) {
    if (check.passed) continue;

    const checkIdx = severityOrder.indexOf(check.severity);
    if (checkIdx >= thresholdIdx) {
      // --severity warn 时，所有违规降级为警告
      const isWarning = config.severity === "warn" || check.severity === "warn";
      const target = isWarning ? warnings : errors;
      target.push(
        `[${check.severity.toUpperCase()}] #${check.ruleId} ${check.name}: ${check.message}`,
      );
    }
  }

  // 决定最终状态
  let status: ValidationResult["status"] = "pass";
  if (errors.some((e) => e.startsWith("[BLOCK]"))) status = "block";
  else if (errors.some((e) => e.startsWith("[ERROR]"))) status = "error";
  else if (warnings.length > 0) status = "warn";

  return { status, errors, warnings, checks: allChecks };
}

