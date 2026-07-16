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
