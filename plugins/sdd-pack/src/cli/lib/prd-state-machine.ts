/**
 * prd-state-machine.ts — PRD 生命周期状态机
 *
 * 程序化实现 prd-change-management rule §3 状态机表
 * 7 状态 × 合法迁移 × 非法迁移
 */

/** PRD 文档的所有合法状态 */
export enum PrdStatus {
  Draft = "草稿",
  Reviewing = "评审中",
  Reviewed = "已评审",
  Published = "已发布",
  Replaced = "已替换",
  Archived = "已归档",
  Abandoned = "已废弃",
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

/** 状态机迁移表（与 prd-change-management rule §3 完全一致） */
const TRANSITION_MATRIX: Record<PrdStatus, { allowed: Set<PrdStatus>; forbidden: Set<PrdStatus> }> = {
  [PrdStatus.Draft]: {
    allowed: new Set([PrdStatus.Reviewing, PrdStatus.Abandoned]),
    forbidden: new Set([PrdStatus.Published, PrdStatus.Reviewed, PrdStatus.Replaced, PrdStatus.Archived]),
  },
  [PrdStatus.Reviewing]: {
    allowed: new Set([PrdStatus.Reviewed, PrdStatus.Draft, PrdStatus.Abandoned]),
    forbidden: new Set([PrdStatus.Published, PrdStatus.Replaced, PrdStatus.Archived]),
  },
  [PrdStatus.Reviewed]: {
    allowed: new Set([PrdStatus.Published, PrdStatus.Archived, PrdStatus.Abandoned]),
    forbidden: new Set([PrdStatus.Draft, PrdStatus.Reviewing, PrdStatus.Replaced]),
  },
  [PrdStatus.Published]: {
    allowed: new Set([PrdStatus.Archived, PrdStatus.Replaced]),
    forbidden: new Set([PrdStatus.Draft, PrdStatus.Reviewing, PrdStatus.Reviewed, PrdStatus.Abandoned]),
  },
  [PrdStatus.Replaced]: {
    allowed: new Set(),
    forbidden: new Set(Object.values(PrdStatus)),
  },
  [PrdStatus.Archived]: {
    allowed: new Set(),
    forbidden: new Set(Object.values(PrdStatus)),
  },
  [PrdStatus.Abandoned]: {
    allowed: new Set(),
    forbidden: new Set(Object.values(PrdStatus)),
  },
};

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
        direction: isTransitionAllowed(from, to) ? MigrationDirection.Allowed : MigrationDirection.Forbidden,
      });
    }
  }
  return rules;
}
