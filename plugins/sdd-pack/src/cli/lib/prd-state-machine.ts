/**
 * prd-state-machine.ts — PRD 生命周期状态机
 *
 * 6 PrdStatus + 2 ArchiveReason（已归档终态含 已完成/已中止 两个归档原因）
 */

/** PRD 文档的所有合法状态（ADR-016 重构） */
export enum PrdStatus {
  /** 草稿：概念先行，无任何约束，可自由修改 */
  Draft = "草稿",
  /** 待评审：经过多轮沟通，格式/规范已正式 */
  PendingReview = "待评审",
  /** 已评审：评审通过，等待规划任务 */
  Reviewed = "已评审",
  /** 已规划任务：任务已拆解到 phase/，待开始执行 */
  Planned = "已规划任务",
  /** 进行中：phase 任务正在执行 */
  InProgress = "进行中",
  /** 已归档：终态，文件已移入 archive/ 目录。归档原因见 ArchiveReason */
  Archived = "已归档",
}

/** 已归档 的子态（归档原因），仅作为 Archived 的附加属性 */
export enum ArchiveReason {
  /** 项目完成，所有 phase 全部通过 */
  Completed = "已完成",
  /** 项目中止，不再继续推进 */
  Abandoned = "已中止",
}

/** 状态迁移方向 */
export enum MigrationDirection {
  Allowed = "allowed",
  Forbidden = "forbidden",
}

/** 单个迁移规则 */
export interface TransitionRule {
  from: PrdStatus;
  to: PrdStatus;
  direction: MigrationDirection;
}


const TRANSITION_MATRIX: Record<PrdStatus, { allowed: Set<PrdStatus>; forbidden: Set<PrdStatus> }> =
  {
    [PrdStatus.Draft]: {
      // 草稿 → 待评审（多轮沟通后正式化）/ 已归档（直接废弃）
      // 草稿 ↔ 待评审 可灵活切换
      allowed: new Set([PrdStatus.PendingReview, PrdStatus.Archived]),
      forbidden: new Set([PrdStatus.Reviewed, PrdStatus.Planned, PrdStatus.InProgress]),
    },
    [PrdStatus.PendingReview]: {
      // 待评审 → 已评审（评审通过）/ 草稿（打回继续改）/ 已归档
      allowed: new Set([PrdStatus.Reviewed, PrdStatus.Draft, PrdStatus.Archived]),
      forbidden: new Set([PrdStatus.Planned, PrdStatus.InProgress]),
    },
    [PrdStatus.Reviewed]: {
      // 已评审 → 已规划任务 / 已归档
      allowed: new Set([PrdStatus.Planned, PrdStatus.Archived]),
      forbidden: new Set([PrdStatus.InProgress]),
    },
    [PrdStatus.Planned]: {
      // 已规划任务 → 进行中 / 已归档
      allowed: new Set([PrdStatus.InProgress, PrdStatus.Archived]),
      forbidden: new Set(),
    },
    [PrdStatus.InProgress]: {
      // 进行中 → 已归档（带 ArchiveReason：已完成 或 已中止）
      allowed: new Set([PrdStatus.Archived]),
      forbidden: new Set(),
    },
    [PrdStatus.Archived]: {
      // 已归档是终态
      allowed: new Set(),
      forbidden: new Set(Object.values(PrdStatus)),
    },
}

/**
 * 判断迁移是否合法
 */
export function isTransitionAllowed(from: PrdStatus, to: PrdStatus): boolean {
  return TRANSITION_MATRIX[from]?.allowed.has(to) ?? false;
}

/**
 * 判断迁移是否非法
 */
export function isTransitionForbidden(from: PrdStatus, to: PrdStatus): boolean {
  return TRANSITION_MATRIX[from]?.forbidden.has(to) ?? false;
}

/**
 * 获取某状态的所有合法目标状态
 */
export function getAllowedTransitions(from: PrdStatus): PrdStatus[] {
  return Array.from(TRANSITION_MATRIX[from]?.allowed ?? []);
}

