/**
 * meta-store.ts — PRD/Phase 状态唯一事实源(ADR-018)
 *
 * meta.json 不进 git(本地缓存,`.sdd/meta/` 在 .gitignore),markdown 状态行由
 * generateStatusLine(meta) 单向生成。clone 后 `/sdd sync` 从 markdown 重建 meta。
 *
 * 9 个核心函数 + 3 个类型(PrdMeta / PhaseMeta / MetaIndex),每个函数 ≤ 80 行。
 * 文件 IO 走 node:fs,无 process.exit / console.*(供 api.ts / extension / 测试共用)。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { extractTitle, parseStatusLine, extractStatusLine, parseReferences } from "./doc-parser";
import { findRepoRoot } from "./path";
import {
  PrdStatus,
  PhaseStatus,
  ArchiveReason,
  parseStatus,
  parsePhaseStatus,
} from "./prd-state-machine";

// ===== 类型定义(PRD §2.2.3 / §2.2.5)=====

/** 单次状态流转记录(from / to 都可能是 PrdStatus 或 PhaseStatus) */
export interface TransitionRecord {
  from: PrdStatus | PhaseStatus | null;
  to: PrdStatus | PhaseStatus;
  at: string;
  by: string;
}

/** PRD meta(状态唯一事实源) */
export interface PrdMeta {
  id: string;
  title: string;
  status: PrdStatus;
  archiveReason?: ArchiveReason;
  transitions: TransitionRecord[];
  phaseIds: string[];
  nextPhaseSeq: number;
  createdAt: string;
  updatedAt: string;
  filePath: string;
  version: string;
}

/** Phase meta */
export interface PhaseMeta {
  id: string;
  parentId: string;
  title: string;
  status: PhaseStatus;
  seq: number;
  transitions: TransitionRecord[];
  createdAt: string;
  updatedAt: string;
  filePath: string;
}

/** 全局索引(.sdd/meta/index.json) */
export interface MetaIndex {
  activePrdId: string | null;
  prdIds: string[];
  phaseIds: string[];
  updatedAt: string;
}

// ===== 内部 helper =====

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function metaDir(): string {
  return resolve(findRepoRoot(), ".sdd", "meta");
}

function prdDir(): string {
  return resolve(metaDir(), "prd");
}

function phaseDir(): string {
  return resolve(metaDir(), "phase");
}

function indexPath(): string {
  return resolve(metaDir(), "index.json");
}

// ===== 1. readPrdMeta =====

export function readPrdMeta(id: string): PrdMeta | null {
  return readJson<PrdMeta>(resolve(prdDir(), `${id}.json`));
}

// ===== 2. readPhaseMeta =====

export function readPhaseMeta(id: string): PhaseMeta | null {
  return readJson<PhaseMeta>(resolve(phaseDir(), `${id}.json`));
}

// ===== 3. writePrdMeta =====

/**
 * 写入 PRD meta。归档 PRD 不影响其他 PRD 的 activePrdId;
 * 仅当 index.activePrdId === meta.id 时才清空,避免覆盖其他活跃索引。
 */
export function writePrdMeta(meta: PrdMeta): void {
  const path = resolve(prdDir(), `${meta.id}.json`);
  writeJson(path, { ...meta, updatedAt: nowIso() });
  const idx = readMetaIndex();
  if (!idx.prdIds.includes(meta.id)) idx.prdIds.push(meta.id);
  if (meta.status === PrdStatus.Archived && idx.activePrdId === meta.id) {
    idx.activePrdId = null;
  } else if (meta.status !== PrdStatus.Archived) {
    idx.activePrdId = meta.id;
  }
  writeMetaIndex(idx);
}

// ===== 4. writePhaseMeta =====

export function writePhaseMeta(meta: PhaseMeta): void {
  const path = resolve(phaseDir(), `${meta.id}.json`);
  writeJson(path, { ...meta, updatedAt: nowIso() });
  const idx = readMetaIndex();
  if (!idx.phaseIds.includes(meta.id)) idx.phaseIds.push(meta.id);
  writeMetaIndex(idx);
}

// ===== 5. readMetaIndex =====

export function readMetaIndex(): MetaIndex {
  const existing = readJson<MetaIndex>(indexPath());
  if (existing) return existing;
  return { activePrdId: null, prdIds: [], phaseIds: [], updatedAt: nowIso() };
}

// ===== 6. writeMetaIndex =====

export function writeMetaIndex(index: MetaIndex): void {
  writeJson(indexPath(), { ...index, updatedAt: nowIso() });
}

// ===== 7. getActivePrdMeta =====

