/**
 * template-engine.test.ts — 模板引擎单元测试
 */

import { describe, expect, test } from "bun:test";
import { generateTemplate } from "../lib/template-engine";

describe("generateTemplate", () => {
  test("full 模板含 11 节基础结构", () => {
    const result = generateTemplate({
      type: "full",
      title: "New Feature",
      date: "2026-07-01",
    });

    expect(result.content).toContain("# New Feature PRD");
    expect(result.content).toContain("## 1. 背景与目标");
    expect(result.content).toContain("## 3. 功能需求");
    expect(result.content).toContain("## 8. 验收标准");
    expect(result.content).toContain("## 10. 风险与约束");
    expect(result.content).toContain("## 11. 附录");
    expect(result.fileName).toBe("2026-07-01-new-feature.md");
  });

  test("full 模板 header 含 > 状态：草稿", () => {
    const result = generateTemplate({
      type: "full",
      title: "Test",
      date: "2026-07-01",
    });
    expect(result.content).toContain("> 状态：草稿");
  });

  test("full 模板含 Δ 变更摘要段", () => {
    const result = generateTemplate({
      type: "full",
      title: "Test",
      date: "2026-07-01",
    });
    expect(result.content).toContain("## Δ 变更摘要");
    expect(result.content).toContain("### ADDED");
    expect(result.content).toContain("### MODIFIED");
    expect(result.content).toContain("### REMOVED");
  });

  test("delta 模板仅含 Δ 段 + header", () => {
    const result = generateTemplate({
      type: "delta",
      title: "Delta Change",
      date: "2026-07-01",
      supersedes: "../prd/2026-06-24-old.md",
      supersedesTitle: "Old PRD",
    });

    expect(result.content).toContain("> 替代：[Old PRD](../prd/2026-06-24-old.md)");
    expect(result.content).toContain("## Δ 变更摘要");
    expect(result.content).toContain("### ADDED");
    expect(result.content).toContain("### MODIFIED");
    expect(result.content).toContain("### REMOVED");
    expect(result.content).toContain("## 8. 验收标准");
    // delta 模板不应该包含完整 11 节
    expect(result.content).not.toContain("## 10. 风险与约束");
  });

  test("--supersedes 时文件含 > 替代: 行", () => {
    const result = generateTemplate({
      type: "full",
      title: "Superseding PRD",
      date: "2026-07-01",
      supersedes: "../prd/2026-06-24-old.md",
      supersedesTitle: "Old PRD",
    });

    expect(result.content).toContain("> 替代：[Old PRD](../prd/2026-06-24-old.md)");
  });

  test("文件名生成正确", () => {
    const result = generateTemplate({
      type: "full",
      title: "sdd CLI",
      date: "2026-06-29",
    });
    expect(result.fileName).toBe("2026-06-29-sdd-cli.md");
  });

  test("中文标题无 slug 时生成空 slug（ADR-019 §3.2.3: 去中文，需手工 slug）", () => {
    const result = generateTemplate({
      type: "full",
      title: "新功能",
      date: "2026-07-01",
    });
    expect(result.fileName).toBe("2026-07-01-.md");
  });

  test("中文标题传 slug override 生成合法文件名（ADR-019 §3.2.3）", () => {
    const result = generateTemplate({
      type: "full",
      title: "新功能",
      date: "2026-07-01",
      slug: "new-feature",
    });
    expect(result.fileName).toBe("2026-07-01-new-feature.md");
  });
});
