/**
 * doc-parser.test.ts — 文档解析单元测试
 */

import { describe, expect, test } from "bun:test";
import {
  parseStatusLine,
  parseStackedStatusLine,
  hasStackedStatusLine,
  parseReferences,
  extractTitle,
  isValidFileName,
  extractRequiredSections,
  extractH1,
  generatePrdStatusLine,
  generatePhaseStatusLine,
} from "../lib/doc-parser";
import { PrdStatus, PhaseStatus, ArchiveReason } from "../lib/prd-state-machine";
import type { PrdMeta, PhaseMeta } from "../lib/meta-store";

describe("parseStatusLine", () => {
  test("规范单行状态行", () => {
    const result = parseStatusLine("> 状态：已发布 | 发布日期：2026-06-25 | 版本：1.2.3");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("已发布");
    expect(result!.publishDate).toBe("2026-06-25");
    expect(result!.version).toBe("1.2.3");
  });

  test("最小状态行（仅状态）", () => {
    const result = parseStatusLine("> 状态：草稿");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("草稿");
    expect(result!.publishDate).toBeUndefined();
    expect(result!.version).toBeUndefined();
  });

  test("状态行带 changelog 引用", () => {
    const result = parseStatusLine(
      "> 状态：已发布 | 发布日期：2026-06-25 | 版本：1.2.3\n> 变更历史：见 [CHANGELOG](./CHANGELOG-2026-06-24-sdd-pack.md)",
    );
    expect(result).not.toBeNull();
    expect(result!.changelog).toBe("./CHANGELOG-2026-06-24-sdd-pack.md");
  });

  test("无效行返回 null", () => {
    expect(parseStatusLine("")).toBeNull();
    expect(parseStatusLine("> 这是一行注释")).toBeNull();
  });

  test("格式正确但状态值未知时仍可解析", () => {
    const result = parseStatusLine("状态:xxx");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("xxx");
  });
});

describe("parseStackedStatusLine", () => {
  test("堆叠状态行解析", () => {
    const result = parseStackedStatusLine(
      "> 状态:1.2.3 已发布(2026-06-25);v1.2.0 新增三层守门 agent;v1.2.1 修正误报",
    );
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    expect(result![0].version).toBe("1.2.3");
    expect(result![0].status).toBe("已发布");
    expect(result![0].date).toBe("2026-06-25");
    expect(result![1].version).toBe("1.2.0");
  });

  test("单版本非堆叠返回 null", () => {
    const result = parseStackedStatusLine("> 状态：已发布 | 发布日期：2026-06-25");
    expect(result).toBeNull();
  });

  test("无分号的行返回 null", () => {
    const result = parseStackedStatusLine("> 状态:1.2.3 已发布(2026-06-25)");
    expect(result).toBeNull();
  });
});

describe("hasStackedStatusLine", () => {
  test("检测堆叠", () => {
    const content = "> 状态:1.2.3 已发布(2026-06-25);v1.2.0 新增功能\n";
    expect(hasStackedStatusLine(content)).toBe(true);
  });

  test("规范行非堆叠", () => {
    const content = "> 状态：已发布 | 发布日期：2026-06-25\n";
    expect(hasStackedStatusLine(content)).toBe(false);
  });
});

describe("parseReferences", () => {
  test("解析所有引用类型", () => {
    const content = [
      "> 状态：草稿",
      "> 对应 PRD：[SDD Pack PRD](../prd/2026-06-24-sdd-pack.md)",
      "> 对应阶段：[阶段文档](../phase/2026-06-29-sdd-cli.md)",
      "> 替代：[旧 PRD](../prd/2026-06-24-sdd-pack.md)",
      "> 已被：[新 PRD](../prd/2026-06-29-sdd-cli.md) 替代",
    ].join("\n");

    const refs = parseReferences(content);
    expect(refs.prdRef).toBe("../prd/2026-06-24-sdd-pack.md");
    expect(refs.phaseRef).toBe("../phase/2026-06-29-sdd-cli.md");
    expect(refs.supersedes).toBe("../prd/2026-06-24-sdd-pack.md");
    expect(refs.supersededBy).toBe("../prd/2026-06-29-sdd-cli.md");
  });

  test("无引用时返回空", () => {
    const refs = parseReferences("> 状态：草稿\n# Hello");
    expect(refs.prdRef).toBeUndefined();
    expect(refs.phaseRef).toBeUndefined();
  });
});

describe("extractTitle / extractH1", () => {
  test("提取标题", () => {
    const content = "# sdd CLI PRD\n\n> 状态：草稿\n";
    expect(extractTitle(content)).toBe("sdd CLI PRD");
    expect(extractH1(content)).toBe("sdd CLI PRD");
  });

  test("无标题返回空", () => {
    expect(extractTitle("")).toBe("");
    expect(extractH1("> 状态：草稿")).toBeNull();
  });
});

describe("isValidFileName", () => {
  test("合法文件名", () => {
    expect(isValidFileName("2026-06-29-sdd-cli.md")).toBe(true);
    expect(isValidFileName("2026-06-24-sdd-pack.md")).toBe(true);
  });

  test("非法文件名", () => {
    expect(isValidFileName("_template.md")).toBe(false);
    expect(isValidFileName("README.md")).toBe(false);
    expect(isValidFileName("my-doc.md")).toBe(false);
    expect(isValidFileName("2026-06-29-SDD-CLI.md")).toBe(false);
  });
});

