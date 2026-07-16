/**
 * Phase 状态机单元测试（ADR-017）
 *
 * 4 状态模型（未开始/进行中/已完成/已废弃），2 终态
 */

import { describe, expect, test } from "bun:test";
import {
  PhaseStatus,
  isPhaseTransitionAllowed,
  isPhaseTransitionForbidden,
  isPhaseTerminalStatus,
  parsePhaseStatus,
} from "../lib/prd-state-machine";

describe("Phase 状态机 — 合法迁移", () => {
  const allowedCases: Array<{ from: PhaseStatus; to: PhaseStatus }> = [
    { from: PhaseStatus.NotStarted, to: PhaseStatus.InProgress },
    { from: PhaseStatus.NotStarted, to: PhaseStatus.Abandoned },
    { from: PhaseStatus.InProgress, to: PhaseStatus.Completed },
    { from: PhaseStatus.InProgress, to: PhaseStatus.Abandoned },
  ];

  for (const { from, to } of allowedCases) {
    test(`${from} → ${to} is allowed`, () => {
      expect(isPhaseTransitionAllowed(from, to)).toBe(true);
    });
  }
});

describe("Phase 状态机 — 非法迁移", () => {
  test("未开始 → 已完成 非法（跳过进行中）", () => {
    expect(isPhaseTransitionAllowed(PhaseStatus.NotStarted, PhaseStatus.Completed)).toBe(false);
  });

  test("已完成 → 未开始 非法（终态回退）", () => {
    expect(isPhaseTransitionAllowed(PhaseStatus.Completed, PhaseStatus.NotStarted)).toBe(false);
  });

  test("已完成 → 进行中 非法（终态回退）", () => {
    expect(isPhaseTransitionAllowed(PhaseStatus.Completed, PhaseStatus.InProgress)).toBe(false);
  });

  test("已废弃 → 任何状态 都不可达（终态）", () => {
    for (const to of Object.values(PhaseStatus)) {
      if (to === PhaseStatus.Abandoned) continue;
      expect(isPhaseTransitionAllowed(PhaseStatus.Abandoned, to)).toBe(false);
    }
  });

  test("已完成 → 任何状态 都不可达（终态）", () => {
    for (const to of Object.values(PhaseStatus)) {
      if (to === PhaseStatus.Completed) continue;
      expect(isPhaseTransitionAllowed(PhaseStatus.Completed, to)).toBe(false);
    }
  });
});

describe("Phase 状态机 — 终态判断", () => {
  test("已完成 和 已废弃 是终态", () => {
    expect(isPhaseTerminalStatus(PhaseStatus.Completed)).toBe(true);
    expect(isPhaseTerminalStatus(PhaseStatus.Abandoned)).toBe(true);
  });

  test("未开始 和 进行中 不是终态", () => {
    expect(isPhaseTerminalStatus(PhaseStatus.NotStarted)).toBe(false);
    expect(isPhaseTerminalStatus(PhaseStatus.InProgress)).toBe(false);
  });
});

describe("Phase 状态机 — isPhaseTransitionForbidden 显式集合", () => {
  test("未开始 → 已完成 显式 forbidden", () => {
    expect(isPhaseTransitionForbidden(PhaseStatus.NotStarted, PhaseStatus.Completed)).toBe(true);
  });

  test("进行中 → 未开始 显式 forbidden", () => {
    expect(isPhaseTransitionForbidden(PhaseStatus.InProgress, PhaseStatus.NotStarted)).toBe(true);
  });
});

describe("parsePhaseStatus", () => {
  test("解析合法状态", () => {
    expect(parsePhaseStatus("未开始")).toBe(PhaseStatus.NotStarted);
    expect(parsePhaseStatus("进行中")).toBe(PhaseStatus.InProgress);
    expect(parsePhaseStatus(" 已完成 ")).toBe(PhaseStatus.Completed);
    expect(parsePhaseStatus("已废弃")).toBe(PhaseStatus.Abandoned);
  });

  test("PRD 状态字符串不是 Phase 状态", () => {
    expect(parsePhaseStatus("草稿")).toBeNull();
    expect(parsePhaseStatus("已归档")).toBeNull();
    expect(parsePhaseStatus("待评审")).toBeNull();
  });

  test("非法字符串返回 null", () => {
    expect(parsePhaseStatus("")).toBeNull();
    expect(parsePhaseStatus("随便写")).toBeNull();
  });
});