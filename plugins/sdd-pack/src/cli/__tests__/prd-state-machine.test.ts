/**
 * prd-state-machine.test.ts — 状态机单元测试
 *
 * ADR-016: 6 状态模型（草稿/待评审/已评审/已规划任务/进行中/已归档）
 * 已归档 是唯一终态，其内部含 2 个子态（ArchiveReason：已完成 / 已中止）
 */

import { describe, expect, test } from "bun:test";
import {
  PrdStatus,
  ArchiveReason,
  isTransitionAllowed,
  isTransitionForbidden,
  isTerminalStatus,
  parseStatus,
  getAllowedTransitions,
  getAllTransitionRules,
  MigrationDirection,
} from "../lib/prd-state-machine";

describe("状态机 — 合法迁移", () => {
  const allowedCases: Array<{ from: PrdStatus; to: PrdStatus }> = [
    // 草稿 ↔ 待评审（可灵活切换）
    { from: PrdStatus.Draft, to: PrdStatus.PendingReview },
    { from: PrdStatus.PendingReview, to: PrdStatus.Draft },
    // 待评审 → 已评审
    { from: PrdStatus.PendingReview, to: PrdStatus.Reviewed },
    // 已评审 → 已规划任务
    { from: PrdStatus.Reviewed, to: PrdStatus.Planned },
    // 已规划任务 → 进行中
    { from: PrdStatus.Planned, to: PrdStatus.InProgress },
    // 进行中 → 已归档（带 ArchiveReason）
    { from: PrdStatus.InProgress, to: PrdStatus.Archived },
    // 任意状态可直接归档（异常路径）
    { from: PrdStatus.Draft, to: PrdStatus.Archived },
    { from: PrdStatus.PendingReview, to: PrdStatus.Archived },
    { from: PrdStatus.Reviewed, to: PrdStatus.Archived },
    { from: PrdStatus.Planned, to: PrdStatus.Archived },
  ];

  for (const { from, to } of allowedCases) {
    test(`${from} → ${to} is allowed`, () => {
      expect(isTransitionAllowed(from, to)).toBe(true);
    });
  }
});

describe("状态机 — 非法迁移", () => {
  test("已归档 → 任何状态 都不可达（终态）", () => {
    for (const to of Object.values(PrdStatus)) {
      if (to === PrdStatus.Archived) continue;
      expect(isTransitionAllowed(PrdStatus.Archived, to)).toBe(false);
    }
  });

  test("已评审 → 草稿 不可达（评审后不能退回草稿自由态）", () => {
    expect(isTransitionAllowed(PrdStatus.Reviewed, PrdStatus.Draft)).toBe(false);
    const all = getAllTransitionRules();
    const rule = all.find((r) => r.from === PrdStatus.Reviewed && r.to === PrdStatus.Draft);
    expect(rule?.direction).toBe(MigrationDirection.Forbidden);
  });

  test("草稿 → 已评审 非法（必须先进待评审）", () => {
    expect(isTransitionAllowed(PrdStatus.Draft, PrdStatus.Reviewed)).toBe(false);
  });

  test("草稿 → 进行中 非法（跳过整条链路）", () => {
    expect(isTransitionAllowed(PrdStatus.Draft, PrdStatus.InProgress)).toBe(false);
  });

  test("已规划任务 → 已评审 非法（不能回退）", () => {
    expect(isTransitionAllowed(PrdStatus.Planned, PrdStatus.Reviewed)).toBe(false);
  });
});

describe("ArchiveReason — 已归档子态", () => {
  test("枚举值正确", () => {
    // 字符串值正确（通过 string cast 绕过 enum 类型）
    expect(ArchiveReason.Completed as string).toBe("已完成");
    expect(ArchiveReason.Abandoned as string).toBe("已中止");
  });

  test("仅作为已归档的附加属性（不在 PrdStatus 迁移图里）", () => {
    // ArchiveReason 不参与状态机迁移判断
    const all = getAllTransitionRules();
    for (const rule of all) {
      // 规则里的 from/to 只可能是 PrdStatus 值
      expect(Object.values(PrdStatus)).toContain(rule.from);
      expect(Object.values(PrdStatus)).toContain(rule.to);
    }
  });
});

describe("状态机 — 终态判断", () => {
  test("已归档 是唯一终态", () => {
    for (const status of Object.values(PrdStatus)) {
      const expected = status === PrdStatus.Archived;
      expect(isTerminalStatus(status)).toBe(expected);
    }
  });

  test("已归档 无出边", () => {
    expect(getAllowedTransitions(PrdStatus.Archived)).toEqual([]);
  });

  test("非终态有出边", () => {
    expect(isTerminalStatus(PrdStatus.Draft)).toBe(false);
    expect(getAllowedTransitions(PrdStatus.Draft).length).toBeGreaterThan(0);

    expect(isTerminalStatus(PrdStatus.InProgress)).toBe(false);
    expect(getAllowedTransitions(PrdStatus.InProgress).length).toBeGreaterThan(0);
  });
});

describe("parseStatus", () => {
  test("解析合法状态", () => {
    expect(parseStatus("草稿")).toBe(PrdStatus.Draft);
    expect(parseStatus("待评审")).toBe(PrdStatus.PendingReview);
    expect(parseStatus("进行中")).toBe(PrdStatus.InProgress);
    expect(parseStatus(" 已归档 ")).toBe(PrdStatus.Archived);
  });

  test("已完成/已中止 不是 PrdStatus（是 ArchiveReason）", () => {
    expect(parseStatus("已完成")).toBeNull();
    expect(parseStatus("已中止")).toBeNull();
  });

  test("非法字符串返回 null", () => {
    expect(parseStatus("未开始")).toBeNull();
    expect(parseStatus("")).toBeNull();
    expect(parseStatus("随便写")).toBeNull();
  });
});

describe("getAllTransitionRules — 完整覆盖", () => {
  const rules = getAllTransitionRules();

  test("覆盖 6 状态 × (6-1) = 30 条迁移", () => {
    expect(rules.length).toBe(30);
  });

  test("合法迁移数量正确", () => {
    const allowed = rules.filter((r) => r.direction === MigrationDirection.Allowed);
    // 草稿2 + 待评审3 + 已评审2 + 已规划2 + 进行中1 = 10
    expect(allowed.length).toBe(10);
  });

  test("已归档所有出边均标记为 forbidden", () => {
    for (const status of [PrdStatus.Archived]) {
      const fromRules = rules.filter((r) => r.from === status);
      expect(fromRules.every((r) => r.direction === MigrationDirection.Forbidden)).toBe(true);
    }
  });
});