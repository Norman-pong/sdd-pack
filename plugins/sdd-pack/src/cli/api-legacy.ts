/**
 * api-legacy.ts — sdd-api 旧版功能(validate/propose/archive/migrate/status/list/why/apply/archivePhase)
 *
 * 从 api.ts 抽离,解决 api.ts ≤300 行硬约束。
 * 9 个 export 函数供 slash command / hook / CI 三方共用。
 * 零新逻辑: 仅做 lib/orchestration/* + lib/* 调用 + 结果组装。
 * 文件 IO 走 node:fs,不依赖 bun,不调 process.exit / console.*。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
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
  PhaseArchiveOptions,
  PhaseArchiveResult,
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
import { PrdStatus, PhaseStatus } from "./lib/prd-state-machine";
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
  archivePhaseDestPath,
  moveToArchiveWithDest,
} from "./lib/orchestration/archive-ops";
import { findRepoRoot } from "./lib/path";
import { readPhaseMeta, writePhaseMeta, readMetaIndex, type PhaseMeta } from "./lib/meta-store";
import { isPhaseTransitionAllowed } from "./lib/prd-state-machine";
import { rewriteMovedDocLinks } from "./lib/orchestration/doc-links";
import { updateIndexEntry } from "./lib/index-sync";

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
      if (status !== PrdStatus.Archived)
        throw new Error(`--supersedes 目标必须为"已归档",实际: ${status ?? "(无法解析)"}`);
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
    return { status: "pass", path: filePath, errors: [], warnings, next: "下一步: /sdd validate" };
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
    const newStatusLine = `> 状态：${parseStatusLine(statusLine)?.status ?? "进行中"} | 发布日期：${today}`;
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

// ===== 9. archivePhase（ADR-017） =====

/** Phase 归档状态行（ADR-017: 已完成/已废弃 + 归档日期） */
function buildPhaseArchiveStatusLine(status: PhaseStatus, today: string): string {
  return `> 状态：${status} | 归档日期：${today}`;
}

