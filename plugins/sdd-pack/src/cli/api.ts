/**
 * api.ts — sdd-api 程序化入口
 *
 * 8 个 export 函数供 slash command / hook / CI 三方共用。
 * 零新逻辑: 仅做 lib/orchestration/* + lib/* 调用 + 结果组装。
 *
 * 约束(PRD §3.3.5 F3.1):
 * - 每个函数 ≤ 80 行(不含类型与 import)
 * - 文件总行数 ≤ 300 行
 * - 不依赖 omp / ExtensionAPI
 * - 不调 process.exit / console.*(调用方自行处理 UI/exit)
 * - 文件 IO 走 node:fs,不依赖 bun
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";

import type {
  ValidateOptions,
  ValidateResult,
  ProposeOptions,
  ProposeResult,
  ArchiveOptions,
  ArchiveResult,
  MigrateOptions,
  MigrateResult,
  StatusResult,
  StatusItem,
  ListOptions,
  ListResult,
  ListItem,
  WhyResult,
  ApplyResult,
  ApplyChecklistItem,
} from "./lib/api-types";
import { validate, type ValidationConfig } from "./lib/validator";
import {
  parseDocument,
  parseStatusLine,
  parseStackedStatusLine,
  extractStatusLine,
  extractH1,
  isTemplateFile,
} from "./lib/doc-parser";
import { generateTemplate, type TemplateType } from "./lib/template-engine";
import { loreCommit, buildTrailer, isLoreAvailable } from "./lib/lore-wrapper";
import { requireFile, requireString, currentStatusOf } from "./lib/orchestration/gates";
import { listMdFiles, dateFromPath } from "./lib/orchestration/scan";
import { stagedFiles } from "./lib/orchestration/git";
import {
  buildArchiveStatusLine,
  applyStatusLine,
  moveToArchive,
  appendReplacedByRef,
  appendSupersedesRef,
  syncIndex,
  mergeDelta,
} from "./lib/orchestration/archive-ops";
import { findRepoRoot } from "./lib/path";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 把 ValidateOptions 转成 ValidationConfig(由 validateDocs 使用) */
function toValidationConfig(opts: ValidateOptions): ValidationConfig {
  let docsDir = resolve(findRepoRoot(), "docs");
  let files = opts.files;
  if (opts.path) {
    const p = resolve(findRepoRoot(), opts.path);
    if (!existsSync(p)) throw new Error(`路径不存在: ${opts.path}`);
    if (statSync(p).isDirectory()) docsDir = p;
    else {
      docsDir = resolve(findRepoRoot(), "docs");
      files = [p];
    }
  }
  if (opts.staged) {
    const staged = stagedFiles();
    if (staged.length > 0) files = staged;
  }
  return {
    docsDir,
    severity: opts.severity ?? "error",
    rulesOnly: opts.rulesOnly ?? false,
    structureOnly: opts.structureOnly ?? false,
    files,
  };
}
// ===== 1. validateDocs =====
export async function validateDocs(opts: ValidateOptions): Promise<ValidateResult> {
  try {
    return validate(toValidationConfig(opts));
  } catch (e) {
    return { status: "error", errors: [errMsg(e)], warnings: [], checks: [] };
  }
}
// ===== 2. proposePrd =====
export async function proposePrd(opts: ProposeOptions): Promise<ProposeResult> {
  const tryDo = (): { filePath: string; content: string } => {
    const title = requireString(opts.title, "--title");
    const today = todayStr();
    const prdDir = resolve(findRepoRoot(), "docs/prd");
    let supersedesTitle: string | undefined;
    if (opts.supersedes) {
      const oldPath = requireFile(resolve(findRepoRoot(), opts.supersedes));
      const status = currentStatusOf(oldPath);
      if (status !== "已发布")
        throw new Error(`--supersedes 目标必须为"已发布",实际: ${status ?? "(无法解析)"}`);
      supersedesTitle = parseDocument(oldPath)?.title;
    }
    const tplType: TemplateType = opts.supersedes
      ? opts.type === "full"
        ? "delta"
        : (opts.type ?? "delta")
      : (opts.type ?? "full");
    const { content, fileName } = generateTemplate({
      type: tplType,
      title,
      date: today,
      supersedes: opts.supersedes,
      supersedesTitle,
      specPath: opts.spec,
    });
    return { filePath: resolve(prdDir, fileName), content };
  };
  try {
    const { filePath, content } = tryDo();
    if (opts.dryRun) {
      return {
        status: "pass",
        path: filePath,
        content,
        errors: [],
        warnings: [],
        next: "dry-run,未写入",
      };
    }
    if (!existsSync(filePath)) mkdirSync(dirname(filePath), { recursive: true });
    if (existsSync(filePath)) {
      return { status: "error", errors: [`目标文件已存在: ${filePath}`], warnings: [] };
    }
    writeFileSync(filePath, content, "utf-8");
    const warnings: string[] = [];
    const vr = await validateDocs({ path: filePath, severity: "error" });
    if (vr.status === "error" || vr.status === "block") {
      warnings.push(`创建后 validate 报错(草稿允许): ${vr.errors.join("; ")}`);
    }
    return { status: "pass", path: filePath, errors: [], warnings, next: "下一步: /sdd-validate" };
  } catch (e) {
    return { status: "error", errors: [errMsg(e)], warnings: [] };
  }
}