export function getActivePrdMeta(): PrdMeta | null {
  const idx = readMetaIndex();
  return idx.activePrdId ? readPrdMeta(idx.activePrdId) : null;
}

// ===== 8. generatePrdId =====

/** 生成 prd-YYYYMMDD-NNN(当天内自增 NNN) */
export function generatePrdId(): string {
  const today = todayStamp();
  const idx = readMetaIndex();
  let max = 0;
  for (const id of idx.prdIds) {
    const m = id.match(/^prd-(\d{8})-(\d{3})$/);
    if (m && m[1] === today) {
      const n = parseInt(m[2], 10);
      if (n > max) max = n;
    }
  }
  return `prd-${today}-${String(max + 1).padStart(3, "0")}`;
}

// ===== 9. generatePhaseId =====

/**
 * 生成 phs-<prdSeq>-NNN(嵌入 PRD seq 防全局碰撞)。
 *
 * @param prdSeq PRD id 中提取的 3 位序号(如 prd-20260716-001 → 001)
 *               也可直接传入 PRD id 字符串,内部自动提取
 */
export function generatePhaseId(prdSeqOrId: number | string): string {
  let prdSeq: string;
  if (typeof prdSeqOrId === "number") {
    prdSeq = String(prdSeqOrId).padStart(3, "0");
  } else {
    const m = prdSeqOrId.match(/^prd-\d{8}-(\d{3})$/);
    if (!m) throw new Error(`invalid PRD id for generatePhaseId: ${prdSeqOrId}`);
    prdSeq = m[1];
  }
  const idx = readMetaIndex();
  let max = 0;
  for (const id of idx.phaseIds) {
    const m = id.match(/^phs-\d{3}-(\d{3})$/);
    if (m && id.startsWith(`phs-${prdSeq}-`)) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `phs-${prdSeq}-${String(max + 1).padStart(3, "0")}`;
}

// ===== 10. rebuildMetaFromMarkdown =====

/**
 * 从 docs/prd/ + docs/phase/ 下的 markdown 状态行重建 meta.json
 * 全局单例重建规则:
 * - 0 份非归档 PRD → activePrdId = null
 * - 1 份非归档 PRD → activePrdId = 该 PRD id
 * - >1 份非归档 PRD → throw
 */
export function rebuildMetaFromMarkdown(): void {
  const root = findRepoRoot();
  const prdDocsDir = resolve(root, "docs/prd");
  const phaseDocsDir = resolve(root, "docs/phase");

  const activePrdIds: string[] = [];
  const allPrdIds: string[] = [];
  const allPhaseIds: string[] = [];
  // 用 prdId -> Phase ID 数组映射,扫描完 Phase 后回填到对应 PRD
  const phaseByPrd = new Map<string, string[]>();

  if (existsSync(prdDocsDir)) {
    for (const file of readdirSync(prdDocsDir).filter(
      (f) => f.endsWith(".md") && statSync(resolve(prdDocsDir, f)).isFile(),
    )) {
      const filePath = resolve(prdDocsDir, file);
      const content = readFileSync(filePath, "utf-8");
      const statusLine = extractStatusLine(content);
      if (!statusLine) continue;
      const parsed = parseStatusLine(statusLine);
      if (!parsed) continue;
      const id = inferPrdIdFromPath(file);
      if (!id) continue;
      const status = parseStatus(parsed.status);
      if (!status) continue;
      writePrdMeta({
        id,
        title: extractTitle(content),
        status,
        archiveReason: inferArchiveReason(statusLine, status),
        transitions: [],
        phaseIds: [],
        nextPhaseSeq: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        filePath: relative(root, filePath),
        version: parsed.version ?? "1.0.0",
      });
      allPrdIds.push(id);
      if (status !== PrdStatus.Archived) activePrdIds.push(id);
    }
  }

  if (activePrdIds.length > 1) {
    throw new Error(
      `rebuildMetaFromMarkdown: >1 non-archived PRD found in docs/prd/: ${activePrdIds.join(", ")}. ` +
        `Resolve by archiving all but one before running /sdd sync.`,
    );
  }

  if (existsSync(phaseDocsDir)) {
    scanPhaseDir(phaseDocsDir, root, allPhaseIds, phaseByPrd);
  }

  // 回填 PRD phaseIds + nextPhaseSeq
  for (const [prdId, phaseIds] of phaseByPrd) {
    const meta = readPrdMeta(prdId);
    if (!meta) continue;
    const maxSeq = phaseIds.reduce((acc, pid) => {
      const m = pid.match(/^phs-\d{3}-(\d{3})$/);
      return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
    }, 0);
    writePrdMeta({ ...meta, phaseIds, nextPhaseSeq: maxSeq });
  }

  writeMetaIndex({
    activePrdId: activePrdIds[0] ?? null,
    prdIds: allPrdIds,
    phaseIds: allPhaseIds,
    updatedAt: nowIso(),
  });
}

function scanPhaseDir(
  dir: string,
  root: string,
  acc: string[],
  phaseByPrd: Map<string, string[]>,
): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      scanPhaseDir(full, root, acc, phaseByPrd);
      continue;
    }
    if (!entry.endsWith(".md")) continue;
    const content = readFileSync(full, "utf-8");
    // ADR-018 §6:Phase 按 PRD ID 分组目录,parentId 由目录名权威提供
    const parentId = inferPrdIdFromGroupDir(full);
    if (!parentId) continue;
    // 回链 URL 只做一致性校验(缺失不 block,只是不参与回填)
    const refs = parseReferences(content);
    const id = inferPhaseIdFromPath(full, parentId);
    if (!id) continue;
    const statusLine = extractStatusLine(content);
    if (!statusLine) continue;
    const parsed = parseStatusLine(statusLine);
    if (!parsed) continue;
    const phaseStatus = parsePhaseStatus(parsed.status);
    if (!phaseStatus) continue;
    writePhaseMeta({
      id,
      parentId,
      title: extractTitle(content),
      status: phaseStatus,
      seq: parseInt(id.split("-").pop() ?? "0", 10),
      transitions: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      filePath: relative(root, full),
    });
    acc.push(id);
    const list = phaseByPrd.get(parentId) ?? [];
    list.push(id);
    phaseByPrd.set(parentId, list);
    void refs; // 未来可用于一致性校验
  }
}

