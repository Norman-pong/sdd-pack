/**
 * prd-state-machine.test.ts — 状态机单元测试
 */

import { describe, expect, test } from "bun:test";
import {
  PrdStatus,
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
    // 草稿
    { from: PrdStatus.Draft, to: PrdStatus.Reviewing },
    { from: PrdStatus.Draft, to: PrdStatus.Abandoned },
    // 评审中
    { from: PrdStatus.Reviewing, to: PrdStatus.Reviewed },
    { from: PrdStatus.Reviewing, to: PrdStatus.Draft },
    { from: PrdStatus.Reviewing, to: PrdStatus.Abandoned },
    // 已评审
    { from: PrdStatus.Reviewed, to: PrdStatus.Published },
    { from: PrdStatus.Reviewed, to: PrdStatus.Archived },
    { from: PrdStatus.Reviewed, to: PrdStatus.Abandoned },
    // 已发布
    { from: PrdStatus.Published, to: PrdStatus.Archived },
    { from: PrdStatus.Published, to: PrdStatus.Replaced },
  ];

  for (const { from, to } of allowedCases) {
    test(`${from} → ${to} is allowed`, () => {
      expect(isTransitionAllowed(from, to)).toBe(true);
    });
  }
});

describe("状态机 — 非法迁移", () => {
  // 核心禁止场景
  test("已评审 → 草稿 非法（block）", () => {
    expect(isTransitionForbidden(PrdStatus.Reviewed, PrdStatus.Draft)).toBe(true);
  });

  test("已发布 → 草稿 非法", () => {
    expect(isTransitionForbidden(PrdStatus.Published, PrdStatus.Draft)).toBe(true);
  });

  test("已发布 → 评审中 非法", () => {
    expect(isTransitionForbidden(PrdStatus.Published, PrdStatus.Reviewing)).toBe(true);
  });

  test("已发布 → 已评审 非法", () => {
    expect(isTransitionForbidden(PrdStatus.Published, PrdStatus.Reviewed)).toBe(true);
  });

  test("草稿 → 已发布 非法（跳过评审）", () => {
    expect(isTransitionForbidden(PrdStatus.Draft, PrdStatus.Published)).toBe(true);
  });

  test("评审中 → 已发布 非法（跳过已评审）", () => {
    expect(isTransitionForbidden(PrdStatus.Reviewing, PrdStatus.Published)).toBe(true);
  });
});

describe("状态机 — 终态无出边", () => {
  for (const status of [PrdStatus.Replaced, PrdStatus.Archived, PrdStatus.Abandoned]) {
    test(`${status} 是终态，无出边`, () => {
      expect(isTerminalStatus(status)).toBe(true);
      expect(getAllowedTransitions(status)).toEqual([]);
    });
  }
});

describe("状态机 — 非终态有出边", () => {
  test("草稿 有出边", () => {
    expect(isTerminalStatus(PrdStatus.Draft)).toBe(false);
    expect(getAllowedTransitions(PrdStatus.Draft).length).toBeGreaterThan(0);
  });

  test("已发布 有出边", () => {
    expect(isTerminalStatus(PrdStatus.Published)).toBe(false);
    expect(getAllowedTransitions(PrdStatus.Published).length).toBeGreaterThan(0);
  });
});

describe("parseStatus", () => {
  test("解析合法状态", () => {
    expect(parseStatus("草稿")).toBe(PrdStatus.Draft);
    expect(parseStatus("已发布")).toBe(PrdStatus.Published);
    expect(parseStatus(" 已归档 ")).toBe(PrdStatus.Archived);
  });

  test("非法字符串返回 null", () => {
    expect(parseStatus("未开始")).toBeNull();
    expect(parseStatus("")).toBeNull();
    expect(parseStatus("进行中")).toBeNull();
  });
});

describe("getAllTransitionRules — 完整覆盖 rule §3", () => {
  const rules = getAllTransitionRules();

  test("覆盖 7 状态 × (7-1) = 42 条迁移", () => {
    expect(rules.length).toBe(42);
  });

  test("合法迁移数量正确", () => {
    const allowed = rules.filter((r) => r.direction === MigrationDirection.Allowed);
    // 草稿2 + 评审中3 + 已评审3 + 已发布2 = 10
    expect(allowed.length).toBe(10);
  });

  test("所有终态迁移标记为 forbidden", () => {
    for (const status of [PrdStatus.Replaced, PrdStatus.Archived, PrdStatus.Abandoned]) {
      const fromRules = rules.filter((r) => r.from === status);
      expect(fromRules.every((r) => r.direction === MigrationDirection.Forbidden)).toBe(true);
    }
  });
});
