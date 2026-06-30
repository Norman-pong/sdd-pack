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
} from "../lib/doc-parser";

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
