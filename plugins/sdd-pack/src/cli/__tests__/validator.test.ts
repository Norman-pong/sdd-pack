/**
 * validator.test.ts — 校验器单元测试
 *
 * 测试隔离：使用临时目录 + 模拟文档
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { resolve } from "path";
import { validate, type ValidationConfig } from "../lib/validator";

const TMP_DIR = resolve("/tmp", "sdd-test-validate-" + Date.now());

function writeDoc(subdir: string, name: string, content: string): string {
  const dir = resolve(TMP_DIR, subdir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = resolve(dir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

beforeAll(() => {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  // 正常 PRD/Phase 对
  writeDoc("prd", "2026-06-29-test-prd.md", [
    "# Test PRD",
    "> 状态：已发布 | 发布日期：2026-06-29",
    "> 对应阶段：[Test Phase](../phase/2026-06-29-test-phase.md)",
    "## 0. 目标声明",
    "## 1. 背景",
    "## 3. 功能需求",
    "## 8. 验收标准",
  ].join("\n"));

  writeDoc("phase", "2026-06-29-test-phase.md", [
    "# Test Phase",
    "> 状态：已完成",
    "> 对应 PRD：[Test PRD](../prd/2026-06-29-test-prd.md)",
  ].join("\n"));

  // 堆叠状态行的 PRD
  writeDoc("prd", "2026-06-24-stacked-prd.md", [
    "# Stacked PRD",
    "> 状态:1.2.3 已发布(2026-06-25);v1.2.0 新增功能;v1.2.1 修正 bug",
    "> 对应阶段：[Test Phase](../phase/2026-06-29-test-phase.md)",
    "## 0. 目标声明",
    "## 1. 背景",
    "## 3. 功能需求",
    "## 8. 验收标准",
  ].join("\n"));

  // 缺少回引的 PRD（双向引用断裂）
  writeDoc("prd", "2026-06-28-broken-prd.md", [
    "# Broken PRD",
    "> 状态：草稿",
    "## 0. 目标声明",
    "## 1. 背景",
    "## 3. 功能需求",
    "## 8. 验收标准",
  ].join("\n"));

  // 缺少必需章节的 PRD
  writeDoc("prd", "2026-06-27-incomplete-prd.md", [
    "# Incomplete PRD",
    "> 状态：草稿",
    "> 对应阶段：[Test Phase](../phase/2026-06-29-test-phase.md)",
    "## 1. 背景",
  ].join("\n"));

  // 非法文件名
  writeDoc("prd", "Bad-Name-PRD.md", [
    "# Bad Name PRD",
    "> 状态：草稿",
    "> 对应阶段：[Test Phase](../phase/2026-06-29-test-phase.md)",
    "## 0. 目标声明",
    "## 1. 背景",
    "## 3. 功能需求",
    "## 8. 验收标准",
  ].join("\n"));

  // supersedes 链完整测试
  writeDoc("prd", "2026-06-26-old-prd.md", [
    "# Old PRD",
    "> 状态：已替换 | 发布日期：2026-06-26",
    "> 已被：[New PRD](../prd/2026-06-27-new-prd.md) 替代",
    "## 0. 目标声明",
    "## 1. 背景",
    "## 3. 功能需求",
    "## 8. 验收标准",
  ].join("\n"));

  writeDoc("prd", "2026-06-27-new-prd.md", [
    "# New PRD",
    "> 状态：已发布 | 发布日期：2026-06-27",
    "> 对应阶段：[Test Phase](../phase/2026-06-29-test-phase.md)",
    "> 替代：[Old PRD](../prd/2026-06-26-old-prd.md)",
    "## 0. 目标声明",
    "## 1. 背景",
    "## 3. 功能需求",
    "## 8. 验收标准",
  ].join("\n"));

  // 带相对链接的文件
  writeDoc("prd", "2026-06-25-links-prd.md", [
    "# Links PRD",
    "> 状态：草稿",
    "> 对应阶段：[Test Phase](../phase/2026-06-29-test-phase.md)",
    "有效链接：[Phase](../phase/2026-06-29-test-phase.md)",
    "断链：[不存在](../phase/non-existent.md)",
    "## 0. 目标声明",
    "## 1. 背景",
    "## 3. 功能需求",
    "## 8. 验收标准",
  ].join("\n"));
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function makeConfig(overrides?: Partial<ValidationConfig>): ValidationConfig {
  return {
    docsDir: TMP_DIR,
    severity: "error",
    rulesOnly: false,
    structureOnly: false,
    ...overrides,
  };
}

describe("validator — 基础校验 (#1 双向引用)", () => {
  test("正常 PRD/Phase 对通过 #1", () => {
    const result = validate(makeConfig({ files: [resolve(TMP_DIR, "prd/2026-06-29-test-prd.md")] }));
    const check1 = result.checks.find((c) => c.ruleId === 1);
    expect(check1).toBeDefined();
    expect(check1!.passed).toBe(true);
  });

  test("缺回引的 PRD 触发 #1 error", () => {
    const result = validate(makeConfig({
      files: [resolve(TMP_DIR, "prd/2026-06-28-broken-prd.md")],
    }));
    const check1 = result.checks.find((c) => c.ruleId === 1);
    expect(check1).toBeDefined();
    expect(check1!.passed).toBe(false);
    expect(check1!.severity).toBe("error");
  });
});

describe("validator — 状态行格式 (#8)", () => {
  test("堆叠状态行触发 #8 error", () => {
    const result = validate(makeConfig({
      files: [resolve(TMP_DIR, "prd/2026-06-24-stacked-prd.md")],
    }));
    const check8 = result.checks.find((c) => c.ruleId === 8);
    expect(check8).toBeDefined();
    expect(check8!.passed).toBe(false);
    expect(check8!.severity).toBe("error");
  });

  test("规范状态行通过 #8", () => {
    const result = validate(makeConfig({
      files: [resolve(TMP_DIR, "prd/2026-06-29-test-prd.md")],
    }));
    const check8 = result.checks.find((c) => c.ruleId === 8);
    expect(check8).toBeDefined();
    expect(check8!.passed).toBe(true);
  });
});

describe("validator — 必需章节 (#10)", () => {
  test("完整 PRD 通过 #10", () => {
    const result = validate(makeConfig({
      files: [resolve(TMP_DIR, "prd/2026-06-29-test-prd.md")],
    }));
    const check10 = result.checks.find((c) => c.ruleId === 10);
    expect(check10!.passed).toBe(true);
  });

  test("缺少章节触发 #10 error", () => {
    const result = validate(makeConfig({
      files: [resolve(TMP_DIR, "prd/2026-06-27-incomplete-prd.md")],
    }));
    const check10 = result.checks.find((c) => c.ruleId === 10);
    expect(check10!.passed).toBe(false);
    expect(check10!.severity).toBe("error");
  });
});

describe("validator — 命名规范 (#7)", () => {
  test("非法文件名触发 #7 warn", () => {
    const result = validate(makeConfig({
      files: [resolve(TMP_DIR, "prd/Bad-Name-PRD.md")],
    }));
    const check7 = result.checks.find((c) => c.ruleId === 7);
    expect(check7).toBeDefined();
    expect(check7!.passed).toBe(false);
    expect(check7!.severity).toBe("warn");
  });
});

describe("validator — supersedes 链 (#6)", () => {
  test("完整 supersedes 链通过 #6", () => {
    const result = validate(makeConfig({
      files: [
        resolve(TMP_DIR, "prd/2026-06-26-old-prd.md"),
        resolve(TMP_DIR, "prd/2026-06-27-new-prd.md"),
      ],
    }));
    const check6 = result.checks.find((c) => c.ruleId === 6);
    expect(check6).toBeDefined();
    expect(check6!.passed).toBe(true);
  });
});

describe("validator — severity 阈值", () => {
  test("--severity warn 时所有违规均为警告，status=warn", () => {
    const result = validate(makeConfig({
      severity: "warn",
      files: [resolve(TMP_DIR, "prd/Bad-Name-PRD.md")],
    }));
    // Bad-Name-PRD.md 缺少 #1 回引，应为 error 但 warn 阈值下降级
    expect(result.status).toBe("warn");
  });
});

describe("validator — rules-only / structure-only", () => {
  test("--rules-only 仅执行 #5（不包括 #1）", () => {
    const result = validate(makeConfig({
      rulesOnly: true,
      files: [resolve(TMP_DIR, "prd/2026-06-28-broken-prd.md")],
    }));
    const ruleIds = result.checks.map((c) => c.ruleId);
    expect(ruleIds).toEqual([5]);
  });

  test("--structure-only 不执行 #5", () => {
    const result = validate(makeConfig({
      structureOnly: true,
      files: [resolve(TMP_DIR, "prd/2026-06-29-test-prd.md")],
    }));
    const check5 = result.checks.find((c) => c.ruleId === 5);
    expect(check5).toBeUndefined();
  });
});

describe("validator — 退出码映射", () => {
  test("仅有 warn 时 status=warn", () => {
    const result = validate(makeConfig({
      severity: "warn",
      files: [resolve(TMP_DIR, "prd/Bad-Name-PRD.md")],
    }));
    expect(result.status).toBe("warn");
  });

  test("有 error 无 block 时 status=error", () => {
    const result = validate(makeConfig({
      severity: "error",
      files: [resolve(TMP_DIR, "prd/2026-06-24-stacked-prd.md")],
    }));
    expect(result.status).toBe("error");
  });
});

describe("validator — JSON 输出完整性", () => {
  test("输出含 status/errors/warnings/checks 字段", () => {
    const result = validate(makeConfig({
      files: [resolve(TMP_DIR, "prd/2026-06-29-test-prd.md")],
    }));
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("warnings");
    expect(result).toHaveProperty("checks");
    expect(Array.isArray(result.checks)).toBe(true);
  });
});
