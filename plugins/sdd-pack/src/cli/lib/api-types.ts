/**
 * api-types.ts — api.ts 的对外类型定义
 *
 * 抽离到 lib/ 是为了让 api.ts ≤ 300 行(phase doc §3.3.5 F3.1 硬上限)。
 * 8 个 export 函数共用一组 options/result 类型。
 */

import type { ValidationResult, CheckSeverity } from "./validator";

/** validateDocs 入参 */
export interface ValidateOptions {
  path?: string;
  staged?: boolean;
  severity?: CheckSeverity;
  json?: boolean;
  rulesOnly?: boolean;
  structureOnly?: boolean;
  files?: string[];
}

/** validateDocs 直接复用 ValidationResult,本类型仅为语义清晰 */
export type ValidateResult = ValidationResult;

/** proposePrd 入参 */
export interface ProposeOptions {
  spec?: string;
  supersedes?: string;
  title?: string;
  type?: "full" | "delta";
  dryRun?: boolean;
}

export interface ProposeResult {
  status: "pass" | "error";
  path?: string;
  content?: string;
  errors: string[];
  warnings: string[];
  next?: string;
}

/** archivePrd 入参 */
export interface ArchiveOptions {
  prdPath: string;
  reason?: "completed" | "replaced" | "abandoned";
  mergeDelta?: boolean;
  dryRun?: boolean;
  noCommit?: boolean;
  newPrdPath?: string;
}

export interface ArchiveResult {
  status: "pass" | "warn" | "error";
  operations: string[];
  movedTo?: string;
  statusLineUpdated: boolean;
  indexSynced: boolean;
  loreCommitted: boolean;
  errors: string[];
  warnings: string[];
}

/** migratePrd 入参 */
export interface MigrateOptions {
  prdPath: string;
  dryRun?: boolean;
  noBackup?: boolean;
}

export interface MigrateResult {
  status: "pass" | "warn" | "error";
  parsedEntries: number;
  changelogPath?: string;
  backupPath?: string;
  newStatusLine?: string;
  errors: string[];
  warnings: string[];
}

/** getStatus 返回 */
export interface StatusItem {
  path: string;
  fileName: string;
  type: "prd" | "phase";
  status: string;
  version?: string;
  publishDate?: string;
  references: string[];
}
export interface StatusResult {
  items: StatusItem[];
  prdCount: number;
  phaseCount: number;
}

/** listPrds 入参与返回 */
export interface ListOptions {
  status?: string;
  date?: string;
  keyword?: string;
  type?: "prd" | "phase" | "spec";
  json?: boolean;
}
export interface ListItem {
  date: string;
  fileName: string;
  type: string;
  status: string;
  title: string;
  path: string;
}
export interface ListResult {
  items: ListItem[];
  matched: number;
}

/** getWhy 入参与返回 */
export interface WhyResult {
  available: boolean;
  target: string;
  text: string;
  parsed?: unknown;
  error?: string;
}

/** getApplyChecklist 入参与返回 */
export interface ApplyChecklistItem {
  id: number;
  description: string;
  section: string;
}
export interface ApplyResult {
  prdPath: string;
  items: ApplyChecklistItem[];
  total: number;
}

/** archivePhase 入参（ADR-017） */
export interface PhaseArchiveOptions {
  phasePath: string;
  reason: "completed" | "abandoned";
  dryRun?: boolean;
  noCommit?: boolean;
}

/** archivePhase 返回 */
export interface PhaseArchiveResult {
  status: "pass" | "warn" | "error";
  operations: string[];
  statusLineUpdated: boolean;
  indexSynced: boolean;
  loreCommitted: boolean;
  errors: string[];
  warnings: string[];
}

// ===== ADR-018: PRD 前半段流转命令类型 =====

/** initPrd 入参 */
export interface InitOptions {
  /** PRD 标题(必填) */
  title: string;
  /** 覆盖自动生成的 slug（ASCII kebab-case）；ADR-019 §3.2.3 */
  slug?: string;
  /** 仅允许覆盖空草稿(Draft + transitions 为空) */
  force?: boolean;
  dryRun?: boolean;
}

/** initPrd 返回 */
export interface InitResult {
  status: "pass" | "error";
  prdId?: string;
  path?: string;
  errors: string[];
  warnings: string[];
  next?: string;
}

