/**
 * api.test.ts — api.ts 8 个函数单元测试
 * 覆盖: validateDocs / proposePrd / archivePrd / migratePrd /
 *       getStatus / listPrds / getWhy / getApplyChecklist
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { resolve, resolve as pathResolve } from "path";

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
  planPrd,
  startPrd,
  archivePrdV2,
  phaseTransition,
  getStatusPanel,
  syncMeta,
  rebuildMeta,
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
    // sdd-pack PRD 已归档至 archive/, listMdFiles 不扫 archive/
    // 改用当前活跃 PRD 的关键词
    const r = await listPrds({ keyword: "归档" });
    expect(r.items.length).toBeGreaterThan(0);
    for (const item of r.items) {
      const kw = "归档";
      const hit =
        item.title.toLowerCase().includes(kw) ||
        item.fileName.toLowerCase().includes(kw);
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

import {
  readPrdMeta,
  readMetaIndex,
  writePrdMeta,
  writeMetaIndex,
  readPhaseMeta,
  writePhaseMeta,
  listPhaseMetas,
  type PrdMeta,
  type PhaseMeta,
} from "../lib/meta-store";
import { PrdStatus, PhaseStatus, ArchiveReason } from "../lib/prd-state-machine";
import { findRepoRoot } from "../lib/path";

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


// ===== Phase 002: planPrd / startPrd / archivePrdV2 / phaseTransition / getStatusPanel 集成测试 =====

describe("Phase 002 流转集成测试", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    setupFlowDirs();
    process.chdir(FLOW_TEST_ROOT);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupFlowDirs();
  });

  test("planPrd Reviewed→Planned 并创建 Phase 文件", async () => {
    // init + review + approve
    const initR = await initPrd({ title: "Plan Test" });
    await reviewPrd();
    await approvePrd({});
    // plan
    const r = await planPrd({ phase: "Foundation" });
    expect(r.status).toBe("pass");
    expect(r.from).toBe(PrdStatus.Reviewed);
    expect(r.to).toBe(PrdStatus.Planned);
    expect(r.phaseId).toBeDefined();
    expect(r.phasePath).toBeDefined();
    // 验证 Phase 文件存在
    expect(existsSync(r.phasePath!)).toBe(true);
    // 验证 Phase meta
    const phaseMeta = readPhaseMeta(r.phaseId!);
    expect(phaseMeta).not.toBeNull();
    expect(phaseMeta!.parentId).toBe(initR.prdId!);
    expect(phaseMeta!.status).toBe(PhaseStatus.NotStarted);
    // 验证 PRD meta
    const prdMeta = readPrdMeta(initR.prdId!);
    expect(prdMeta!.status).toBe(PrdStatus.Planned);
    expect(prdMeta!.phaseIds).toContain(r.phaseId!);
    expect(prdMeta!.nextPhaseSeq).toBe(2);
  });

  test("planPrd 回填 PRD markdown: TBD 占位 → 单一链接", async () => {
    const initR = await initPrd({ title: "TBD Fill Test" });
    await reviewPrd();
    await approvePrd({});
    const r = await planPrd({ phase: "Foundation" });
    expect(r.status).toBe("pass");
    // 验证 PRD markdown 顶部 对应阶段 行
    const prdAbs = resolve(findRepoRoot(), initR.path!);
    const prdContent = readFileSync(prdAbs, "utf-8");
    const phaseLine = prdContent.match(/^>\s*对应阶段[：:].*$/m)?.[0] ?? "";
    expect(phaseLine).not.toMatch(/TBD/);
    expect(phaseLine).not.toMatch(/\[.*\[/); // 双 [
    const linkMatches = phaseLine.match(/\[[^\]]+\]\([^)]+\)/g) ?? [];
    expect(linkMatches.length).toBe(1); // 恰好一个 markdown 链接
  });

  test("planPrd 回填 PRD markdown: 已有链接 → 追加且去重", async () => {
    const initR = await initPrd({ title: "Append Fill Test" });
    await reviewPrd();
    await approvePrd({});
    // 第一次 plan → 产生 001-foundation.md
    await planPrd({ phase: "Phase Alpha" });
    const prdAbs = resolve(findRepoRoot(), initR.path!);
    const prdContent1 = readFileSync(prdAbs, "utf-8");
    const line1 = prdContent1.match(/^>\s*对应阶段[：:].*$/m)?.[0] ?? "";
    const linkCount1 = (line1.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length;
    expect(linkCount1).toBe(1);
  });

  test("planPrd 回填 PRD markdown: 老格式占位链接 → 整段替换为新链接", async () => {
    // sw-nvr 真实场景: PRD 第 5 行已被手动转为 `[TBD - 待 sdd-phase 补全](../phase/...)` 链接占位
    const initR = await initPrd({ title: "Legacy Link Placeholder" });
    const prdAbs = resolve(findRepoRoot(), initR.path!);
    const original = readFileSync(prdAbs, "utf-8");
    const withLegacyPlaceholder = original.replace(
      /^>\s*对应阶段[：:].*$/m,
      "> 对应阶段：[TBD - 待 sdd-phase 补全](../phase/legacy.md)",
    );
    writeFileSync(prdAbs, withLegacyPlaceholder, "utf-8");
    await reviewPrd();
    await approvePrd({});
    const r = await planPrd({ phase: "Foundation" });
    expect(r.status).toBe("pass");
    const updated = readFileSync(prdAbs, "utf-8");
    const phaseLine = updated.match(/^>\s*对应阶段[：:].*$/m)?.[0] ?? "";
    expect(phaseLine).not.toMatch(/TBD/);
    expect(phaseLine).not.toMatch(/\[.*\[/);
    const linkMatches = phaseLine.match(/\[[^\]]+\]\([^)]+\)/g) ?? [];
    expect(linkMatches.length).toBe(1);
  });

  test("planPrd --link 关联已有 Phase", async () => {
    // init + review + approve
    const initR = await initPrd({ title: "Link Test" });
    await reviewPrd();
    await approvePrd({});
    // 先创建一个 Phase
    const planR1 = await planPrd({ phase: "Phase One" });
    expect(planR1.status).toBe("pass");
    // plan 后状态是 Planned,不能再次 plan(测试状态机校验)
    const r = await planPrd({ link: planR1.phaseId! });
    expect(r.status).toBe("error");
    expect(r.errors[0]).toMatch(/仅 Reviewed 可执行/);
  });
  test("startPrd Planned→InProgress", async () => {
    // init + review + approve + plan
    const initR = await initPrd({ title: "Start Test" });
    await reviewPrd();
    await approvePrd({});
    await planPrd({ phase: "Foundation" });
    // start(Phase 还是 NotStarted,会 warn)
    const r = await startPrd();
    expect(r.status).toBe("warn");
    expect(r.from).toBe(PrdStatus.Planned);
    expect(r.to).toBe(PrdStatus.InProgress);
    const meta = readPrdMeta(initR.prdId!);
    expect(meta!.status).toBe(PrdStatus.InProgress);
  });

  test("startPrd 无 InProgress Phase 时 warn", async () => {
    // init + review + approve + plan
    const initR = await initPrd({ title: "Start Warn Test" });
    await reviewPrd();
    await approvePrd({});
    await planPrd({ phase: "Foundation" });
    // start(Phase 还是 NotStarted)
    const r = await startPrd();
    expect(r.status).toBe("warn");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/NotStarted/);
  });

  test("archivePrdV2 --reason abandoned 无门禁直接归档", async () => {
    // init + review + approve + plan + start
    const initR = await initPrd({ title: "Archive Abandon Test" });
    await reviewPrd();
    await approvePrd({});
    await planPrd({ phase: "Foundation" });
    await startPrd();
    // archive abandoned
    const r = await archivePrdV2({ reason: "abandoned" });
    expect(r.status).toBe("pass");
    expect(r.from).toBe(PrdStatus.InProgress);
    expect(r.to).toBe(PrdStatus.Archived);
    const meta = readPrdMeta(initR.prdId!);
    expect(meta!.archiveReason).toBe(ArchiveReason.Abandoned);
    // 验证 activePrdId 被清空
    const idx = readMetaIndex();
    expect(idx.activePrdId).toBeNull();
  });

  test("archivePrdV2 --reason completed 门禁失败时 block", async () => {
    // init + review + approve + plan + start
    const initR = await initPrd({ title: "Archive Gate Test" });
    await reviewPrd();
    await approvePrd({});
    await planPrd({ phase: "Foundation" });
    await startPrd();
    // archive completed(无 lint/test/review 配置,会 block)
    const r = await archivePrdV2({ reason: "completed" });
    expect(r.status).toBe("error");
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test("phaseTransition start NotStarted→InProgress", async () => {
    // init + review + approve + plan
    const initR = await initPrd({ title: "Phase Start Test" });
    await reviewPrd();
    await approvePrd({});
    const planR = await planPrd({ phase: "Foundation" });
    // phase start
    const r = await phaseTransition({ action: "start", id: planR.phaseId! });
    expect(r.status).toBe("pass");
    expect(r.from).toBe(PhaseStatus.NotStarted);
    expect(r.to).toBe(PhaseStatus.InProgress);
    const phaseMeta = readPhaseMeta(planR.phaseId!);
    expect(phaseMeta!.status).toBe(PhaseStatus.InProgress);
  });

  test("phaseTransition complete InProgress→Completed", async () => {
    // init + review + approve + plan + phase start
    const initR = await initPrd({ title: "Phase Complete Test" });
    await reviewPrd();
    await approvePrd({});
    const planR = await planPrd({ phase: "Foundation" });
    await phaseTransition({ action: "start", id: planR.phaseId! });
    // phase complete(无 lint/test 配置,lint 会 block)
    const r = await phaseTransition({ action: "complete", id: planR.phaseId! });
    // lint 未配置时会 block,所以这里预期 error
    expect(r.status).toBe("error");
  });

  test("phaseTransition abandon NotStarted→Abandoned", async () => {
    // init + review + approve + plan
    const initR = await initPrd({ title: "Phase Abandon Test" });
    await reviewPrd();
    await approvePrd({});
    const planR = await planPrd({ phase: "Foundation" });
    // phase abandon
    const r = await phaseTransition({ action: "abandon", id: planR.phaseId! });
    expect(r.status).toBe("pass");
    expect(r.from).toBe(PhaseStatus.NotStarted);
    expect(r.to).toBe(PhaseStatus.Abandoned);
    const phaseMeta = readPhaseMeta(planR.phaseId!);
    expect(phaseMeta!.status).toBe(PhaseStatus.Abandoned);
  });

  test("getStatusPanel 返回活跃 PRD + Phase 状态", async () => {
    // init + review + approve + plan
    const initR = await initPrd({ title: "Status Panel Test" });
    await reviewPrd();
    await approvePrd({});
    await planPrd({ phase: "Foundation" });
    // status panel
    const r = await getStatusPanel();
    expect(r.status).toBe("pass");
    expect(r.prdId).toBe(initR.prdId);
    expect(r.title).toBe("Status Panel Test");
    expect(r.prdStatus).toBe(PrdStatus.Planned);
    expect(r.phaseCount).toBe(1);
    expect(r.phases!.length).toBe(1);
    expect(r.phases![0].status).toBe(PhaseStatus.NotStarted);
    expect(r.availableActions).toContain("/sdd start");
  });

  test("getStatusPanel 无活跃 PRD 时 error", async () => {
    const r = await getStatusPanel();
    expect(r.status).toBe("error");
    expect(r.errors[0]).toMatch(/无活跃 PRD/);
  });
});

// ===== syncMeta / rebuildMeta =====
describe("syncMeta / rebuildMeta", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    setupFlowDirs();
    process.chdir(FLOW_TEST_ROOT);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupFlowDirs();
  });

  test("syncMeta 无 meta.json 时自动重建并报告 rebuiltCount", async () => {
    // 创建 markdown 但不创建 meta.json
    writeFileSync(
      pathResolve(FLOW_DOCS_PRD, "2026-07-16-sync-test.md"),
      "# Sync Test PRD\n\n> 状态：草稿\n",
    );
    const r = await syncMeta({});
    expect(r.status).toBe("pass");
    expect(r.rebuiltCount).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.includes("meta.json 缺失"))).toBe(true);
  });

  test("syncMeta 检测 meta 与 markdown 状态不一致", async () => {
    // 创建 markdown 状态=草稿,meta 状态=PendingReview
    const filePath = pathResolve(FLOW_DOCS_PRD, "2026-07-16-mismatch.md");
    writeFileSync(filePath, "# Mismatch PRD\n\n> 状态：草稿\n");
    const meta = makeFlowPrdMeta({
      id: "prd-20260716-001",
      status: PrdStatus.PendingReview,
      filePath: "docs/prd/2026-07-16-mismatch.md",
    });
    writePrdMeta(meta);
    writeMetaIndex({
      activePrdId: "prd-20260716-001",
      prdIds: ["prd-20260716-001"],
      phaseIds: [],
      updatedAt: new Date().toISOString(),
    });
    const r = await syncMeta({});
    expect(r.status).toBe("warn");
    expect(r.mismatches.length).toBe(1);
    expect(r.mismatches[0].kind).toBe("prd");
    expect(r.mismatches[0].metaStatus).toBe(PrdStatus.PendingReview);
    expect(r.mismatches[0].markdownStatus).toBe("草稿");
  });

  test("syncMeta --fix 用 meta.json 覆盖 markdown 状态行", async () => {
    const filePath = pathResolve(FLOW_DOCS_PRD, "2026-07-16-fix.md");
    writeFileSync(filePath, "# Fix PRD\n\n> 状态：草稿\n");
    const meta = makeFlowPrdMeta({
      id: "prd-20260716-001",
      status: PrdStatus.PendingReview,
      filePath: "docs/prd/2026-07-16-fix.md",
    });
    writePrdMeta(meta);
    writeMetaIndex({
      activePrdId: "prd-20260716-001",
      prdIds: ["prd-20260716-001"],
      phaseIds: [],
      updatedAt: new Date().toISOString(),
    });
    const r = await syncMeta({ fix: true });
    expect(r.status).toBe("pass");
    expect(r.fixedCount).toBe(1);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("待评审");
  });

  test("rebuildMeta 从 markdown 重建 meta.json", async () => {
    writeFileSync(
      pathResolve(FLOW_DOCS_PRD, "2026-07-16-rebuild.md"),
      "# Rebuild PRD\n\n> 状态：进行中\n",
    );
    const r = await rebuildMeta();
    expect(r.status).toBe("pass");
    expect(r.prdCount).toBe(1);
    const idx = readMetaIndex();
    expect(idx.prdIds.length).toBe(1);
    expect(idx.activePrdId).toBe("prd-20260716-001");
  });
});