/** Phase 按 PRD ID 分组目录(ADR-018 §6):docs/phase/<prd-id>/<seq>-<name>.md */
function inferPrdIdFromGroupDir(phaseFilePath: string): string | null {
  const parts = phaseFilePath.split("/");
  // 期望末三段: docs / phase / <prd-id> / <file>.md
  if (parts.length < 4) return null;
  const groupDir = parts[parts.length - 2];
  return /^prd-\d{8}-\d{3}$/.test(groupDir) ? groupDir : null;
}

function inferPrdIdFromPath(filePath: string): string | null {
  const base = filePath.split("/").pop() ?? "";
  const m = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  return m ? `prd-${m[1].replace(/-/g, "")}-001` : null;
}

function inferPhaseIdFromPath(filePath: string, parentRef: string): string | null {
  const m = parentRef.match(/prd-\d{8}-(\d{3})/);
  if (!m) return null;
  const base = filePath.split("/").pop() ?? "";
  const seqMatch = base.match(/^(\d{3})-/);
  return seqMatch ? `phs-${m[1]}-${seqMatch[1]}` : null;
}

function inferArchiveReason(statusLine: string, status: PrdStatus): ArchiveReason | undefined {
  if (status !== PrdStatus.Archived) return undefined;
  if (statusLine.includes("归档原因：已完成") || statusLine.includes("归档原因:已完成")) {
    return ArchiveReason.Completed;
  }
  if (statusLine.includes("归档原因：已中止") || statusLine.includes("归档原因:已中止")) {
    return ArchiveReason.Abandoned;
  }
  return undefined;
}

// ===== 11. helper: appendTransition =====

/** 给 meta 追加一次 transition 记录(纯函数,不写盘) */
export function appendTransition(
  meta: PrdMeta | PhaseMeta,
  to: PrdStatus | PhaseStatus,
  by: string,
): TransitionRecord[] {
  const record: TransitionRecord = {
    from: meta.status,
    to,
    at: nowIso(),
    by,
  };
  return [...meta.transitions, record];
}

// ===== 12. helper: phase file path =====

/** 生成 Phase markdown 路径: docs/phase/<prd-id>/<seq>-<name>.md */
export function phaseFilePath(prdId: string, seq: number, name: string): string {
  const padded = String(seq).padStart(3, "0");
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return join("docs", "phase", prdId, `${padded}-${safe}.md`);
}

// ===== 13. helper: list metas =====

/** 列出所有 PRD meta */
export function listAllPrdMetas(): PrdMeta[] {
  return readMetaIndex()
    .prdIds.map((id) => readPrdMeta(id))
    .filter((m): m is PrdMeta => m !== null);
}

/** 列出指定 PRD 的所有 Phase meta */
export function listPhaseMetas(parentPrdId: string): PhaseMeta[] {
  return readMetaIndex()
    .phaseIds.map((id) => readPhaseMeta(id))
    .filter((m): m is PhaseMeta => m !== null && m.parentId === parentPrdId);
}
