/**
 * api.test.ts — api.ts 8 个函数单元测试
 * 覆盖: validateDocs / proposePrd / archivePrd / migratePrd /
 *       getStatus / listPrds / getWhy / getApplyChecklist
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
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
  archivePhase,
  initPrd,
  reviewPrd,
  approvePrd,
  backPrd,
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
    const r = await listPrds({ keyword: "sdd-pack" });
    expect(r.items.length).toBeGreaterThan(0);
    for (const item of r.items) {
      const hit =
        item.title.toLowerCase().includes("sdd-pack") ||
        item.fileName.toLowerCase().includes("sdd-pack");
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
    const r = await getWhy("docs/prd/archive/2026-06-29-sdd-cli.md:3");
    expect(r.target).toBe("docs/prd/archive/2026-06-29-sdd-cli.md:3");
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

// ===== archivePhase =====
describe("archivePhase", () => {
  test("nonexistent phase returns error", async () => {
    const r = await archivePhase({ phasePath: "/nonexistent/phase.md", reason: "completed" });
    expect(r.status).toBe("error");
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test("dry-run on nonexistent phase returns error", async () => {
    const r = await archivePhase({ phasePath: "/nonexistent/phase.md", reason: "completed", dryRun: true });
    expect(r.status).toBe("error");
  });

  test("dry-run on existing phase succeeds with noCommit", async () => {
    const r = await archivePhase({
      phasePath: "docs/phase/archive/2026-06-24-sdd-pack.md",
      reason: "completed",
      dryRun: true,
      noCommit: true,
    });
    expect(r.status).toBe("pass");
    expect(r.operations.length).toBeGreaterThan(0);
  });
});

// ===== initPrd / reviewPrd / approvePrd / backPrd 集成测试 =====
// 使用临时目录 + chdir 模拟真实仓库,验证完整流转

import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import {
  readPrdMeta,
  readMetaIndex,
  writePrdMeta,
  writeMetaIndex,
  type PrdMeta,
} from "../lib/meta-store";
import { PrdStatus } from "../lib/prd-state-machine";

const FLOW_TEST_ROOT = pathResolve(import.meta.dir, "../../.test-tmp-api-flow");
const FLOW_DOCS_PRD = pathResolve(FLOW_TEST_ROOT, "docs/prd");
const FLOW_DOCS_PHASE = pathResolve(FLOW_TEST_ROOT, "docs/phase");
const FLOW_META_PRD = pathResolve(FLOW_TEST_ROOT, ".sdd/meta/prd");
const FLOW_META_PHASE = pathResolve(FLOW_TEST_ROOT, ".sdd/meta/phase");

function setupFlowDirs(): void {
  for (const dir of [FLOW_DOCS_PRD, FLOW_DOCS_PHASE, FLOW_META_PRD, FLOW_META_PHASE]) {
    mkdirSync(dir, { recursive: true });
  }
  // 最小合法 docs/index.md(满足 validator Check #3)
  writeFileSync(
    pathResolve(FLOW_TEST_ROOT, "docs/index.md"),
    `# 项目文档索引

## 产品需求文档（PRD）

| 日期 | 文档名称 | 状态 | 对应 Phase | 说明 |
| ---- | -------- | ---- | ---------- | ---- |

## 阶段文档（Phase）

| 日期 | 阶段名称 | 状态 | 对应 PRD | 说明 |
| ---- | -------- | ---- | -------- | ---- |
`,
  );
}

function cleanupFlowDirs(): void {
  if (existsSync(FLOW_TEST_ROOT)) {
    rmSync(FLOW_TEST_ROOT, { recursive: true, force: true });
  }
}

function makeFlowPrdMeta(overrides: Partial<PrdMeta> = {}): PrdMeta {
  return {
    id: "prd-20260716-001",
    title: "Flow Test PRD",
    status: PrdStatus.Draft,
    transitions: [],
    phaseIds: [],
    nextPhaseSeq: 1,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    filePath: "docs/prd/2026-07-16-flow-test.md",
    version: "1.0.0",
    ...overrides,
  };
}

describe("PRD 流转集成测试", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    setupFlowDirs();
    process.chdir(FLOW_TEST_ROOT);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupFlowDirs();
  });

  test("initPrd 创建 markdown + meta.json + index.json", async () => {
    const r = await initPrd({ title: "Flow Test" });
    expect(r.status).toBe("pass");
    expect(r.prdId).toBeDefined();
    expect(r.path).toBeDefined();
    // 验证 markdown 文件存在
    expect(existsSync(r.path!)).toBe(true);
    // 验证 meta.json
    const meta = readPrdMeta(r.prdId!);
    expect(meta).not.toBeNull();
    expect(meta!.status).toBe(PrdStatus.Draft);
    expect(meta!.title).toBe("Flow Test");
    // 验证 index.json
    const idx = readMetaIndex();
    expect(idx.activePrdId).toBe(r.prdId!);
    expect(idx.prdIds).toContain(r.prdId!);
  });

  test("initPrd 有活跃 PRD 时 block", async () => {
    // 先创建一个活跃 PRD
    writePrdMeta(makeFlowPrdMeta());
    writeMetaIndex({
      activePrdId: "prd-20260716-001",
      prdIds: ["prd-20260716-001"],
      phaseIds: [],
      updatedAt: new Date().toISOString(),
    });
    const r = await initPrd({ title: "Should Block" });
    expect(r.status).toBe("error");
    expect(r.errors[0]).toMatch(/已有活跃 PRD/);
  });

  test("initPrd --force 覆盖空草稿", async () => {
    // 创建空草稿(Draft + transitions 为空)
    writePrdMeta(makeFlowPrdMeta());
    writeMetaIndex({
      activePrdId: "prd-20260716-001",
      prdIds: ["prd-20260716-001"],
      phaseIds: [],
      updatedAt: new Date().toISOString(),
    });
    // 创建对应 markdown
    writeFileSync(
      pathResolve(FLOW_DOCS_PRD, "2026-07-16-flow-test.md"),
      "# Flow Test PRD\n\n> 状态：草稿\n",
    );
    const r = await initPrd({ title: "Force Overwrite", force: true });
    expect(r.status).toBe("pass");
    expect(r.prdId).toBe("prd-20260716-001"); // 复用原 ID
  });

  test("reviewPrd Draft→PendingReview 并更新 meta + index", async () => {
    // 先 init
    const initR = await initPrd({ title: "Review Test" });
    expect(initR.status).toBe("pass");
    // 再 review
    const r = await reviewPrd();
    expect(["pass", "warn"]).toContain(r.status);
    expect(r.from).toBe(PrdStatus.Draft);
    expect(r.to).toBe(PrdStatus.PendingReview);
    // 验证 meta 状态
    const meta = readPrdMeta(initR.prdId!);
    expect(meta!.status).toBe(PrdStatus.PendingReview);
    expect(meta!.transitions.length).toBe(1);
    expect(meta!.transitions[0].to).toBe(PrdStatus.PendingReview);
  });

  test("approvePrd PendingReview→Reviewed", async () => {
    // init + review
    const initR = await initPrd({ title: "Approve Test" });
    await reviewPrd();
    const r = await approvePrd({});
    expect(r.status).toBe("pass");
    expect(r.from).toBe(PrdStatus.PendingReview);
    expect(r.to).toBe(PrdStatus.Reviewed);
    const meta = readPrdMeta(initR.prdId!);
    expect(meta!.status).toBe(PrdStatus.Reviewed);
  });

  test("backPrd PendingReview→Draft 合法回退", async () => {
    // init + review
    const initR = await initPrd({ title: "Back Test" });
    await reviewPrd();
    const r = await backPrd({ to: "draft" });
    expect(r.status).toBe("pass");
    expect(r.from).toBe(PrdStatus.PendingReview);
    expect(r.to).toBe(PrdStatus.Draft);
    const meta = readPrdMeta(initR.prdId!);
    expect(meta!.status).toBe(PrdStatus.Draft);
  });

  test("backPrd Reviewed→PendingReview 非法回退被 block", async () => {
    // init + review + approve
    const initR = await initPrd({ title: "Illegal Back Test" });
    await reviewPrd();
    await approvePrd({});
    const r = await backPrd({ to: "pending" });
    expect(r.status).toBe("error");
    expect(r.errors[0]).toMatch(/非法回退/);
  });
});
