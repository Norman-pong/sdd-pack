/**
 * meta-store.test.ts — meta-store.ts 单元测试
 *
 * 覆盖: 9 个核心函数 + 3 个类型 + 辅助函数
 * 每个函数 ≤80 行约束由代码审查保证,测试验证行为契约
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readPrdMeta,
  readPhaseMeta,
  writePrdMeta,
  writePhaseMeta,
  readMetaIndex,
  writeMetaIndex,
  getActivePrdMeta,
  generatePrdId,
  generatePhaseId,
  rebuildMetaFromMarkdown,
  appendTransition,
  phaseFilePath,
  listAllPrdMetas,
  listPhaseMetas,
  type PrdMeta,
  type PhaseMeta,
  type MetaIndex,
} from "../lib/meta-store";
import { PrdStatus, PhaseStatus, ArchiveReason } from "../lib/prd-state-machine";

// 测试用临时目录
const TEST_ROOT = resolve(import.meta.dir, "../../.test-tmp-meta-store");
const META_DIR = resolve(TEST_ROOT, ".sdd/meta");
const PRD_DIR = resolve(META_DIR, "prd");
const PHASE_DIR = resolve(META_DIR, "phase");
const DOCS_PRD_DIR = resolve(TEST_ROOT, "docs/prd");
const DOCS_PHASE_DIR = resolve(TEST_ROOT, "docs/phase");

function setupTestDirs(): void {
  for (const dir of [PRD_DIR, PHASE_DIR, DOCS_PRD_DIR, DOCS_PHASE_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

function cleanupTestDirs(): void {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

function makePrdMeta(overrides: Partial<PrdMeta> = {}): PrdMeta {
  return {
    id: "prd-20260716-001",
    title: "Test PRD",
    status: PrdStatus.Draft,
    transitions: [],
    phaseIds: [],
    nextPhaseSeq: 0,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    filePath: "docs/prd/2026-07-16-test.md",
    version: "1.0.0",
    ...overrides,
  };
}

function makePhaseMeta(overrides: Partial<PhaseMeta> = {}): PhaseMeta {
  return {
    id: "phs-001-001",
    parentId: "prd-20260716-001",
    title: "Test Phase",
    status: PhaseStatus.NotStarted,
    seq: 1,
    transitions: [],
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    filePath: "docs/phase/prd-20260716-001/001-test.md",
    ...overrides,
  };
}

// 由于 meta-store 使用 findRepoRoot() 定位 .sdd/meta,我们需要 mock 或改变 cwd
// 但 findRepoRoot 锚定 docs/prd/,所以测试需要真实目录结构
// 策略:在临时目录创建 docs/prd/,然后 chdir 进去

describe("meta-store", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    setupTestDirs();
    process.chdir(TEST_ROOT);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTestDirs();
  });

  // ===== 1. readPrdMeta / writePrdMeta =====
  describe("readPrdMeta / writePrdMeta", () => {
    test("round-trip: write then read returns same data", () => {
      const meta = makePrdMeta();
      writePrdMeta(meta);
      const read = readPrdMeta(meta.id);
      expect(read).not.toBeNull();
      expect(read!.id).toBe(meta.id);
      expect(read!.title).toBe(meta.title);
      expect(read!.status).toBe(meta.status);
      expect(read!.version).toBe(meta.version);
    });

    test("read non-existent returns null", () => {
      expect(readPrdMeta("prd-99999999-999")).toBeNull();
    });

    test("write updates updatedAt timestamp", () => {
      const meta = makePrdMeta({ updatedAt: "2020-01-01T00:00:00.000Z" });
      writePrdMeta(meta);
      const read = readPrdMeta(meta.id);
      expect(read!.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });

    test("writePrdMeta updates index prdIds", () => {
      const meta = makePrdMeta();
      writePrdMeta(meta);
      const idx = readMetaIndex();
      expect(idx.prdIds).toContain(meta.id);
    });

    test("writePrdMeta sets activePrdId for non-archived", () => {
      const meta = makePrdMeta({ status: PrdStatus.Draft });
      writePrdMeta(meta);
      const idx = readMetaIndex();
      expect(idx.activePrdId).toBe(meta.id);
    });

    test("writePrdMeta clears activePrdId when archiving active PRD", () => {
      const meta = makePrdMeta({ status: PrdStatus.Draft });
      writePrdMeta(meta);
      expect(readMetaIndex().activePrdId).toBe(meta.id);

      const archived = { ...meta, status: PrdStatus.Archived, archiveReason: ArchiveReason.Completed };
      writePrdMeta(archived);
      expect(readMetaIndex().activePrdId).toBeNull();
    });

    test("writePrdMeta does not clear activePrdId when archiving non-active PRD", () => {
      const meta1 = makePrdMeta({ id: "prd-20260716-001", status: PrdStatus.Draft });
      const meta2 = makePrdMeta({ id: "prd-20260716-002", status: PrdStatus.Draft });
      writePrdMeta(meta1);
      writePrdMeta(meta2);
      expect(readMetaIndex().activePrdId).toBe(meta2.id);

      const archived = { ...meta1, status: PrdStatus.Archived, archiveReason: ArchiveReason.Completed };
      writePrdMeta(archived);
      expect(readMetaIndex().activePrdId).toBe(meta2.id);
    });
  });

  // ===== 2. readPhaseMeta / writePhaseMeta =====
  describe("readPhaseMeta / writePhaseMeta", () => {
    test("round-trip: write then read returns same data", () => {
      const meta = makePhaseMeta();
      writePhaseMeta(meta);
      const read = readPhaseMeta(meta.id);
      expect(read).not.toBeNull();
      expect(read!.id).toBe(meta.id);
      expect(read!.parentId).toBe(meta.parentId);
      expect(read!.status).toBe(meta.status);
      expect(read!.seq).toBe(meta.seq);
    });

    test("read non-existent returns null", () => {
      expect(readPhaseMeta("phs-999-999")).toBeNull();
    });

    test("writePhaseMeta updates index phaseIds", () => {
      const meta = makePhaseMeta();
      writePhaseMeta(meta);
      const idx = readMetaIndex();
      expect(idx.phaseIds).toContain(meta.id);
    });
  });

  // ===== 3. readMetaIndex / writeMetaIndex =====
  describe("readMetaIndex / writeMetaIndex", () => {
    test("read empty returns default index", () => {
      const idx = readMetaIndex();
      expect(idx.activePrdId).toBeNull();
      expect(idx.prdIds).toEqual([]);
      expect(idx.phaseIds).toEqual([]);
    });

    test("round-trip: write then read returns same data", () => {
      const idx: MetaIndex = {
        activePrdId: "prd-20260716-001",
        prdIds: ["prd-20260716-001"],
        phaseIds: ["phs-001-001"],
        updatedAt: "2026-07-16T00:00:00.000Z",
      };
      writeMetaIndex(idx);
      const read = readMetaIndex();
      expect(read.activePrdId).toBe(idx.activePrdId);
      expect(read.prdIds).toEqual(idx.prdIds);
      expect(read.phaseIds).toEqual(idx.phaseIds);
    });

    test("writeMetaIndex updates updatedAt", () => {
      const idx: MetaIndex = {
        activePrdId: null,
        prdIds: [],
        phaseIds: [],
        updatedAt: "2020-01-01T00:00:00.000Z",
      };
      writeMetaIndex(idx);
      const read = readMetaIndex();
      expect(read.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });
  });

  // ===== 4. getActivePrdMeta =====
  describe("getActivePrdMeta", () => {
    test("returns null when no active PRD", () => {
      expect(getActivePrdMeta()).toBeNull();
    });

    test("returns active PRD meta when set", () => {
      const meta = makePrdMeta({ status: PrdStatus.Draft });
      writePrdMeta(meta);
      const active = getActivePrdMeta();
      expect(active).not.toBeNull();
      expect(active!.id).toBe(meta.id);
    });
  });

  // ===== 5. generatePrdId =====
  describe("generatePrdId", () => {
    test("generates prd-YYYYMMDD-001 for first PRD of the day", () => {
      const id = generatePrdId();
      expect(id).toMatch(/^prd-\d{8}-001$/);
    });

    test("increments sequence for same-day PRDs", () => {
      const meta1 = makePrdMeta({ id: generatePrdId() });
      writePrdMeta(meta1);
      const id2 = generatePrdId();
      expect(id2).toMatch(/^prd-\d{8}-002$/);
    });

    test("ignores PRDs from other days", () => {
      const oldMeta = makePrdMeta({ id: "prd-20200101-005" });
      writePrdMeta(oldMeta);
      const id = generatePrdId();
      expect(id).toMatch(/^prd-\d{8}-001$/);
    });
  });

  // ===== 6. generatePhaseId =====
  describe("generatePhaseId", () => {
    test("generates phs-<prdSeq>-001 for first phase", () => {
      const id = generatePhaseId("prd-20260716-001");
      expect(id).toBe("phs-001-001");
    });

    test("accepts numeric prdSeq", () => {
      const id = generatePhaseId(1);
      expect(id).toBe("phs-001-001");
    });

    test("increments sequence for same PRD", () => {
      const phase1 = makePhaseMeta({ id: generatePhaseId("prd-20260716-001") });
      writePhaseMeta(phase1);
      const id2 = generatePhaseId("prd-20260716-001");
      expect(id2).toBe("phs-001-002");
    });

    test("different PRDs have independent sequences", () => {
      const phase1 = makePhaseMeta({ id: generatePhaseId("prd-20260716-001") });
      writePhaseMeta(phase1);
      const id2 = generatePhaseId("prd-20260716-002");
      expect(id2).toBe("phs-002-001");
    });

    test("throws on invalid PRD id format", () => {
      expect(() => generatePhaseId("invalid-id")).toThrow(/invalid PRD id/);
    });
  });

  // ===== 7. appendTransition =====
  describe("appendTransition", () => {
    test("appends transition record to empty list", () => {
      const meta = makePrdMeta({ transitions: [] });
      const result = appendTransition(meta, PrdStatus.PendingReview, "test-user");
      expect(result.length).toBe(1);
      expect(result[0].from).toBe(PrdStatus.Draft);
      expect(result[0].to).toBe(PrdStatus.PendingReview);
      expect(result[0].by).toBe("test-user");
      expect(result[0].at).toBeDefined();
    });

    test("appends to existing transitions", () => {
      const meta = makePrdMeta({
        transitions: [{ from: null, to: PrdStatus.Draft, at: "2026-07-16T00:00:00.000Z", by: "init" }],
      });
      const result = appendTransition(meta, PrdStatus.PendingReview, "reviewer");
      expect(result.length).toBe(2);
      expect(result[1].from).toBe(PrdStatus.Draft);
      expect(result[1].to).toBe(PrdStatus.PendingReview);
    });

    test("works for PhaseMeta", () => {
      const meta = makePhaseMeta({ transitions: [] });
      const result = appendTransition(meta, PhaseStatus.InProgress, "dev");
      expect(result.length).toBe(1);
      expect(result[0].from).toBe(PhaseStatus.NotStarted);
      expect(result[0].to).toBe(PhaseStatus.InProgress);
    });
  });

  // ===== 8. phaseFilePath =====
  describe("phaseFilePath", () => {
    test("generates correct path format", () => {
      const path = phaseFilePath("prd-20260716-001", 1, "Setup Infrastructure");
      expect(path).toBe("docs/phase/prd-20260716-001/001-setup-infrastructure.md");
    });

    test("pads seq to 3 digits", () => {
      const path = phaseFilePath("prd-20260716-001", 42, "test");
      expect(path).toContain("/042-test.md");
    });

    test("sanitizes name to kebab-case", () => {
      const path = phaseFilePath("prd-20260716-001", 1, "Hello World! Foo_Bar");
      expect(path).toContain("hello-world-foo-bar");
    });
  });

  // ===== 9. listAllPrdMetas / listPhaseMetas =====
  describe("listAllPrdMetas / listPhaseMetas", () => {
    test("listAllPrdMetas returns empty when no PRDs", () => {
      expect(listAllPrdMetas()).toEqual([]);
    });

    test("listAllPrdMetas returns all written PRDs", () => {
      writePrdMeta(makePrdMeta({ id: "prd-20260716-001" }));
      writePrdMeta(makePrdMeta({ id: "prd-20260716-002" }));
      const all = listAllPrdMetas();
      expect(all.length).toBe(2);
      expect(all.map((m) => m.id)).toContain("prd-20260716-001");
      expect(all.map((m) => m.id)).toContain("prd-20260716-002");
    });

    test("listPhaseMetas filters by parentPrdId", () => {
      writePhaseMeta(makePhaseMeta({ id: "phs-001-001", parentId: "prd-20260716-001" }));
      writePhaseMeta(makePhaseMeta({ id: "phs-001-002", parentId: "prd-20260716-001" }));
      writePhaseMeta(makePhaseMeta({ id: "phs-002-001", parentId: "prd-20260716-002" }));

      const forPrd1 = listPhaseMetas("prd-20260716-001");
      expect(forPrd1.length).toBe(2);
      expect(forPrd1.every((m) => m.parentId === "prd-20260716-001")).toBe(true);

      const forPrd2 = listPhaseMetas("prd-20260716-002");
      expect(forPrd2.length).toBe(1);
    });
  });

  // ===== 10. rebuildMetaFromMarkdown =====
  describe("rebuildMetaFromMarkdown", () => {
    test("rebuilds from empty docs", () => {
      rebuildMetaFromMarkdown();
      const idx = readMetaIndex();
      expect(idx.activePrdId).toBeNull();
      expect(idx.prdIds).toEqual([]);
      expect(idx.phaseIds).toEqual([]);
    });

    test("rebuilds single PRD from markdown", () => {
      const prdContent = `# Test PRD

> 状态：草稿 | 发布日期：2026-07-16 | 版本：1.0.0

## 0. 目标声明
`;
      writeFileSync(resolve(DOCS_PRD_DIR, "2026-07-16-test.md"), prdContent);
      rebuildMetaFromMarkdown();

      const idx = readMetaIndex();
      expect(idx.prdIds.length).toBe(1);
      expect(idx.activePrdId).toBe("prd-20260716-001");

      const meta = readPrdMeta("prd-20260716-001");
      expect(meta).not.toBeNull();
      expect(meta!.title).toBe("Test PRD");
      expect(meta!.status).toBe(PrdStatus.Draft);
      expect(meta!.version).toBe("1.0.0");
    });

    test("rebuilds archived PRD with archiveReason", () => {
      const prdContent = `# Old PRD

> 状态：已归档 | 发布日期：2026-07-16 | 版本：1.0.0 | 归档原因：已完成
`;
      writeFileSync(resolve(DOCS_PRD_DIR, "2026-07-16-old.md"), prdContent);
      rebuildMetaFromMarkdown();

      // 归档 PRD 的 id 由文件名推断,总是 -001
      const meta = readPrdMeta("prd-20260716-001");
      expect(meta).not.toBeNull();
      expect(meta!.status).toBe(PrdStatus.Archived);
      expect(meta!.archiveReason).toBe(ArchiveReason.Completed);
      expect(readMetaIndex().activePrdId).toBeNull();
    });

    test("throws when multiple non-archived PRDs exist", () => {
      const prdContent = `# Test

> 状态：草稿
`;
      writeFileSync(resolve(DOCS_PRD_DIR, "2026-07-16-a.md"), prdContent);
      writeFileSync(resolve(DOCS_PRD_DIR, "2026-07-16-b.md"), prdContent);
      expect(() => rebuildMetaFromMarkdown()).toThrow(/non-archived PRD/);
    });

    test("rebuilds phase from grouped directory", () => {
      // 先创建 PRD
      const prdContent = `# Test PRD

> 状态：草稿
`;
      writeFileSync(resolve(DOCS_PRD_DIR, "2026-07-16-test.md"), prdContent);

      // 创建 phase 目录结构
      const phaseGroupDir = resolve(DOCS_PHASE_DIR, "prd-20260716-001");
      mkdirSync(phaseGroupDir, { recursive: true });
      const phaseContent = `# Test Phase

> 状态：未开始

> 对应 PRD: [Test PRD](../../prd/2026-07-16-test.md)
`;
      writeFileSync(resolve(phaseGroupDir, "001-setup.md"), phaseContent);

      rebuildMetaFromMarkdown();

      const idx = readMetaIndex();
      expect(idx.phaseIds.length).toBe(1);
      expect(idx.phaseIds[0]).toBe("phs-001-001");

      const phaseMeta = readPhaseMeta("phs-001-001");
      expect(phaseMeta).not.toBeNull();
      expect(phaseMeta!.parentId).toBe("prd-20260716-001");
      expect(phaseMeta!.status).toBe(PhaseStatus.NotStarted);
    });
  });

  // ===== 类型导出验证 =====
  describe("type exports", () => {
    test("PrdMeta has all required fields", () => {
      const meta: PrdMeta = makePrdMeta();
      expect(meta.id).toBeDefined();
      expect(meta.title).toBeDefined();
      expect(meta.status).toBeDefined();
      expect(meta.transitions).toBeDefined();
      expect(meta.phaseIds).toBeDefined();
      expect(meta.nextPhaseSeq).toBeDefined();
      expect(meta.createdAt).toBeDefined();
      expect(meta.updatedAt).toBeDefined();
      expect(meta.filePath).toBeDefined();
      expect(meta.version).toBeDefined();
    });

    test("PhaseMeta has all required fields", () => {
      const meta: PhaseMeta = makePhaseMeta();
      expect(meta.id).toBeDefined();
      expect(meta.parentId).toBeDefined();
      expect(meta.title).toBeDefined();
      expect(meta.status).toBeDefined();
      expect(meta.seq).toBeDefined();
      expect(meta.transitions).toBeDefined();
      expect(meta.createdAt).toBeDefined();
      expect(meta.updatedAt).toBeDefined();
      expect(meta.filePath).toBeDefined();
    });

    test("MetaIndex has all required fields", () => {
      const idx: MetaIndex = {
        activePrdId: null,
        prdIds: [],
        phaseIds: [],
        updatedAt: "2026-07-16T00:00:00.000Z",
      };
      expect(idx.activePrdId).toBeDefined();
      expect(idx.prdIds).toBeDefined();
      expect(idx.phaseIds).toBeDefined();
      expect(idx.updatedAt).toBeDefined();
    });

    test("TransitionRecord has all required fields", () => {
      const record = {
        from: PrdStatus.Draft,
        to: PrdStatus.PendingReview,
        at: "2026-07-16T00:00:00.000Z",
        by: "test",
      };
      expect(record.from).toBeDefined();
      expect(record.to).toBeDefined();
      expect(record.at).toBeDefined();
      expect(record.by).toBeDefined();
    });
  });
});
