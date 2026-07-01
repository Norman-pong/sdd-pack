/**
 * openspec-api.ts — openspec-api 程序化入口
 *
 * 7 个 export 函数供 slash command / hook / CI 三方共用(OpenSpec 范式)。
 * OpenSpec 目录布局:
 *   openspec/specs/<area>/spec.md         ← 当前规范
 *   openspec/changes/<change-id>/         ← 活动变更(proposal/tasks/design/specs)
 *   openspec/changes/archive/<change-id>/ ← 归档变更
 *   openspec/AGENTS.md                    ← AI 助手指令(由 getInstructions 暴露)
 *
 * 7 个 export 函数(对应 7 个 /openspec-* slash command):
 *   1. getInitState()                                 — OpenSpec 是否就绪
 *   2. getStatus()                                    — 总览(活动数 / 归档数 / specs 数)
 *   3. validateProject({changeId?, severity?})        — 校验 spec 格式
 *   4. listChanges({status?})                         — 列出活动或归档变更
 *   5. showItem(changeId)                             — 显示单个变更详情
 *   6. getInstructions()                              — 读 openspec/AGENTS.md 内容
 *   7. archiveChange({changeId, noCommit?})           — 归档变更
 *
 * 约束(ADR-011):≤ 320 行,不依赖 omp,共享 src/cli/lib/ 底层库。
 */

import { existsSync, readFileSync, readdirSync, statSync, renameSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { extractH1 } from "./lib/doc-parser";
import { loreCommit, buildTrailer, isLoreAvailable } from "./lib/lore-wrapper";
import { requireFile } from "./lib/orchestration/gates";
import { dateFromPath } from "./lib/orchestration/scan";

// ===== 类型定义 =====
export type ChangeStatus = "active" | "archived";
export interface InitState {
  initialized: boolean;
  openspecDir: boolean;
  specsDir: boolean;
  changesDir: boolean;
  agentsMd: boolean;
  projectMd: boolean;
  missing: string[];
}
export interface StatusCounts {
  activeChanges: number;
  archivedChanges: number;
  specAreas: number;
}
export interface ValidateOptions {
  changeId?: string;
  severity?: "warn" | "error";
}
export interface CheckEntry {
  rule: string;
  passed: boolean;
  message: string;
}
export interface ValidateResult {
  status: "pass" | "warn" | "error";
  changesChecked: number;
  errors: string[];
  warnings: string[];
  checks: CheckEntry[];
}
export interface ListOptions {
  status?: ChangeStatus;
}
export interface ChangeItem {
  changeId: string;
  status: ChangeStatus;
  date: string;
  title: string;
  hasProposal: boolean;
  hasTasks: boolean;
  hasDesign: boolean;
  specDeltas: number;
  path: string;
}
export interface ListResult {
  items: ChangeItem[];
  matched: number;
}
export interface ShowSection {
  name: string;
  content: string;
}
export interface ShowResult {
  changeId: string;
  path: string;
  proposal: string | null;
  tasks: string | null;
  design: string | null;
  specDeltas: ShowSection[];
  exists: boolean;
}
export interface InstructionsResult {
  available: boolean;
  path: string;
  content: string;
  error?: string;
}
export interface ArchiveOptions {
  changeId: string;
  noCommit?: boolean;
}
export interface ArchiveResult {
  status: "pass" | "warn" | "error";
  changeId: string;
  movedTo?: string;
  operations: string[];
  loreCommitted: boolean;
  errors: string[];
  warnings: string[];
}

// ===== 路径 helpers =====
const SPECS_ROOT = () => resolve("openspec", "specs");
const CHANGES_ROOT = () => resolve("openspec", "changes");
const ARCHIVE_ROOT = () => resolve("openspec", "changes", "archive");

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function readIfExists(p: string): string | null {
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}
function changeDir(changeId: string): string {
  return resolve(CHANGES_ROOT(), changeId);
}
function listDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const e of readdirSync(root)) {
    try {
      if (statSync(resolve(root, e)).isDirectory()) out.push(e);
    } catch {
      /* skip */
    }
  }
  return out;
}