export async function archivePhase(opts: PhaseArchiveOptions): Promise<PhaseArchiveResult> {
  const r: PhaseArchiveResult = {
    status: "pass",
    operations: [],
    statusLineUpdated: false,
    indexSynced: false,
    loreCommitted: false,
    errors: [],
    warnings: [],
  };
  try {
    const repoRoot = findRepoRoot();
    const phasePathAbs = requireFile(resolve(repoRoot, opts.phasePath));
    const reason = opts.reason;

    // Step 1: 通过 filePath 反查 phase meta（meta id 是 phs-NNN-NNN 格式，与文件名不同）
    const phaseBn = phasePathAbs.split("/").pop() ?? "";
    const phaseRel = phasePathAbs.replace(repoRoot, "").replace(/^\//, "");
    const metaIndex = readMetaIndex();
    let meta: PhaseMeta | null = null;
    for (const pid of metaIndex.phaseIds) {
      const m = readPhaseMeta(pid);
      if (m && (m.filePath === phaseRel || m.filePath === opts.phasePath)) {
        meta = m;
        break;
      }
    }
    if (meta) {
      // ADR-017: Completed/Abandoned 是终态，归档是物理操作不是状态迁移
      // 校验：phase 必须已达终态（Completed/Abandoned）才能归档
      // reason 只决定归档标签（已完成|归档日期 vs 已废弃|归档日期），不触发状态迁移
      const isTerminal =
        meta.status === PhaseStatus.Completed || meta.status === PhaseStatus.Abandoned;
      if (!isTerminal) {
        r.status = "error";
        r.errors.push(
          `phase ${meta.id} 当前状态 "${meta.status}" 非终态，归档前必须先执行 /sdd phase ${reason === "completed" ? "complete" : "abandon"}`,
        );
        return r;
      }
      // 如果当前状态与 reason 不一致，用 reason 作为归档标签（语义上 reason=abandoned 标记废弃归档）
      // 但不改变 meta.status——ADR-017 终态无出边
    } else {
      // meta 缺失：ADR-018 meta.json 是事实源，无 meta 的 phase 不应归档（会导致文件移动但 meta 不同步）
      r.status = "error";
      r.errors.push(`未找到 phase meta: ${phaseRel}，无法安全归档（meta.json 是事实源，缺失 meta 意味着 phase 未经 sdd 流程创建）`);
      return r;
    }
    if (opts.dryRun) {
      r.operations.push(
        `(dry-run) 状态行 → ${reason}`,
        `(dry-run) 物理移动 → archive/`,
        `(dry-run) meta.filePath 更新`,
        `(dry-run) PRD 回指链接重写`,
        `(dry-run) index.md phase 表更新`,
      );
      return r;
    }

    // Step 2: 改状态行（用 meta.status，而非 reason——ADR-017 终态为准）
    const content = readFileSync(phasePathAbs, "utf-8");
    const lineStatus = meta?.status ?? (reason === "completed" ? PhaseStatus.Completed : PhaseStatus.Abandoned);
    const newLine = buildPhaseArchiveStatusLine(lineStatus, todayStr());
    const updated = applyStatusLine(content, newLine);
    r.statusLineUpdated = updated !== content;
    writeFileSync(phasePathAbs, updated, "utf-8");
    r.operations.push(`状态行更新 → ${lineStatus} | 归档日期：${todayStr()}`);

    // Step 3: 物理移动到 archive/
    const newPathAbs = moveToArchiveWithDest(phasePathAbs, archivePhaseDestPath(phasePathAbs));
    r.operations.push(`物理移动 → ${newPathAbs.replace(repoRoot, "")}`);

    // Step 4: 更新 phase meta.filePath 指向新路径
    if (meta) {
      const newRel = newPathAbs.replace(repoRoot, "").replace(/^\//, "");
      writePhaseMeta({ ...meta, filePath: newRel });
      r.operations.push(`meta.filePath 更新 → ${newRel}`);
    }

    // Step 5: 重写 PRD 对应阶段链接（phase 文件移动后，内部相对链接也要修）
    const oldDir = dirname(phasePathAbs);
    const newDir = dirname(newPathAbs);
    rewriteMovedDocLinks(newPathAbs, oldDir, newDir);
    // 修 PRD 的 "> 对应阶段:" 链接（basename 不变，相对路径变了）
    const activePrd = readFileSync(resolve(repoRoot, ".sdd/meta/index.json"), "utf-8");
    let prdId: string | null = null;
    try {
      const idx = JSON.parse(activePrd) as { activePrdId?: string | null };
      prdId = idx.activePrdId ?? null;
    } catch {
      // ignore parse error
    }
    if (prdId) {
      const prdMetaPath = resolve(repoRoot, ".sdd/meta/prd", `${prdId}.json`);
      if (existsSync(prdMetaPath)) {
        const prdMetaRaw = readFileSync(prdMetaPath, "utf-8");
        const prdMeta = JSON.parse(prdMetaRaw) as { filePath?: string };
        if (prdMeta.filePath) {
          const prdAbs = resolve(repoRoot, prdMeta.filePath);
          if (existsSync(prdAbs)) {
            let prdContent = readFileSync(prdAbs, "utf-8");
            const oldLinkRegex = new RegExp(
              `\\]\\([^)]*${phaseBn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
              "g",
            );
            // 用 relative 计算 prd -> 新 phase 的相对路径
            const relLink = relative(dirname(prdAbs), newPathAbs);
            if (oldLinkRegex.test(prdContent)) {
              prdContent = prdContent.replace(oldLinkRegex, `](${relLink})`);
              writeFileSync(prdAbs, prdContent, "utf-8");
              r.operations.push(`PRD 对应阶段链接重写 → ${relLink}`);
            }
          }
        }
      }
    }

    // Step 6: 更新 index.md phase 表格（复用通用 updateIndexEntry，按 basename 匹配）
    const indexPath = resolve(repoRoot, "docs/index.md");
    const statusLabel = reason === "completed" ? "已完成" : "已废弃";
    r.indexSynced = updateIndexEntry(indexPath, phaseBn, statusLabel, newPathAbs);
    if (r.indexSynced) r.operations.push(`index.md phase 表更新 → ${statusLabel}`);

    // Step 7: lore commit（保留）
    if (!opts.noCommit) {
      if (isLoreAvailable()) {
        const trailer = buildTrailer("archive", `归档 Phase: ${opts.phasePath} (${reason})`, "docs", [
          opts.phasePath,
        ]);
        const lr = await loreCommit(
          `archive-phase(${reason}): ${phaseBn}`,
          trailer,
        );
        r.loreCommitted = lr.success;
      } else r.warnings.push("lore 不可用,跳过 lore commit");
    }
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
  }
  return r;
}
