/**
 * api-flow.ts — PRD 前半段流转命令(ADR-018 F2/F3/F4/F8)
 *
 * 从 api.ts 抽离,解决 api.ts ≤300 行硬约束。
 * 4 个 export 函数: initPrd / reviewPrd / approvePrd / backPrd。
 * 每个函数 ≤ 80 行(不含类型与 import)。
 * 文件 IO 走 node:fs,不依赖 bun,不调 process.exit / console.*。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, relative } from "node:path";

import type {
  InitOptions,
  InitResult,
  ReviewResult,
  ApproveOptions,
  ApproveResult,
  BackOptions,
  BackResult,
} from "./lib/api-types";
import { applyStatusLine } from "./lib/orchestration/archive-ops";
import { findRepoRoot } from "./lib/path";
import {
  writePrdMeta,
  getActivePrdMeta,
  generatePrdId,
  appendTransition,
  type PrdMeta,
} from "./lib/meta-store";
import { generatePrdStatusLine } from "./lib/doc-parser";
import { isTransitionAllowed, PrdStatus } from "./lib/prd-state-machine";
import { requireString } from "./lib/orchestration/gates";
import { generateTemplate } from "./lib/template-engine";
import { addPrdEntry, updateIndexEntry, indexContains } from "./lib/index-sync";
import { validate, type ValidationConfig } from "./lib/validator";

/**
 * Flow 专用 validate: Draft→PendingReview 时跳过 Check #1(PRD↔Phase 双向引用),
 * 因为 Draft PRD 尚未规划 Phase(模板生成 `> 对应阶段：TBD`)。
 * 仍保留必需章节/命名/状态机/格式等全部其他检查。
 */
async function validateForReview(filePath: string): Promise<ReturnType<typeof validate>> {
  const config: ValidationConfig = {
    docsDir: resolve(findRepoRoot(), "docs"),
    severity: "error",
    rulesOnly: false,
    structureOnly: false,
    files: [filePath],
  };
  const result = validate(config);
  const filteredErrors = result.errors.filter(
    (e) => !e.includes("#1 PRD ↔ Phase 双向引用"),
  );
  const filteredChecks = result.checks.map((c) =>
    c.ruleId === 1 ? { ...c, passed: true, message: undefined } : c,
  );
  let status: typeof result.status = "pass";
  if (filteredErrors.some((e) => e.startsWith("[BLOCK]"))) status = "block";
  else if (filteredErrors.some((e) => e.startsWith("[ERROR]"))) status = "error";
  else if (result.warnings.length > 0) status = "warn";
  return { status, errors: filteredErrors, warnings: result.warnings, checks: filteredChecks };
}

