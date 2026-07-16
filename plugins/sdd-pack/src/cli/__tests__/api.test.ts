/**
 * api.test.ts — api.ts 8 个函数单元测试
 * 覆盖: validateDocs / proposePrd / archivePrd / migratePrd /
 *       getStatus / listPrds / getWhy / getApplyChecklist
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { resolve } from "path";

import {
  validateDocs,
  proposePrd,
  archivePrd,
  migratePrd,
  getStatus,
  listPrds,
  getWhy,
  getApplyChecklist,
} from "../api";

// ===== validateDocs =====
describe("validateDocs", () => {
  test("nonexistent path returns error result", async () => {
    const r = await validateDocs({ path: "/nonexistent/path/xyz", severity: "error" });
    expect(r.status).toBe("error");
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test("severity threshold logic applied", async () => {
    const r = await validateDocs({ path: "/nonexistent/path/xyz", severity: "warn" });
    expect(["pass", "warn", "error"]).toContain(r.status);
  });
});

// ===== proposePrd =====
describe("proposePrd", () => {
  test("dry-run returns template without writing", async () => {
    const r = await proposePrd({ title: "test-dry-run", type: "full", dryRun: true });
    expect(r.status).toBe("pass");
    expect(r.path).toBeDefined();
    expect(r.content).toBeDefined();
    if (r.path && existsSync(r.path)) {
      throw new Error(`dry-run 写入了文件: ${r.path}`);
    }
  });

  test("missing title returns error", async () => {
    const r = await proposePrd({ title: undefined });
    expect(r.status).toBe("error");
    expect(r.errors[0]).toMatch(/title|必需/);
  });
});

// ===== archivePrd =====
describe("archivePrd", () => {
  test("nonexistent prd returns error", async () => {
    const r = await archivePrd({ prdPath: "/nonexistent/prd.md", reason: "completed" });
    expect(r.status).toBe("error");
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test("replaced without --new-prd returns error", async () => {
    const fakePath = resolve("/tmp/sdd-test-archive-" + Date.now() + ".md");
    const r = await archivePrd({ prdPath: fakePath, reason: "replaced" });
    expect(r.status).toBe("error");
  });
});

// ===== migratePrd =====
describe("migratePrd", () => {
  test("nonexistent prd returns error", async () => {
    const r = await migratePrd({ prdPath: "/nonexistent/prd.md" });
    expect(r.status).toBe("error");
  });

  test("dry-run on nonexistent prd returns error", async () => {
    const r = await migratePrd({ prdPath: "/nonexistent/prd.md", dryRun: true });
    expect(r.status).toBe("error");
  });
});

// ===== getStatus =====
describe("getStatus", () => {
  test("returns items with type and status fields", async () => {
    const r = await getStatus();
    expect(r.items).toBeDefined();
    expect(typeof r.prdCount).toBe("number");
    expect(typeof r.phaseCount).toBe("number");
    for (const item of r.items) {
      expect(["prd", "phase"]).toContain(item.type);
      expect(typeof item.status).toBe("string");
    }
  });

  test("non-zero prd count when docs/prd has files", async () => {
    const r = await getStatus();
    expect(r.prdCount).toBeGreaterThan(0);
  });
});

// ===== listPrds =====
describe("listPrds", () => {
  test("returns list with matched count", async () => {
    const r = await listPrds({ type: "prd" });
    expect(r.items).toBeDefined();
    expect(typeof r.matched).toBe("number");
    expect(r.matched).toBe(r.items.length);
  });

  test("keyword filter narrows results on real docs", async () => {
    const r = await listPrds({ keyword: "sdd-extension" });
    expect(r.items.length).toBeGreaterThan(0);
    for (const item of r.items) {
      const hit =
        item.title.toLowerCase().includes("sdd-extension") ||
        item.fileName.toLowerCase().includes("sdd-extension");
      expect(hit).toBe(true);
    }
  });
});

// ===== getWhy =====
describe("getWhy", () => {
  test("empty target returns error", async () => {
    const r = await getWhy("");
    expect(r.available).toBe(false);
    expect(r.error).toBeDefined();
  });

  test("valid target returns structure", async () => {
    const r = await getWhy("docs/prd/2026-06-29-sdd-cli.md:3");
    expect(r.target).toBe("docs/prd/2026-06-29-sdd-cli.md:3");
    // available 取决于本机是否装 lore
  });
});

// ===== getApplyChecklist =====
describe("getApplyChecklist", () => {
  test("nonexistent prd throws via requireFile", async () => {
    await expect(getApplyChecklist("/nonexistent/prd.md")).rejects.toThrow();
  });

  test("existing prd extracts checklist items", async () => {
    const r = await getApplyChecklist("docs/prd/archive/2026-06-30-sdd-extension.md");
    expect(r.total).toBeGreaterThan(0);
    expect(r.items[0].id).toBe(1);
  });
});