// ===== 1. getInitState =====
export async function getInitState(): Promise<InitState> {
  const root = resolve("openspec");
  const openspecDir = existsSync(root);
  const specsDir = existsSync(SPECS_ROOT());
  const changesDir = existsSync(CHANGES_ROOT());
  const agentsMd = existsSync(resolve(root, "AGENTS.md"));
  const projectMd = existsSync(resolve(root, "project.md"));
  const missing: string[] = [];
  if (!openspecDir) missing.push("openspec/");
  if (!specsDir) missing.push("openspec/specs/");
  if (!changesDir) missing.push("openspec/changes/");
  if (!agentsMd) missing.push("openspec/AGENTS.md");
  return {
    initialized: openspecDir && specsDir && changesDir && agentsMd,
    openspecDir,
    specsDir,
    changesDir,
    agentsMd,
    projectMd,
    missing,
  };
}

// ===== 2. getStatus =====
export async function getStatus(): Promise<StatusCounts> {
  const changes = listDirs(CHANGES_ROOT()).filter((n) => n !== "archive");
  const archived = listDirs(ARCHIVE_ROOT());
  const specsDir = SPECS_ROOT();
  const specAreas = existsSync(specsDir)
    ? readdirSync(specsDir).filter((e) => {
        try {
          return statSync(resolve(specsDir, e)).isDirectory();
        } catch {
          return false;
        }
      }).length
    : 0;
  return { activeChanges: changes.length, archivedChanges: archived.length, specAreas };
}