/** 全局单例校验: 有活跃 PRD 时 block;--force 仅允许覆盖空草稿 */
function assertInitAllowed(
  force: boolean,
  title: string,
): { activePrd: PrdMeta | null } {
  const activePrd = getActivePrdMeta();
  if (!activePrd) return { activePrd: null };
  if (!force) {
    throw new Error(
      `已有活跃 PRD: ${activePrd.id} (${activePrd.title})。请求创建的 PRD: "${title}"。` +
        `请先归档当前 PRD (/sdd archive --reason <completed|abandoned>) 或使用 --force 覆盖空草稿。`,
    );
  }
  const isEmptyDraft =
    activePrd.status === PrdStatus.Draft && activePrd.transitions.length === 0;
  if (!isEmptyDraft) {
    throw new Error(
      `--force 仅允许覆盖空草稿 PRD (Draft + transitions 为空)。` +
        `当前 PRD ${activePrd.id} 状态=${activePrd.status}, transitions=${activePrd.transitions.length} 条,不可覆盖。`,
    );
  }
  return { activePrd };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function initPrd(opts: InitOptions): Promise<InitResult> {
  const r: InitResult = { status: "pass", errors: [], warnings: [] };
  try {
    const title = requireString(opts.title, "--title");
    const { activePrd } = assertInitAllowed(opts.force ?? false, title);
    const prdId = activePrd?.id ?? generatePrdId();
    const today = todayStr();
    const prdDir = resolve(findRepoRoot(), "docs/prd");
    const { content, fileName } = generateTemplate({
      type: "full",
      title,
      date: today,
    });
    const filePath = activePrd
      ? resolve(findRepoRoot(), activePrd.filePath)
      : resolve(prdDir, fileName);
    if (opts.dryRun) {
      r.prdId = prdId;
      r.path = filePath;
      r.next = "dry-run,未写入";
      return r;
    }
    if (!existsSync(prdDir)) mkdirSync(prdDir, { recursive: true });
    if (!activePrd && existsSync(filePath)) {
      r.status = "error";
      r.errors.push(`目标文件已存在: ${filePath}`);
      return r;
    }
    // 写入顺序: markdown → meta.json → index.json
    writeFileSync(filePath, content, "utf-8");
    const now = new Date().toISOString();
    writePrdMeta({
      id: prdId,
      title,
      status: PrdStatus.Draft,
      transitions: [],
      phaseIds: [],
      nextPhaseSeq: 1,
      createdAt: now,
      updatedAt: now,
      filePath: relative(findRepoRoot(), filePath),
      version: "1.0.0",
    });
    // 同步 docs/index.md(仅当新文件不在 index 时添加)
    const indexPath = resolve(findRepoRoot(), "docs/index.md");
    if (!indexContains(indexPath, filePath.split("/").pop() ?? "")) {
      addPrdEntry(indexPath, filePath, PrdStatus.Draft, title);
    }
    r.prdId = prdId;
    r.path = filePath;
    r.next = "下一步: /sdd review";
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}

// ===== 2. reviewPrd（ADR-018 F3） =====

/** 规范语言校验: 检查 PRD 需求章节是否含 必须/应当/SHALL/MUST */
function checkNormativeLanguage(content: string): string[] {
  const warnings: string[] = [];
  const hasNormative =
    /必须|应当|SHALL|MUST|Requirement:|Scenario:/i.test(content);
  if (!hasNormative) {
    warnings.push(
      "PRD 需求章节缺少规范性语言(必须/应当/SHALL/MUST),建议补充后再提交评审。",
    );
  }
  return warnings;
}

export async function reviewPrd(): Promise<ReviewResult> {
  const r: ReviewResult = { status: "pass", errors: [], warnings: [] };
  try {
    const meta = getActivePrdMeta();
    if (!meta) throw new Error("无活跃 PRD,请先 /sdd init");
    if (meta.status !== PrdStatus.Draft) {
      throw new Error(
        `当前 PRD 状态=${meta.status},仅 Draft 可执行 /sdd review。` +
          `如需回退: /sdd back --to draft`,
      );
    }
    if (!isTransitionAllowed(PrdStatus.Draft, PrdStatus.PendingReview)) {
      throw new Error("状态机非法迁移: Draft → PendingReview");
    }
    const filePath = resolve(findRepoRoot(), meta.filePath);
    const content = readFileSync(filePath, "utf-8");
    // 门禁: validate(跳过 Check #1 Phase 回指,Draft 尚未规划 Phase)
    const vr = await validateForReview(filePath);
    if (vr.status === "error" || vr.status === "block") {
      r.status = "error";
      r.errors.push(`validate 不通过: ${vr.errors.join("; ")}`);
      return r;
    }
    // 规范语言 warn(不 block) + validator warnings 合并
    r.warnings.push(...checkNormativeLanguage(content));
    r.warnings.push(...vr.warnings);
    // 写入顺序: markdown → meta.json → index.json
    const now = new Date().toISOString();
    const updatedMeta = {
      ...meta,
      status: PrdStatus.PendingReview,
      transitions: appendTransition(meta, PrdStatus.PendingReview, "/sdd review"),
      updatedAt: now,
    };
    const newStatusLine = generatePrdStatusLine(updatedMeta);
    const updatedContent = applyStatusLine(content, newStatusLine);
    writeFileSync(filePath, updatedContent, "utf-8");
    writePrdMeta(updatedMeta);
    // 同步 docs/index.md 状态列
    const indexPath = resolve(findRepoRoot(), "docs/index.md");
    updateIndexEntry(indexPath, filePath, PrdStatus.PendingReview);
    r.prdId = meta.id;
    r.from = PrdStatus.Draft;
    r.to = PrdStatus.PendingReview;
    r.next = "下一步: /sdd approve";
    if (r.warnings.length > 0) r.status = "warn";
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}

// ===== 3. approvePrd（ADR-018 F4） =====

export async function approvePrd(opts: ApproveOptions): Promise<ApproveResult> {
  const r: ApproveResult = { status: "pass", errors: [], warnings: [] };
  try {
    const meta = getActivePrdMeta();
    if (!meta) throw new Error("无活跃 PRD,请先 /sdd init");
    if (meta.status !== PrdStatus.PendingReview) {
      throw new Error(
        `当前 PRD 状态=${meta.status},仅 PendingReview 可执行 /sdd approve。`,
      );
    }
    if (!isTransitionAllowed(PrdStatus.PendingReview, PrdStatus.Reviewed)) {
      throw new Error("状态机非法迁移: PendingReview → Reviewed");
    }
    // TODO(Phase 003): reviewer agent 门禁(配置驱动 .sdd/gate.json reviewOnApprove)
    void opts;
    const filePath = resolve(findRepoRoot(), meta.filePath);
    const content = readFileSync(filePath, "utf-8");
    const now = new Date().toISOString();
    const updatedMeta = {
      ...meta,
      status: PrdStatus.Reviewed,
      transitions: appendTransition(meta, PrdStatus.Reviewed, "/sdd approve"),
      updatedAt: now,
    };
    const newStatusLine = generatePrdStatusLine(updatedMeta);
    const updatedContent = applyStatusLine(content, newStatusLine);
    writeFileSync(filePath, updatedContent, "utf-8");
    writePrdMeta(updatedMeta);
    // 同步 docs/index.md 状态列
    const indexPath = resolve(findRepoRoot(), "docs/index.md");
    updateIndexEntry(indexPath, filePath, PrdStatus.Reviewed);
    r.prdId = meta.id;
    r.from = PrdStatus.PendingReview;
    r.to = PrdStatus.Reviewed;
    r.next = "下一步: /sdd plan";
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}

// ===== 4. backPrd（ADR-018 F8） =====

export async function backPrd(opts: BackOptions): Promise<BackResult> {
  const r: BackResult = { status: "pass", errors: [], warnings: [] };
  try {
    const meta = getActivePrdMeta();
    if (!meta) throw new Error("无活跃 PRD,请先 /sdd init");
    const toStatus =
      opts.to === "draft" ? PrdStatus.Draft : PrdStatus.PendingReview;
    if (meta.status === toStatus) {
      throw new Error(`当前状态已是 ${toStatus},无需回退。`);
    }
    if (!isTransitionAllowed(meta.status, toStatus)) {
      throw new Error(
        `非法回退: ${meta.status} → ${toStatus}。仅草稿↔待评审双向可回退。`,
      );
    }
    const filePath = resolve(findRepoRoot(), meta.filePath);
    // --to pending 时跑 validate(与 /sdd review 一致)
    if (opts.to === "pending") {
      const vr = await validateForReview(filePath);
      if (vr.status === "error" || vr.status === "block") {
        r.status = "error";
        r.errors.push(`validate 不通过: ${vr.errors.join("; ")}`);
        return r;
      }
    }
    const content = readFileSync(filePath, "utf-8");
    const now = new Date().toISOString();
    const updatedMeta = {
      ...meta,
      status: toStatus,
      transitions: appendTransition(meta, toStatus, `/sdd back --to ${opts.to}`),
      updatedAt: now,
    };
    const newStatusLine = generatePrdStatusLine(updatedMeta);
    const updatedContent = applyStatusLine(content, newStatusLine);
    writeFileSync(filePath, updatedContent, "utf-8");
    writePrdMeta(updatedMeta);
    // 同步 docs/index.md 状态列
    const indexPath = resolve(findRepoRoot(), "docs/index.md");
    updateIndexEntry(indexPath, filePath, toStatus);
    r.prdId = meta.id;
    r.from = meta.status;
    r.to = toStatus;
    r.next = toStatus === PrdStatus.Draft ? "下一步: /sdd review" : "下一步: /sdd approve";
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}
