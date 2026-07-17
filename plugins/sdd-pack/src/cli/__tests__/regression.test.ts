/**
 * regression.test.ts — 全面评审发现的缺陷回归测试
 *
 * 覆盖:
 * 1. validator 递归扫描嵌套 Phase(docs/phase/<prd-id>/*.md)
 * 2. stagedFiles 子目录 cwd 下解析到仓库根 docs 路径
 * 3. planPrd 生成嵌套 Phase 路径 + PRD/Phase 双向相对链接
 * 4. archivePrdV2 --reason completed 成功后 meta.filePath / 文件位置 / index / syncMeta 一致
 * 5. generatePhaseId 全局唯一(不依赖 PRD seq 前缀)
 *
 * 运行: bun test src/cli/__tests__/regression.test.ts
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { validate, type ValidationConfig } from "../lib/validator";
import { stagedFiles } from "../lib/orchestration/git";
import { writeReviewArtifact } from "../lib/gate-runner";
import { rewriteLinksForMove } from "../lib/orchestration/doc-links";
import {
  initPrd,
  reviewPrd,
  approvePrd,
  planPrd,
  archivePrdV2,
  phaseTransition,
  syncMeta,
} from "../api";
import {
  readPrdMeta,
  writePrdMeta,
  readMetaIndex,
  generatePhaseId,
  writePhaseMeta,
  rebuildMetaFromMarkdown,
  type PhaseMeta,
} from "../lib/meta-store";
import { PrdStatus, PhaseStatus } from "../lib/prd-state-machine";

function mkTmp(prefix: string): string {
  const p = resolve(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(p, { recursive: true });
  return realpathSync(p);
}

// ===== 1. validator 递归扫描嵌套 Phase =====

describe("validator 递归扫描嵌套 Phase", () => {
  let TMP = "";
  let docsDir = "";

  beforeEach(() => {
    TMP = mkTmp("sdd-test-recursive");
    docsDir = resolve(TMP, "docs");
    const prdDir = resolve(docsDir, "prd");
    mkdirSync(prdDir, { recursive: true });
    writeFileSync(
      resolve(prdDir, "2026-07-17-recursive-prd.md"),
      [
        "# Recursive PRD",
        "> 状态：已发布 | 发布日期：2026-07-17",
        "> 对应阶段：[Nested Phase](../phase/prd-20260717-001/001-nested-phase.md)",
        "## 0. 目标声明",
        "## 1. 背景",
        "## 3. 功能需求",
        "## 8. 验收标准",
      ].join("\n"),
    );
    const nestedDir = resolve(docsDir, "phase", "prd-20260717-001");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      resolve(nestedDir, "001-nested-phase.md"),
      [
        "# Nested Phase",
        "> 状态：已完成",
        "> 对应 PRD：[Recursive PRD](../../prd/2026-07-17-recursive-prd.md)",
      ].join("\n"),
    );
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  function runValidate() {
    const config: ValidationConfig = {
      docsDir,
      severity: "error",
      rulesOnly: false,
      structureOnly: false,
    };
    return validate(config);
  }

  test("嵌套 Phase 被 Check #1 双向引用覆盖", () => {
    const result = runValidate();
    const check1 = result.checks.find((c) => c.ruleId === 1);
    expect(check1).toBeDefined();
    expect(check1!.passed).toBe(true);
  });

  test("嵌套 Phase 被收集进 phases 列表(状态行检查覆盖)", () => {
    const nestedFile = resolve(docsDir, "phase", "prd-20260717-001", "001-nested-phase.md");
    writeFileSync(
      nestedFile,
      [
        "# Nested Phase",
        "> 状态：非法状态XYZ",
        "> 对应 PRD：[P](../../prd/2026-07-17-recursive-prd.md)",
      ].join("\n"),
    );
    const r2 = runValidate();
    const text = [...r2.errors, ...r2.warnings].join("\n");
    expect(text).toMatch(/001-nested-phase|非法状态|状态/);
  });
});

// ===== 2. stagedFiles 子目录 cwd =====

describe("stagedFiles 子目录 cwd", () => {
  let TMP = "";
  const originalCwd = process.cwd();

  beforeEach(() => {
    TMP = mkTmp("sdd-test-staged");
    mkdirSync(resolve(TMP, "docs", "prd"), { recursive: true });
    mkdirSync(resolve(TMP, "sub", "dir"), { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: TMP });
    spawnSync("git", ["config", "user.email", "t@t.com"], { cwd: TMP });
    spawnSync("git", ["config", "user.name", "t"], { cwd: TMP });
    writeFileSync(resolve(TMP, "docs", "prd", "a.md"), "# A\n");
    writeFileSync(resolve(TMP, "src.txt"), "x");
    spawnSync("git", ["add", "docs/prd/a.md", "src.txt"], { cwd: TMP });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(TMP, { recursive: true, force: true });
  });

  test("从嵌套子目录 cwd 仍解析到仓库根 docs 绝对路径", () => {
    process.chdir(resolve(TMP, "sub", "dir"));
    const files = stagedFiles();
    expect(files.length).toBe(1);
    expect(files[0]).toBe(resolve(TMP, "docs", "prd", "a.md"));
  });
});

// ===== 3+4. 流转集成: plan 双向链接 + completed 归档一致性 =====

describe("plan/archive 流转一致性", () => {
  let ROOT = "";
  const originalCwd = process.cwd();

  beforeEach(() => {
    ROOT = mkTmp("sdd-test-regflow");
    mkdirSync(resolve(ROOT, "docs", "prd"), { recursive: true });
    mkdirSync(resolve(ROOT, "docs", "phase"), { recursive: true });
    mkdirSync(resolve(ROOT, ".sdd", "meta", "prd"), { recursive: true });
    mkdirSync(resolve(ROOT, ".sdd", "meta", "phase"), { recursive: true });
    writeFileSync(
      resolve(ROOT, "docs", "index.md"),
      `# 项目文档索引

## 产品需求文档（PRD）

| 日期 | 文档名称 | 状态 | 对应 Phase | 说明 |
| ---- | -------- | ---- | ---------- | ---- |

## 阶段文档（Phase）

| 日期 | 阶段名称 | 状态 | 对应 PRD | 说明 |
| ---- | -------- | ---- | -------- | ---- |
`,
    );
    // 可通过的 lint/test gate
    writeFileSync(resolve(ROOT, ".sdd", "gate.json"), JSON.stringify({ lint: "echo ok", test: "echo ok" }));
    // git(review gate 需要 staged hash / commit sha)
    spawnSync("git", ["init", "-q"], { cwd: ROOT });
    spawnSync("git", ["config", "user.email", "t@t.com"], { cwd: ROOT });
    spawnSync("git", ["config", "user.name", "t"], { cwd: ROOT });
    process.chdir(ROOT);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(ROOT, { recursive: true, force: true });
  });

  test("planPrd 生成嵌套 Phase 路径 + 双向相对链接", async () => {
    const initR = await initPrd({ title: "Link Test" });
    await reviewPrd();
    await approvePrd({});
    const planR = await planPrd({ phase: "Foundation" });
    expect(planR.status).toBe("pass");

    // Phase 实际路径必须是嵌套 docs/phase/<prd-id>/...
    expect(planR.phasePath).toBeDefined();
    expect(planR.phasePath!).toMatch(/^docs\/phase\/prd-\d{8}-\d{3}\/001-foundation\.md$/);
    expect(existsSync(resolve(ROOT, planR.phasePath!))).toBe(true);

    // Phase 内容含可解析的相对回指链接到 PRD
    const prdRel = readPrdMeta(initR.prdId!)!.filePath;
    const prdAbs = resolve(ROOT, prdRel);
    const phaseContent = readFileSync(resolve(ROOT, planR.phasePath!), "utf-8");
    const m = phaseContent.match(/对应 PRD[：:]\s*\[[^\]]*\]\(([^)]+)\)/);
    expect(m).not.toBeNull();
    const resolvedFromPhase = resolve(dirname(resolve(ROOT, planR.phasePath!)), m![1]);
    expect(resolvedFromPhase).toBe(prdAbs);

    // PRD 内容含可解析的相对链接到 Phase(不再是 TBD 占位)
    const prdContent = readFileSync(prdAbs, "utf-8");
    const pm = prdContent.match(/对应阶段[：:]\s*\[[^\]]*\]\(([^)]+)\)/);
    expect(pm).not.toBeNull();
    const resolvedFromPrd = resolve(dirname(prdAbs), pm![1]);
    expect(resolvedFromPrd).toBe(resolve(ROOT, planR.phasePath!));
  });

  test("多次 plan 时 PRD 对应阶段 追加且去重", async () => {
    const initR = await initPrd({ title: "Multi Phase" });
    await reviewPrd();
    await approvePrd({});
    const p1 = await planPrd({ phase: "Foundation" });
    expect(p1.status).toBe("pass");

    // 第二个 Phase 需要 PRD 回到 Reviewed 才能再 plan;直接拨回(meta 层面)
    const meta = readPrdMeta(initR.prdId!)!;
    writePrdMeta({ ...meta, status: PrdStatus.Reviewed });
    const p2 = await planPrd({ phase: "Second" });
    expect(p2.status).toBe("pass");

    const prdAbs = resolve(ROOT, readPrdMeta(initR.prdId!)!.filePath);
    const content = readFileSync(prdAbs, "utf-8");
    const line = content.split("\n").find((l) => /对应阶段[：:]/.test(l)) ?? "";
    // 两个 Phase 链接都在
    expect(line).toContain("001-foundation");
    expect(line).toContain("002-second");
    // 无重复: 完整链接 [001-foundation](...) 只出现一次
    expect(line.split("[001-foundation](").length - 1).toBe(1);
    expect(line.split("[002-second](").length - 1).toBe(1);
  });

  test("archivePrdV2 --reason completed 成功后四者一致", async () => {
    const initR = await initPrd({ title: "Archive Consistency" });
    await reviewPrd();
    await approvePrd({});
    const planR = await planPrd({ phase: "Foundation" });
    await phaseTransition({ action: "start", id: planR.phaseId! });
    const pc = await phaseTransition({ action: "complete", id: planR.phaseId! });
    expect(pc.status).toBe("pass");

    // 为 review gate 准备 staged diff + 产物
    spawnSync("git", ["add", "-A"], { cwd: ROOT });
    writeReviewArtifact(ROOT, {
      commit_sha: "staged",
      timestamp: new Date().toISOString(),
      overall_correctness: "correct",
      reviewer: "reviewer",
      staged_hash: "",
    });

    const archR = await archivePrdV2({ reason: "completed" });
    expect(archR.status).toBe("pass");
    expect(archR.movedTo).toBeDefined();

    const meta = readPrdMeta(initR.prdId!)!;
    // 1. meta.filePath 已更新到归档位置
    expect(meta.filePath).toBe(archR.movedTo!);
    expect(meta.filePath).toMatch(/docs\/prd\/archive\//);
    // 2. 实际文件存在于 meta.filePath
    expect(existsSync(resolve(ROOT, meta.filePath))).toBe(true);
    // 3. Phase 分组目录已移动到 archive
    expect(existsSync(resolve(ROOT, "docs", "phase", "archive", initR.prdId!))).toBe(true);
    // 4. /sdd sync 不报 markdown 缺失(meta.filePath 与实际一致)
    const syncR = await syncMeta({});
    const missing = syncR.warnings.filter((w) => w.includes("markdown 缺失"));
    expect(missing.length).toBe(0);
    // 5. index.md 链接已重写指向归档位置(日期列+名称列)
    const idxContent = readFileSync(resolve(ROOT, "docs", "index.md"), "utf-8");
    const row = idxContent.split("\n").find((l) => l.includes("archive-consistency")) ?? "";
    expect(row).toContain("已归档");
    const links = [...row.matchAll(/\]\(([^)]+)\)/g)].map((mm) => mm[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const ln of links) {
      expect(ln).toMatch(/archive\//);
      // 链接目标真实存在
      expect(existsSync(resolve(ROOT, "docs", ln))).toBe(true);
    }
    // 6. 归档后 PRD↔Phase 交叉引用仍可解析(双方都已移动)
    const prdAbs2 = resolve(ROOT, meta.filePath);
    const prdContent2 = readFileSync(prdAbs2, "utf-8");
    const prdPhaseLink = prdContent2.match(/对应阶段[：:]\s*\[[^\]]*\]\(([^)]+)\)/);
    expect(prdPhaseLink).not.toBeNull();
    expect(existsSync(resolve(dirname(prdAbs2), prdPhaseLink![1]))).toBe(true);
    const phaseAbs2 = resolve(ROOT, "docs", "phase", "archive", initR.prdId!, "001-foundation.md");
    const phaseContent2 = readFileSync(phaseAbs2, "utf-8");
    const phasePrdLink = phaseContent2.match(/对应 PRD[：:]\s*\[[^\]]*\]\(([^)]+)\)/);
    expect(phasePrdLink).not.toBeNull();
    expect(existsSync(resolve(dirname(phaseAbs2), phasePrdLink![1]))).toBe(true);
  });
});

// ===== 5. generatePhaseId 全局唯一 =====

describe("generatePhaseId 全局唯一", () => {
  let ROOT = "";
  const originalCwd = process.cwd();

  beforeEach(() => {
    ROOT = mkTmp("sdd-test-phaseid");
    mkdirSync(resolve(ROOT, "docs", "prd"), { recursive: true });
    mkdirSync(resolve(ROOT, ".sdd", "meta", "prd"), { recursive: true });
    mkdirSync(resolve(ROOT, ".sdd", "meta", "phase"), { recursive: true });
    process.chdir(ROOT);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(ROOT, { recursive: true, force: true });
  });

  function makePhase(id: string): PhaseMeta {
    return {
      id,
      parentId: "prd-20260717-001",
      title: id,
      status: PhaseStatus.NotStarted,
      seq: 1,
      transitions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      filePath: `docs/phase/prd-20260717-001/${id}.md`,
    };
  }

  test("同 PRD 下连续生成的 phase id 递增且唯一", () => {
    const id1 = generatePhaseId("prd-20260717-001");
    writePhaseMeta(makePhase(id1));
    const id2 = generatePhaseId("prd-20260717-001");
    writePhaseMeta(makePhase(id2));
    expect(id1).not.toBe(id2);
    const idx = readMetaIndex();
    expect(new Set(idx.phaseIds).size).toBe(idx.phaseIds.length);
  });
});

// ===== 6. rebuildMeta nextPhaseSeq 不回退 =====

describe("rebuildMeta nextPhaseSeq 不回退", () => {
  let ROOT = "";
  const originalCwd = process.cwd();

  beforeEach(() => {
    ROOT = mkTmp("sdd-test-rebuild");
    // PRD + 1 个已有 Phase(seq=1) 的 markdown
    mkdirSync(resolve(ROOT, "docs", "prd"), { recursive: true });
    writeFileSync(
      resolve(ROOT, "docs", "prd", "2026-07-17-rebuild.md"),
      [
        "# Rebuild PRD",
        "> 状态：进行中 | 发布日期：2026-07-17",
        "> 对应阶段：[P1](../phase/prd-20260717-001/001-foundation.md)",
        "## 0. 目标声明",
        "## 1. 背景",
        "## 3. 功能需求",
        "## 8. 验收标准",
      ].join("\n"),
    );
    const pg = resolve(ROOT, "docs", "phase", "prd-20260717-001");
    mkdirSync(pg, { recursive: true });
    writeFileSync(
      resolve(pg, "001-foundation.md"),
      [
        "# Phase 001",
        "> 状态：未开始",
        "> 对应 PRD：[Rebuild PRD](../../prd/2026-07-17-rebuild.md)",
      ].join("\n"),
    );
    mkdirSync(resolve(ROOT, ".sdd", "meta", "prd"), { recursive: true });
    mkdirSync(resolve(ROOT, ".sdd", "meta", "phase"), { recursive: true });
    process.chdir(ROOT);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(ROOT, { recursive: true, force: true });
  });

  test("rebuild 后 nextPhaseSeq 是下一个可用 seq(不覆盖已有 Phase)", () => {
    rebuildMetaFromMarkdown();
    const meta = readPrdMeta("prd-20260717-001")!;
    expect(meta).not.toBeNull();
    // 已有 1 个 Phase(seq=1) → nextPhaseSeq 必须是 2,否则下次 plan 覆盖 001
    expect(meta.nextPhaseSeq).toBe(2);
  });
});

// ===== 7. rewriteLinksForMove 纯函数 =====

describe("rewriteLinksForMove 纯函数", () => {
  test("下移一层时相对链接补一层 ../", async () => {
    
    const oldDir = resolve("/repo/docs/prd");
    const newDir = resolve("/repo/docs/prd/archive");
    const content = "> 对应阶段：[P](../phase/x/001-a.md)\n[abs](/etc/x.md) [ext](https://a.b/c.md) [anchor](#s)";
    const out = rewriteLinksForMove(content, oldDir, newDir);
    expect(out).toContain("[P](../../phase/x/001-a.md)");
    // 绝对/协议/锚点不动
    expect(out).toContain("[abs](/etc/x.md)");
    expect(out).toContain("[ext](https://a.b/c.md)");
    expect(out).toContain("[anchor](#s)");
  });

  test("pathMap 把已移动目标映射到新位置", async () => {
    
    const oldDir = resolve("/repo/docs/phase/g");
    const newDir = resolve("/repo/docs/phase/archive/g");
    // Phase 指向 PRD: 旧 ../../prd/x.md → PRD 也移到 prd/archive/x.md
    const content = "> 对应 PRD：[X](../../prd/x.md)";
    const pathMap = new Map([
      [resolve("/repo/docs/prd/x.md"), resolve("/repo/docs/prd/archive/x.md")],
    ]);
    const out = rewriteLinksForMove(content, oldDir, newDir, pathMap);
    expect(out).toContain("../../../prd/archive/x.md");
  });

  test("oldDir === newDir 且无 pathMap 时原样返回", async () => {
    
    const d = resolve("/repo/docs/prd");
    const content = "[P](../phase/a.md)";
    expect(rewriteLinksForMove(content, d, d)).toBe(content);
  });
});