// ===== 3. validateProject =====
async function validateSpecFile(specPath: string): Promise<CheckEntry[]> {
  const checks: CheckEntry[] = [];
  const content = readIfExists(specPath);
  if (content === null) {
    checks.push({ rule: "exists", passed: false, message: `缺失: ${specPath}` });
    return checks;
  }
  const reqs = content.match(/^###\s+Requirement:\s+.+$/gm) ?? [];
  const scn = content.match(/^####\s+Scenario:\s+/gm) ?? [];
  const shall = content.match(/\b(SHALL|MUST)\b/g) ?? [];
  checks.push({
    rule: "requirement-heading",
    passed: reqs.length > 0,
    message: reqs.length === 0 ? "无 ### Requirement: 标题" : `${reqs.length} 个需求`,
  });
  checks.push({
    rule: "scenario-block",
    passed: scn.length >= reqs.length,
    message: `${scn.length} 个 Scenario(需求 ${reqs.length})`,
  });
  checks.push({
    rule: "shall-must-keyword",
    passed: shall.length > 0,
    message: shall.length === 0 ? "未用 SHALL/MUST 关键字" : `${shall.length} 处 SHALL/MUST`,
  });
  return checks;
}

export async function validateProject(opts: ValidateOptions): Promise<ValidateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: CheckEntry[] = [];
  const targets = opts.changeId
    ? [opts.changeId]
    : listDirs(CHANGES_ROOT()).filter((n) => n !== "archive");
  if (targets.length === 0) {
    return {
      status: "warn",
      changesChecked: 0,
      errors: [],
      warnings: ["未指定 change-id 且无活动变更"],
      checks: [],
    };
  }
  for (const changeId of targets) {
    const specDir = resolve(changeDir(changeId), "specs");
    if (!existsSync(specDir)) {
      warnings.push(`[${changeId}] 无 specs/ 子目录`);
      continue;
    }
    for (const area of readdirSync(specDir)) {
      const areaPath = resolve(specDir, area);
      try {
        if (!statSync(areaPath).isDirectory()) continue;
      } catch {
        continue;
      }
      for (const f of readdirSync(areaPath)) {
        if (!f.endsWith(".md")) continue;
        const cs = await validateSpecFile(resolve(areaPath, f));
        for (const c of cs)
          checks.push({ ...c, message: `[${changeId}/${area}/${f}] ${c.message}` });
      }
    }
  }
  const failed = checks.filter((c) => !c.passed);
  const dest = (opts.severity ?? "error") === "error" ? errors : warnings;
  for (const c of failed) dest.push(c.message);
  const status: ValidateResult["status"] =
    errors.length > 0 ? "error" : warnings.length > 0 ? "warn" : "pass";
  return { status, changesChecked: targets.length, errors, warnings, checks };
}

// ===== 4. listChanges =====
function buildChangeItem(changeId: string, status: ChangeStatus): ChangeItem {
  const dir = status === "archived" ? resolve(ARCHIVE_ROOT(), changeId) : changeDir(changeId);
  const specsPath = resolve(dir, "specs");
  let specDeltas = 0;
  if (existsSync(specsPath)) {
    for (const area of readdirSync(specsPath)) {
      try {
        if (statSync(resolve(specsPath, area)).isDirectory())
          specDeltas += readdirSync(resolve(specsPath, area)).filter((f) =>
            f.endsWith(".md"),
          ).length;
      } catch {
        /* skip */
      }
    }
  }
  const proposal = readIfExists(resolve(dir, "proposal.md"));
  return {
    changeId,
    status,
    date: dateFromPath(changeId),
    title: proposal ? (extractH1(proposal) ?? changeId) : changeId,
    hasProposal: proposal !== null,
    hasTasks: readIfExists(resolve(dir, "tasks.md")) !== null,
    hasDesign: readIfExists(resolve(dir, "design.md")) !== null,
    specDeltas,
    path: dir,
  };
}

export async function listChanges(opts: ListOptions): Promise<ListResult> {
  const status: ChangeStatus = opts.status ?? "active";
  const rootDir = status === "archived" ? ARCHIVE_ROOT() : CHANGES_ROOT();
  if (!existsSync(rootDir)) return { items: [], matched: 0 };
  const items: ChangeItem[] = [];
  for (const entry of readdirSync(rootDir)) {
    if (entry === "archive") continue;
    try {
      if (statSync(resolve(rootDir, entry)).isDirectory())
        items.push(buildChangeItem(entry, status));
    } catch {
      /* skip */
    }
  }
  return { items, matched: items.length };
}

// ===== 5. showItem =====
function readChangeSection(dir: string) {
  const specsPath = resolve(dir, "specs");
  const specDeltas: ShowSection[] = [];
  if (existsSync(specsPath)) {
    for (const area of readdirSync(specsPath)) {
      try {
        if (!statSync(resolve(specsPath, area)).isDirectory()) continue;
      } catch {
        continue;
      }
      for (const f of readdirSync(resolve(specsPath, area))) {
        if (!f.endsWith(".md")) continue;
        const c = readIfExists(resolve(specsPath, area, f));
        if (c !== null) specDeltas.push({ name: `${area}/${f}`, content: c });
      }
    }
  }
  return {
    proposal: readIfExists(resolve(dir, "proposal.md")),
    tasks: readIfExists(resolve(dir, "tasks.md")),
    design: readIfExists(resolve(dir, "design.md")),
    specDeltas,
  };
}

export async function showItem(changeId: string): Promise<ShowResult> {
  const activeDir = changeDir(changeId);
  if (!existsSync(activeDir)) {
    const archivedDir = resolve(ARCHIVE_ROOT(), changeId);
    if (existsSync(archivedDir))
      return { changeId, path: archivedDir, ...readChangeSection(archivedDir), exists: true };
    return {
      changeId,
      path: activeDir,
      proposal: null,
      tasks: null,
      design: null,
      specDeltas: [],
      exists: false,
    };
  }
  return { changeId, path: activeDir, ...readChangeSection(activeDir), exists: true };
}

// ===== 6. getInstructions =====
export async function getInstructions(): Promise<InstructionsResult> {
  const path = resolve("openspec", "AGENTS.md");
  if (!existsSync(path)) return { available: false, path, content: "", error: `未找到: ${path}` };
  return { available: true, path, content: readFileSync(path, "utf-8") };
}

// ===== 7. archiveChange =====
export async function archiveChange(opts: ArchiveOptions): Promise<ArchiveResult> {
  const r: ArchiveResult = {
    status: "pass",
    changeId: opts.changeId,
    operations: [],
    loreCommitted: false,
    errors: [],
    warnings: [],
  };
  try {
    const src = requireFile(changeDir(opts.changeId));
    const dst = resolve(ARCHIVE_ROOT(), opts.changeId);
    if (existsSync(dst)) throw new Error(`归档目标已存在: ${dst}`);
    mkdirSync(dirname(dst), { recursive: true });
    renameSync(src, dst);
    r.movedTo = dst;
    r.operations.push(`move ${src} → ${dst}`);
    if (opts.noCommit) return r;
    if (!isLoreAvailable()) {
      r.warnings.push("lore 不可用,跳过 lore commit");
      return r;
    }
    const trailer = buildTrailer("archive", `归档 OpenSpec 变更: ${opts.changeId}`, "openspec", [
      dst,
    ]);
    const lr = await loreCommit(`archive: ${opts.changeId}`, trailer);
    r.loreCommitted = lr.success;
    if (!lr.success) r.warnings.push(`lore commit 失败: ${lr.stderr}`);
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}