/** reviewPrd 返回 */
export interface ReviewResult {
  status: "pass" | "warn" | "error";
  prdId?: string;
  from?: string;
  to?: string;
  errors: string[];
  warnings: string[];
  next?: string;
}

/** approvePrd 入参(预留 reviewer 门禁配置) */
export interface ApproveOptions {
  /** 跳过 reviewer 门禁(仅当 .sdd/gate.json reviewOnApprove=true 时生效) */
  skipReviewer?: boolean;
}

/** approvePrd 返回 */
export interface ApproveResult {
  status: "pass" | "error";
  prdId?: string;
  from?: string;
  to?: string;
  errors: string[];
  warnings: string[];
  next?: string;
}

/** backPrd 入参 */
export interface BackOptions {
  /** 目标状态: draft=草稿, pending=待评审 */
  to: "draft" | "pending";
}

/** backPrd 返回 */
export interface BackResult {
  status: "pass" | "error";
  prdId?: string;
  from?: string;
  to?: string;
  errors: string[];
  warnings: string[];
  next?: string;
}

// ===== ADR-018: PRD 后半段流转命令类型(Phase 002) =====

/** planPrd 入参 */
export interface PlanOptions {
  /** 创建新 Phase 的标题 */
  phase?: string;
  /** 关联已有 Phase ID */
  link?: string;
}

/** planPrd 返回 */
export interface PlanResult {
  status: "pass" | "error";
  prdId?: string;
  from?: string;
  to?: string;
  phaseId?: string;
  phasePath?: string;
  errors: string[];
  warnings: string[];
  next?: string;
}

/** startPrd 返回 */
export interface StartResult {
  status: "pass" | "warn" | "error";
  prdId?: string;
  from?: string;
  to?: string;
  errors: string[];
  warnings: string[];
  next?: string;
}

/** archivePrdV2 入参 */
export interface ArchiveOptionsV2 {
  /** 归档原因(必填) */
  reason: "completed" | "abandoned";
}

/** archivePrdV2 返回 */
export interface ArchiveResultV2 {
  status: "pass" | "error";
  prdId?: string;
  from?: string;
  to?: string;
  movedTo?: string;
  errors: string[];
  warnings: string[];
  next?: string;
}

/** phaseTransition 入参 */
export interface PhaseTransitionOptions {
  /** Phase ID(可选,默认取 active PRD 的第一个 InProgress Phase) */
  id?: string;
  /** 目标动作 */
  action: "start" | "complete" | "abandon";
}

/** phaseTransition 返回 */
export interface PhaseTransitionResult {
  status: "pass" | "warn" | "error";
  phaseId?: string;
  from?: string;
  to?: string;
  errors: string[];
  warnings: string[];
  next?: string;
}

/** getStatusPanel 返回 */
export interface StatusPanelResult {
  status: "pass" | "error";
  prdId?: string;
  title?: string;
  prdStatus?: string;
  phaseCount?: number;
  phases?: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  availableActions?: string[];
  errors: string[];
  warnings: string[];
}

// ===== ADR-018: syncMeta / rebuildMeta(Phase 003) =====

/** syncMeta 入参 */
export interface SyncOptions {
  /** 修复不一致: 从 meta.json 生成 markdown 状态行覆盖 */
  fix?: boolean;
}

/** 单个不一致项 */
export interface SyncMismatch {
  /** 文件路径(相对 repo root) */
  filePath: string;
  /** 类型: prd 或 phase */
  kind: "prd" | "phase";
  /** meta.json 中的状态 */
  metaStatus: string;
  /** markdown 状态行中的状态 */
  markdownStatus: string;
}

/** syncMeta 返回 */
export interface SyncResult {
  status: "pass" | "warn" | "error";
  /** 不一致项列表 */
  mismatches: SyncMismatch[];
  /** 修复数量(--fix 时) */
  fixedCount: number;
  /** 重建 meta.json 数量 */
  rebuiltCount: number;
  errors: string[];
  warnings: string[];
}

/** rebuildMeta 返回 */
export interface RebuildResult {
  status: "pass" | "error";
  /** 重建的 PRD 数量 */
  prdCount: number;
  /** 重建的 Phase 数量 */
  phaseCount: number;
  errors: string[];
  warnings: string[];
}