/**
 * 获取某状态的所有非法目标状态
 */
export function getForbiddenTransitions(from: PrdStatus): PrdStatus[] {
  return Array.from(TRANSITION_MATRIX[from]?.forbidden ?? []);
}

/**
 * 判断是否为终态（无出边）
 */
export function isTerminalStatus(status: PrdStatus): boolean {
  const row = TRANSITION_MATRIX[status];
  return row ? row.allowed.size === 0 : false;
}

/**
 * 解析状态字符串为 PrdStatus
 * 不区分前后空格
 */
export function parseStatus(s: string): PrdStatus | null {
  const trimmed = s.trim();
  for (const status of Object.values(PrdStatus)) {
    if (status === trimmed) return status;
  }
  return null;
}

/**
 * 生成所有迁移规则（用于测试覆盖）
 */
export function getAllTransitionRules(): TransitionRule[] {
  const rules: TransitionRule[] = [];
  for (const from of Object.values(PrdStatus)) {
    for (const to of Object.values(PrdStatus)) {
      if (from === to) continue;
      rules.push({
        from,
        to,
        direction: isTransitionAllowed(from, to)
          ? MigrationDirection.Allowed
          : MigrationDirection.Forbidden,
      });
    }
  }
  return rules;
}

// ===== Phase 状态机（ADR-017） =====

/** Phase 文档的所有合法状态 */
export enum PhaseStatus {
  /** 未开始：任务待执行 */
  NotStarted = "未开始",
  /** 进行中：任务正在执行 */
  InProgress = "进行中",
  /** 已完成：所有任务验收通过（终态） */
  Completed = "已完成",
  /** 已废弃：任务废弃不再执行（终态） */
  Abandoned = "已废弃",
}

/** Phase 状态迁移表（ADR-017） */
const PHASE_TRANSITION_MATRIX: Record<PhaseStatus, { allowed: Set<PhaseStatus>; forbidden: Set<PhaseStatus> }> =
  {
    [PhaseStatus.NotStarted]: {
      // 未开始 → 进行中 / 已废弃
      allowed: new Set([PhaseStatus.InProgress, PhaseStatus.Abandoned]),
      forbidden: new Set([PhaseStatus.Completed]),
    },
    [PhaseStatus.InProgress]: {
      // 进行中 → 已完成 / 已废弃
      allowed: new Set([PhaseStatus.Completed, PhaseStatus.Abandoned]),
      forbidden: new Set([PhaseStatus.NotStarted]),
    },
    [PhaseStatus.Completed]: {
      // 已完成是终态
      allowed: new Set(),
      forbidden: new Set(Object.values(PhaseStatus)),
    },
    [PhaseStatus.Abandoned]: {
      // 已废弃是终态
      allowed: new Set(),
      forbidden: new Set(Object.values(PhaseStatus)),
    },
  };

/** 判断 Phase 迁移是否合法 */
export function isPhaseTransitionAllowed(from: PhaseStatus, to: PhaseStatus): boolean {
  return PHASE_TRANSITION_MATRIX[from]?.allowed.has(to) ?? false;
}

/** 判断 Phase 迁移是否非法 */
export function isPhaseTransitionForbidden(from: PhaseStatus, to: PhaseStatus): boolean {
  return PHASE_TRANSITION_MATRIX[from]?.forbidden.has(to) ?? false;
}

/** 判断 Phase 是否为终态（无出边） */
export function isPhaseTerminalStatus(status: PhaseStatus): boolean {
  const row = PHASE_TRANSITION_MATRIX[status];
  return row ? row.allowed.size === 0 : false;
}

/** 解析 Phase 状态字符串为 PhaseStatus */
export function parsePhaseStatus(s: string): PhaseStatus | null {
  const trimmed = s.trim();
  for (const status of Object.values(PhaseStatus)) {
    if (status === trimmed) return status;
  }
  return null;
}