describe("extractRequiredSections", () => {
  test("完整 PRD 无缺少", () => {
    const content = ["## 0. 目标声明", "## 1. 背景与目标", "## 3. 功能需求", "## 8. 验收标准"].join(
      "\n\n",
    );
    expect(extractRequiredSections(content)).toEqual([]);
  });

  test("缺少章节时返回列表", () => {
    const content = "## 1. 背景\n";
    const missing = extractRequiredSections(content);
    expect(missing).toContain("## 0. 目标声明");
    expect(missing).toContain("## 3. 功能需求");
    expect(missing).toContain("## 8. 验收标准");
  });
});

describe("generatePrdStatusLine", () => {
  const basePrdMeta: PrdMeta = {
    id: "prd-20260716-001",
    title: "Test PRD",
    status: PrdStatus.Draft,
    transitions: [],
    phaseIds: [],
    nextPhaseSeq: 1,
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
    filePath: "docs/prd/prd-20260716-001.md",
    version: "v1.8.0",
  };

  test("草稿状态（无 transitions）", () => {
    const line = generatePrdStatusLine(basePrdMeta);
    expect(line).toBe("> 状态：草稿 | 发布日期：2026-07-16 | 版本：v1.8.0");
  });

  test("进行中状态（有 transitions）", () => {
    const meta: PrdMeta = {
      ...basePrdMeta,
      status: PrdStatus.InProgress,
      transitions: [
        { from: null, to: PrdStatus.Draft, at: "2026-07-16T10:00:00.000Z", by: "test" },
        { from: PrdStatus.Draft, to: PrdStatus.InProgress, at: "2026-07-16T12:00:00.000Z", by: "test" },
      ],
    };
    const line = generatePrdStatusLine(meta);
    expect(line).toBe("> 状态：进行中 | 发布日期：2026-07-16 | 版本：v1.8.0");
  });

  test("已归档状态带归档原因", () => {
    const meta: PrdMeta = {
      ...basePrdMeta,
      status: PrdStatus.Archived,
      archiveReason: ArchiveReason.Completed,
      transitions: [
        { from: null, to: PrdStatus.Draft, at: "2026-07-16T10:00:00.000Z", by: "test" },
        { from: PrdStatus.InProgress, to: PrdStatus.Archived, at: "2026-07-16T18:00:00.000Z", by: "test" },
      ],
    };
    const line = generatePrdStatusLine(meta);
    expect(line).toBe("> 状态：已归档 | 发布日期：2026-07-16 | 版本：v1.8.0 | 归档原因：已完成");
  });

  test("已归档状态带已中止归档原因", () => {
    const meta: PrdMeta = {
      ...basePrdMeta,
      status: PrdStatus.Archived,
      archiveReason: ArchiveReason.Abandoned,
      transitions: [
        { from: null, to: PrdStatus.Draft, at: "2026-07-16T10:00:00.000Z", by: "test" },
        { from: PrdStatus.InProgress, to: PrdStatus.Archived, at: "2026-07-16T18:00:00.000Z", by: "test" },
      ],
    };
    const line = generatePrdStatusLine(meta);
    expect(line).toBe("> 状态：已归档 | 发布日期：2026-07-16 | 版本：v1.8.0 | 归档原因：已中止");
    const parsed = parseStatusLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.status).toBe("已归档");
  });

  test("与 parseStatusLine 可逆兼容", () => {
    const meta: PrdMeta = {
      ...basePrdMeta,
      status: PrdStatus.Reviewed,
      transitions: [
        { from: null, to: PrdStatus.Draft, at: "2026-07-16T10:00:00.000Z", by: "test" },
        { from: PrdStatus.PendingReview, to: PrdStatus.Reviewed, at: "2026-07-16T14:00:00.000Z", by: "test" },
      ],
    };
    const line = generatePrdStatusLine(meta);
    const parsed = parseStatusLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.status).toBe("已评审");
    expect(parsed!.publishDate).toBe("2026-07-16");
    expect(parsed!.version).toBe("v1.8.0");
  });
});

describe("generatePhaseStatusLine", () => {
  const basePhaseMeta: PhaseMeta = {
    id: "phs-001-001",
    parentId: "prd-20260716-001",
    title: "Test Phase",
    status: PhaseStatus.NotStarted,
    seq: 1,
    transitions: [],
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
    filePath: "docs/phase/prd-20260716-001/001-test.md",
  };

  test("未开始状态（无 transitions）", () => {
    const line = generatePhaseStatusLine(basePhaseMeta);
    expect(line).toBe("> 状态：未开始 | 发布日期：2026-07-16");
  });

  test("进行中状态（有 transitions）", () => {
    const meta: PhaseMeta = {
      ...basePhaseMeta,
      status: PhaseStatus.InProgress,
      transitions: [
        { from: null, to: PhaseStatus.NotStarted, at: "2026-07-16T10:00:00.000Z", by: "test" },
        { from: PhaseStatus.NotStarted, to: PhaseStatus.InProgress, at: "2026-07-16T11:00:00.000Z", by: "test" },
      ],
    };
    const line = generatePhaseStatusLine(meta);
    expect(line).toBe("> 状态：进行中 | 发布日期：2026-07-16");
  });

  test("与 parseStatusLine 可逆兼容", () => {
    const meta: PhaseMeta = {
      ...basePhaseMeta,
      status: PhaseStatus.Completed,
      transitions: [
        { from: null, to: PhaseStatus.NotStarted, at: "2026-07-16T10:00:00.000Z", by: "test" },
        { from: PhaseStatus.InProgress, to: PhaseStatus.Completed, at: "2026-07-16T16:00:00.000Z", by: "test" },
      ],
    };
    const line = generatePhaseStatusLine(meta);
    const parsed = parseStatusLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.status).toBe("已完成");
    expect(parsed!.publishDate).toBe("2026-07-16");
  });
});