// ===== 3. archivePrd =====
export async function archivePrd(opts: ArchiveOptions): Promise<ArchiveResult> {
  const reason = opts.reason ?? "completed";
  const r: ArchiveResult = {
    status: "pass",
    operations: [],
    statusLineUpdated: false,
    indexSynced: false,
    loreCommitted: false,
    errors: [],
    warnings: [],
  };
  try {
    const prdPath = requireFile(resolve(findRepoRoot(), opts.prdPath));
    if (reason === "replaced" && !opts.newPrdPath)
      throw new Error("--reason replaced 需要 --new-prd");
    if (opts.newPrdPath) requireFile(resolve(findRepoRoot(), opts.newPrdPath));
    const vr = await validateDocs({ path: prdPath, severity: "error" });
    if (vr.status === "error" || vr.status === "block") {
      r.status = "error";
      r.errors.push(`归档前 validate 不通过: ${vr.errors.join("; ")}`);
      return r;
    }
    if (opts.dryRun) {
      r.operations.push(`(dry-run) 状态行 → ${reason}`, `(dry-run) index.md sync`);
      return r;
    }
    let content = applyStatusLine(
      readFileSync(prdPath, "utf-8"),
      buildArchiveStatusLine(reason, todayStr()),
    );
    r.statusLineUpdated = content !== readFileSync(prdPath, "utf-8");
    if (reason === "replaced" && opts.newPrdPath) {
      content = appendReplacedByRef(content, opts.newPrdPath);
      appendSupersedesRef(opts.newPrdPath, prdPath);
    }
    writeFileSync(prdPath, content, "utf-8");
    if (reason === "completed") r.movedTo = moveToArchive(prdPath);
    const indexTarget = r.movedTo ?? prdPath;
    r.indexSynced = syncIndex(
      resolve(findRepoRoot(), "docs/index.md"),
      indexTarget,
      reason,
      prdPath.split("/").pop()?.replace(/\.md$/, "") ?? "",
    );
    if (opts.mergeDelta && reason === "replaced" && opts.newPrdPath) {
      const md = mergeDelta(prdPath, opts.newPrdPath);
      r.operations.push(md.merged ? `merge-delta 完成` : "merge-delta: 新 PRD 无 Δ 段");
    }
    if (!opts.noCommit) {
      if (isLoreAvailable()) {
        const trailer = buildTrailer("archive", `归档 PRD: ${prdPath} (${reason})`, "docs", [
          prdPath,
        ]);
        const lr = await loreCommit(`archive(${reason}): ${prdPath.split("/").pop()}`, trailer);
        r.loreCommitted = lr.success;
        if (!lr.success) r.warnings.push(`lore commit 失败: ${lr.stderr}`);
      } else r.warnings.push("lore 不可用,跳过 lore commit");
    }
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}

// ===== 4. migratePrd =====
export async function migratePrd(opts: MigrateOptions): Promise<MigrateResult> {
  const r: MigrateResult = { status: "pass", parsedEntries: 0, errors: [], warnings: [] };
  try {
    const prdPath = requireFile(resolve(findRepoRoot(), opts.prdPath));
    const content = readFileSync(prdPath, "utf-8");
    const statusLine = extractStatusLine(content);
    if (!statusLine) {
      r.warnings.push("未找到状态行");
      return r;
    }
    const entries = parseStackedStatusLine(statusLine);
    if (!entries) {
      r.warnings.push("SKIP: 无法解析堆叠状态行");
      return r;
    }
    r.parsedEntries = entries.length;
    const today = todayStr();
    const name = prdPath.split("/").pop()?.replace(/\.md$/, "") ?? "prd";
    const newStatusLine = `> 状态：${parseStatusLine(statusLine)?.status ?? "已发布"} | 发布日期：${today}`;
    const changelogPath = resolve(dirname(prdPath), `CHANGELOG-${name}.md`);
    const backupPath = resolve(dirname(prdPath), ".migration-backup", `${name}.${today}.bak`);
    if (opts.dryRun) {
      r.newStatusLine = newStatusLine;
      r.changelogPath = changelogPath;
      r.backupPath = backupPath;
      return r;
    }
    if (!opts.noBackup) {
      mkdirSync(dirname(backupPath), { recursive: true });
      writeFileSync(backupPath, content, "utf-8");
      r.backupPath = backupPath;
    }
    let cl = `# ${name} 变更历史\n\n| 版本 | 日期 | 变更内容 |\n|------|------|----------|\n`;
    for (const e of entries)
      cl += `| ${e.version} | ${e.date ?? "日期待确认"} | ${e.description} |\n`;
    writeFileSync(changelogPath, cl, "utf-8");
    r.changelogPath = changelogPath;
    writeFileSync(prdPath, content.replace(statusLine, newStatusLine), "utf-8");
    r.newStatusLine = newStatusLine;
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}
// ===== 5. getStatus =====
export async function getStatus(): Promise<StatusResult> {
  const items: StatusItem[] = [];
  for (const p of listMdFiles(resolve(findRepoRoot(), "docs/prd"))) {
    if (p.includes("/archive/")) continue;
    const doc = parseDocument(p);
    if (!doc) continue;
    const sl = doc.statusLine ? parseStatusLine(doc.statusLine) : null;
    items.push({
      path: p,
      fileName: p.split("/").pop() ?? p,
      type: "prd",
      status: sl?.status ?? "(unknown)",
      version: sl?.version,
      publishDate: sl?.publishDate,
      references: doc.references.backRefs,
    });
  }
  for (const p of listMdFiles(resolve(findRepoRoot(), "docs/phase"))) {
    const doc = parseDocument(p);
    if (!doc) continue;
    const sl = doc.statusLine ? parseStatusLine(doc.statusLine) : null;
    items.push({
      path: p,
      fileName: p.split("/").pop() ?? p,
      type: "phase",
      status: sl?.status ?? "(unknown)",
      references: doc.references.backRefs,
    });
  }
  return {
    items,
    prdCount: items.filter((i) => i.type === "prd").length,
    phaseCount: items.filter((i) => i.type === "phase").length,
  };
}
// ===== 6. listPrds =====
export async function listPrds(opts: ListOptions): Promise<ListResult> {
  const docsDir = resolve(findRepoRoot(), "docs");
  const items: ListItem[] = [];
  const scan = (dir: string, type: string) => {
    for (const p of listMdFiles(dir)) {
      if (isTemplateFile(p.split("/").pop() ?? "")) continue;
      const doc = parseDocument(p);
      const sl = doc?.statusLine ? parseStatusLine(doc.statusLine) : null;
      items.push({
        date: dateFromPath(p),
        fileName: p.split("/").pop() ?? p,
        type,
        status: sl?.status ?? "(unknown)",
        title: extractH1(readFileSync(p, "utf-8")) ?? "(无标题)",
        path: p,
      });
    }
  };
  if (!opts.type || opts.type === "prd") scan(resolve(docsDir, "prd"), "prd");
  if (!opts.type || opts.type === "phase") scan(resolve(docsDir, "phase"), "phase");
  let f = items;
  if (opts.status) f = f.filter((i) => i.status === opts.status);
  if (opts.date) f = f.filter((i) => i.date === opts.date);
  if (opts.keyword) {
    const kw = opts.keyword.toLowerCase();
    f = f.filter(
      (i) => i.title.toLowerCase().includes(kw) || i.fileName.toLowerCase().includes(kw),
    );
  }
  f.sort((a, b) => b.date.localeCompare(a.date));
  return { items: f, matched: f.length };
}
// ===== 7. getWhy =====
export async function getWhy(target: string): Promise<WhyResult> {
  if (!target) return { available: false, target: "", text: "", error: "未指定 target" };
  if (!isLoreAvailable()) {
    return { available: false, target, text: "", error: "lore CLI 不可用" };
  }
  const r = spawnSync("lore", ["why", target]);
  const text = r.stdout?.toString().trim() ?? "";
  if (r.status !== 0) return { available: true, target, text, error: r.stderr?.toString().trim() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { available: true, target, text, parsed };
}
// ===== 8. getApplyChecklist =====
export async function getApplyChecklist(prdPath: string): Promise<ApplyResult> {
  const fullPath = requireFile(resolve(findRepoRoot(), prdPath));
  const content = readFileSync(fullPath, "utf-8");
  const items: ApplyChecklistItem[] = [];
  let section = "unknown";
  let id = 0;
  for (const line of content.split("\n")) {
    const heading = line.match(/^(#+)\s+(.+)/);
    if (heading) {
      section = heading[2];
      continue;
    }
    const check = line.match(/^\s*-\s*\[\s\]\s+(.+)/);
    if (check) items.push({ id: ++id, description: check[1].trim(), section });
  }
  return { prdPath: fullPath, items, total: items.length };
}
