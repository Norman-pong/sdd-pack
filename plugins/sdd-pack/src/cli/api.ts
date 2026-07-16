/**
 * api.ts — sdd-api 程序化入口
 *
 * 13 个 export 函数供 slash command / hook / CI 三方共用。
 * 零新逻辑: 仅做 lib/orchestration/* + lib/* 调用 + 结果组装。
 *
 * 约束(PRD §3.3.5 F3.1):
 * - 每个函数 ≤ 80 行(不含类型与 import)
 * - 文件总行数 ≤ 300 行
 * - 不依赖 omp / ExtensionAPI
 * - 不调 process.exit / console.*(调用方自行处理 UI/exit)
 * - 文件 IO 走 node:fs,不依赖 bun
 */

// Re-export legacy functions from api-legacy.ts
export {
  validateDocs,
  proposePrd,
  archivePrd,
  migratePrd,
  getStatus,
  listPrds,
  getWhy,
  getApplyChecklist,
  archivePhase,
} from "./api-legacy";

// Re-export flow functions from api-flow.ts (ADR-018)
export {
  initPrd,
  reviewPrd,
  approvePrd,
  backPrd,
  planPrd,
  startPrd,
  archivePrdV2,
  phaseTransition,
  getStatusPanel,
} from "./api-flow";

// Re-export types
export type {
  ValidateOptions,
  ValidateResult as ValidationResult,
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
