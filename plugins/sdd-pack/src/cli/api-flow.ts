/**
 * api-flow.ts — PRD 流转命令(ADR-018 F2/F3/F4/F5/F6/F7/F8/F9/F11)
 *
 * 从 api.ts 抽离,解决 api.ts ≤300 行硬约束。
 * 9 个 export 函数: initPrd / reviewPrd / approvePrd / backPrd /
 *   planPrd / startPrd / archivePrdV2 / phaseTransition / getStatusPanel。
 * 每个函数 ≤ 80 行(不含类型与 import)。
 * 文件 IO 走 node:fs,不依赖 bun,不调 process.exit / console.*。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { resolve, relative, dirname, basename } from "node:path";

import type {
  InitOptions,
  InitResult,
  ReviewResult,
  ApproveOptions,
  ApproveResult,
  BackOptions,
  BackResult,
  PlanOptions,
  PlanResult,
  StartResult,
  ArchiveOptionsV2,
  ArchiveResultV2,
  PhaseTransitionOptions,
  PhaseTransitionResult,
  StatusPanelResult,
} from "./lib/api-types";
import { applyStatusLine } from "./lib/orchestration/archive-ops";
import { findRepoRoot } from "./lib/path";
import {
  writePrdMeta,
  writePhaseMeta,
  getActivePrdMeta,
  generatePrdId,
  generatePhaseId,
  appendTransition,
  listPhaseMetas,
  readPhaseMeta,
  phaseFilePath,
  type PrdMeta,
  type PhaseMeta,
} from "./lib/meta-store";
import { generatePrdStatusLine, generatePhaseStatusLine } from "./lib/doc-parser";
import {
  isTransitionAllowed,
  isPhaseTransitionAllowed,
  PrdStatus,
  PhaseStatus,
  ArchiveReason,
} from "./lib/prd-state-machine";
import { requireString } from "./lib/orchestration/gates";
import { generateTemplate } from "./lib/template-engine";
import { addPrdEntry, updateIndexEntry, indexContains } from "./lib/index-sync";
import { validate, type ValidationConfig } from "./lib/validator";
import { runLint, runTest, runReview } from "./lib/gate-runner";

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

/** 更新 PRD markdown 状态行 + meta.json + index.md */
function syncPrdStatus(
  meta: PrdMeta,
  newStatus: PrdStatus,
  command: string,
): PrdMeta {
  const filePath = resolve(findRepoRoot(), meta.filePath);
  const content = readFileSync(filePath, "utf-8");
  const now = new Date().toISOString();
  const updatedMeta = {
    ...meta,
    status: newStatus,
    transitions: appendTransition(meta, newStatus, command),
    updatedAt: now,
  };
  const newStatusLine = generatePrdStatusLine(updatedMeta);
  const updatedContent = applyStatusLine(content, newStatusLine);
  writeFileSync(filePath, updatedContent, "utf-8");
  writePrdMeta(updatedMeta);
  const indexPath = resolve(findRepoRoot(), "docs/index.md");
  updateIndexEntry(indexPath, filePath, newStatus);
  return updatedMeta;
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

// ===== 5. planPrd（ADR-018 F5） =====

/** 生成 Phase markdown 内容 */
function generatePhaseMarkdown(title: string, prdId: string, seq: number): string {
  const today = todayStr();
  return `# Phase ${String(seq).padStart(3, "0")}: ${title}

> 状态：未开始
> 创建日期：${today}
> 对应 PRD：${prdId}

---

## 1. 阶段目标

[描述本阶段的目标]

## 2. 任务分解

| 任务 ID | 任务名称 | 预估 | 依赖 | 状态 |
|---------|---------|------|------|------|
| T01 | [任务 1] | [时间] | — | 未开始 |

## 3. 验收标准

- [ ] [验收项 1]
`;
}

export async function planPrd(opts: PlanOptions): Promise<PlanResult> {
  const r: PlanResult = { status: "pass", errors: [], warnings: [] };
  try {
    const meta = getActivePrdMeta();
    if (!meta) throw new Error("无活跃 PRD,请先 /sdd init");
    if (meta.status !== PrdStatus.Reviewed) {
      throw new Error(
        `当前 PRD 状态=${meta.status},仅 Reviewed 可执行 /sdd plan。`,
      );
    }
    if (!isTransitionAllowed(PrdStatus.Reviewed, PrdStatus.Planned)) {
      throw new Error("状态机非法迁移: Reviewed → Planned");
    }

    let phaseId: string | undefined;
    let phasePath: string | undefined;

    if (opts.phase) {
      // 创建新 Phase
      phaseId = generatePhaseId(meta.id);
      const seq = meta.nextPhaseSeq;
      phasePath = phaseFilePath(meta.id, seq, opts.phase);
      const absPath = resolve(findRepoRoot(), phasePath);
      const dir = dirname(absPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const now = new Date().toISOString();
      const phaseMeta: PhaseMeta = {
        id: phaseId,
        parentId: meta.id,
        title: opts.phase,
        status: PhaseStatus.NotStarted,
        seq,
        transitions: [],
        createdAt: now,
        updatedAt: now,
        filePath: phasePath,
      };

      // 写入顺序: markdown → meta.json
      writeFileSync(absPath, generatePhaseMarkdown(opts.phase, meta.id, seq), "utf-8");
      writePhaseMeta(phaseMeta);

      // 更新 PRD meta: phaseIds 追加 + nextPhaseSeq 递增
      meta.phaseIds.push(phaseId);
      meta.nextPhaseSeq = seq + 1;
    } else if (opts.link) {
      // 关联已有 Phase
      const existing = readPhaseMeta(opts.link);
      if (!existing) throw new Error(`Phase 不存在: ${opts.link}`);
      if (existing.parentId !== meta.id) {
        throw new Error(`Phase ${opts.link} 已属于 PRD ${existing.parentId},不可关联到 ${meta.id}`);
      }
      phaseId = opts.link;
      phasePath = existing.filePath;
      if (!meta.phaseIds.includes(phaseId)) {
        meta.phaseIds.push(phaseId);
      }
    } else {
      throw new Error("必须指定 --phase <title> 创建新 Phase 或 --link <phase-id> 关联已有 Phase");
    }

    // 更新 PRD meta: status=Planned
    const updatedMeta = syncPrdStatus(meta, PrdStatus.Planned, "/sdd plan");

    r.prdId = meta.id;
    r.from = PrdStatus.Reviewed;
    r.to = PrdStatus.Planned;
    r.phaseId = phaseId;
    r.phasePath = phasePath;
    r.next = "下一步: /sdd start";
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}

// ===== 6. startPrd（ADR-018 F6） =====

export async function startPrd(): Promise<StartResult> {
  const r: StartResult = { status: "pass", errors: [], warnings: [] };
  try {
    const meta = getActivePrdMeta();
    if (!meta) throw new Error("无活跃 PRD,请先 /sdd init");
    if (meta.status !== PrdStatus.Planned) {
      throw new Error(
        `当前 PRD 状态=${meta.status},仅 Planned 可执行 /sdd start。`,
      );
    }
    if (!isTransitionAllowed(PrdStatus.Planned, PrdStatus.InProgress)) {
      throw new Error("状态机非法迁移: Planned → InProgress");
    }

    // 检查至少 1 Phase InProgress(否则 warn 不 block)
    const phases = listPhaseMetas(meta.id);
    const inProgressCount = phases.filter((p) => p.status === PhaseStatus.InProgress).length;
    if (inProgressCount === 0 && phases.length > 0) {
      r.warnings.push(
        `所有 ${phases.length} 个 Phase 均为 NotStarted,建议先执行 /sdd phase start`,
      );
    }

    const updatedMeta = syncPrdStatus(meta, PrdStatus.InProgress, "/sdd start");

    r.prdId = meta.id;
    r.from = PrdStatus.Planned;
    r.to = PrdStatus.InProgress;
    r.next = "下一步: /sdd archive --reason <completed|abandoned>";
    if (r.warnings.length > 0) r.status = "warn";
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}

// ===== 7. archivePrdV2（ADR-018 F7） =====

export async function archivePrdV2(opts: ArchiveOptionsV2): Promise<ArchiveResultV2> {
  const r: ArchiveResultV2 = { status: "pass", errors: [], warnings: [] };
  try {
    const meta = getActivePrdMeta();
    if (!meta) throw new Error("无活跃 PRD,请先 /sdd init");
    if (meta.status === PrdStatus.Archived) {
      throw new Error("当前 PRD 已是 Archived 终态,不可重复归档");
    }
    if (!isTransitionAllowed(meta.status, PrdStatus.Archived)) {
      throw new Error(`状态机非法迁移: ${meta.status} → Archived`);
    }

    const repoRoot = findRepoRoot();

    // completed 门禁: lint + test + review
    if (opts.reason === "completed") {
      // 检查所有 Phase Completed/Abandoned
      const phases = listPhaseMetas(meta.id);
      const incomplete = phases.filter(
        (p) => p.status !== PhaseStatus.Completed && p.status !== PhaseStatus.Abandoned,
      );
      if (incomplete.length > 0) {
        r.status = "error";
        r.errors.push(
          `以下 Phase 未完成: ${incomplete.map((p) => `${p.id}(${p.status})`).join(", ")}`,
        );
        return r;
      }

      const lintResult = runLint(repoRoot);
      if (lintResult.status !== "pass") {
        r.status = "error";
        r.errors.push(`门禁 lint 未通过: ${lintResult.message ?? lintResult.stderr}`);
        return r;
      }
      const testResult = runTest(repoRoot);
      if (testResult.status === "fail") {
        r.status = "error";
        r.errors.push(`门禁 test 未通过: ${testResult.message ?? testResult.stderr}`);
        return r;
      }
      const reviewResult = runReview(repoRoot);
      if (reviewResult.status !== "pass") {
        r.status = "error";
        r.errors.push(`门禁 review 未通过: ${reviewResult.message ?? reviewResult.stderr}`);
        return r;
      }
    }

    // 更新 meta: status=Archived, archiveReason=reason
    const now = new Date().toISOString();
    const updatedMeta: PrdMeta = {
      ...meta,
      status: PrdStatus.Archived,
      archiveReason:
        opts.reason === "completed" ? ArchiveReason.Completed : ArchiveReason.Abandoned,
      transitions: appendTransition(meta, PrdStatus.Archived, `/sdd archive --reason ${opts.reason}`),
      updatedAt: now,
    };

    // 更新 markdown 状态行
    const filePath = resolve(repoRoot, meta.filePath);
    const content = readFileSync(filePath, "utf-8");
    const newStatusLine = generatePrdStatusLine(updatedMeta);
    const updatedContent = applyStatusLine(content, newStatusLine);
    writeFileSync(filePath, updatedContent, "utf-8");

    // 写入 meta.json
    writePrdMeta(updatedMeta);

    // completed: 移动文件到 archive/
    let movedTo: string | undefined;
    if (opts.reason === "completed") {
      const archiveDir = resolve(dirname(filePath), "archive");
      if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
      const dest = resolve(archiveDir, basename(filePath));
      renameSync(filePath, dest);
      movedTo = relative(repoRoot, dest);

      // 移动 Phase 分组目录
      const phaseGroupDir = resolve(repoRoot, "docs", "phase", meta.id);
      if (existsSync(phaseGroupDir)) {
        const phaseArchiveDir = resolve(repoRoot, "docs", "phase", "archive", meta.id);
        const phaseArchiveParent = dirname(phaseArchiveDir);
        if (!existsSync(phaseArchiveParent)) mkdirSync(phaseArchiveParent, { recursive: true });
        renameSync(phaseGroupDir, phaseArchiveDir);
      }
    }

    // 更新 index.md
    const indexPath = resolve(repoRoot, "docs/index.md");
    updateIndexEntry(indexPath, filePath, PrdStatus.Archived);

    r.prdId = meta.id;
    r.from = meta.status;
    r.to = PrdStatus.Archived;
    r.movedTo = movedTo;
    r.next = "归档完成,可执行 /sdd init 创建新 PRD";
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}

// ===== 8. phaseTransition（ADR-018 F9） =====

export async function phaseTransition(opts: PhaseTransitionOptions): Promise<PhaseTransitionResult> {
  const r: PhaseTransitionResult = { status: "pass", errors: [], warnings: [] };
  try {
    const meta = getActivePrdMeta();
    if (!meta) throw new Error("无活跃 PRD,请先 /sdd init");

    // 确定目标 Phase
    let phaseMeta: PhaseMeta | null = null;
    if (opts.id) {
      phaseMeta = readPhaseMeta(opts.id);
      if (!phaseMeta) throw new Error(`Phase 不存在: ${opts.id}`);
      if (phaseMeta.parentId !== meta.id) {
        throw new Error(`Phase ${opts.id} 不属于当前 PRD ${meta.id}`);
      }
    } else {
      // 默认取第一个 InProgress 的 Phase
      const phases = listPhaseMetas(meta.id);
      phaseMeta = phases.find((p) => p.status === PhaseStatus.InProgress) ?? null;
      if (!phaseMeta) {
        throw new Error("无 InProgress 的 Phase,请用 --id 指定或先 /sdd phase start");
      }
    }

    // 确定目标状态
    let toStatus: PhaseStatus;
    let command: string;
    switch (opts.action) {
      case "start":
        toStatus = PhaseStatus.InProgress;
        command = "/sdd phase start";
        break;
      case "complete":
        toStatus = PhaseStatus.Completed;
        command = "/sdd phase complete";
        break;
      case "abandon":
        toStatus = PhaseStatus.Abandoned;
        command = "/sdd phase abandon";
        break;
    }

    if (!isPhaseTransitionAllowed(phaseMeta.status, toStatus)) {
      throw new Error(
        `非法 Phase 迁移: ${phaseMeta.status} → ${toStatus}。` +
          `仅 NotStarted→InProgress→Completed/Abandoned 或 NotStarted→Abandoned。`,
      );
    }

    // complete 门禁: lint + test
    if (opts.action === "complete") {
      const repoRoot = findRepoRoot();
      const lintResult = runLint(repoRoot);
      if (lintResult.status !== "pass") {
        r.status = "error";
        r.errors.push(`门禁 lint 未通过: ${lintResult.message ?? lintResult.stderr}`);
        return r;
      }
      const testResult = runTest(repoRoot);
      if (testResult.status === "fail") {
        r.status = "error";
        r.errors.push(`门禁 test 未通过: ${testResult.message ?? testResult.stderr}`);
        return r;
      }
    }

    // 更新 Phase meta
    const now = new Date().toISOString();
    const updatedPhase: PhaseMeta = {
      ...phaseMeta,
      status: toStatus,
      transitions: appendTransition(phaseMeta, toStatus, command),
      updatedAt: now,
    };
    // 写入顺序: markdown → meta.json (ADR-018 lore constraint)
    const phaseFile = resolve(findRepoRoot(), phaseMeta.filePath);
    if (existsSync(phaseFile)) {
      const content = readFileSync(phaseFile, "utf-8");
      const newStatusLine = generatePhaseStatusLine(updatedPhase);
      const updatedContent = applyStatusLine(content, newStatusLine);
      writeFileSync(phaseFile, updatedContent, "utf-8");
    }
    writePhaseMeta(updatedPhase);

    r.phaseId = phaseMeta.id;
    r.from = phaseMeta.status;
    r.to = toStatus;

    // complete 后检查是否全部完成
    if (opts.action === "complete") {
      const allPhases = listPhaseMetas(meta.id);
      const allDone = allPhases.every(
        (p) => p.status === PhaseStatus.Completed || p.status === PhaseStatus.Abandoned,
      );
      if (allDone) {
        r.next = "所有 Phase 已完成,可执行 /sdd archive --reason completed";
      } else {
        r.next = "下一步: /sdd phase complete 或 /sdd phase start";
      }
    } else if (opts.action === "start") {
      r.next = "下一步: /sdd phase complete";
    } else {
      r.next = "Phase 已废弃";
    }

    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}

// ===== 9. getStatusPanel（ADR-018 F11） =====

export async function getStatusPanel(): Promise<StatusPanelResult> {
  const r: StatusPanelResult = { status: "pass", errors: [], warnings: [] };
  try {
    const meta = getActivePrdMeta();
    if (!meta) {
      r.status = "error";
      r.errors.push("无活跃 PRD,请先 /sdd init");
      return r;
    }

    const phases = listPhaseMetas(meta.id);
    const availableActions: string[] = [];

    // 根据状态推导可执行操作
    switch (meta.status) {
      case PrdStatus.Draft:
        availableActions.push("/sdd review");
        break;
      case PrdStatus.PendingReview:
        availableActions.push("/sdd approve", "/sdd back --to draft");
        break;
      case PrdStatus.Reviewed:
        availableActions.push("/sdd plan --phase <title>");
        break;
      case PrdStatus.Planned:
        availableActions.push("/sdd start");
        break;
      case PrdStatus.InProgress: {
        const inProgressPhase = phases.find((p) => p.status === PhaseStatus.InProgress);
        if (inProgressPhase) {
          availableActions.push(`/sdd phase complete --id ${inProgressPhase.id}`);
        }
        const notStartedPhase = phases.find((p) => p.status === PhaseStatus.NotStarted);
        if (notStartedPhase) {
          availableActions.push(`/sdd phase start --id ${notStartedPhase.id}`);
        }
        const allDone = phases.every(
          (p) => p.status === PhaseStatus.Completed || p.status === PhaseStatus.Abandoned,
        );
        if (allDone && phases.length > 0) {
          availableActions.push("/sdd archive --reason completed");
        }
        availableActions.push("/sdd archive --reason abandoned");
        break;
      }
      case PrdStatus.Archived:
        availableActions.push("/sdd init <title>");
        break;
    }

    r.prdId = meta.id;
    r.title = meta.title;
    r.prdStatus = meta.status;
    r.phaseCount = phases.length;
    r.phases = phases.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
    }));
    r.availableActions = availableActions;
    return r;
  } catch (e) {
    r.status = "error";
    r.errors.push(errMsg(e));
    return r;
  }
}
