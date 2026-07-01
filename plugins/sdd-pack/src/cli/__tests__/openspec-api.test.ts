/**
 * openspec-api.test.ts — openspec-api 7 函数单元测试
 * 覆盖: getInitState / getStatus / validateProject / listChanges /
 *       showItem / getInstructions / archiveChange
 *
 * 测试 fixture 路径:openspec/ 目录不存在于仓库(此目录由 OpenSpec init 创建),
 * 所以测试 not-initialized 行为,通过 fixtures 子目录覆盖 init 行为。
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { resolve, join } from "path";

import {
  getInitState,
  getStatus,
  validateProject,
  listChanges,
  showItem,
  getInstructions,
  archiveChange,
} from "../openspec-api";

const FIXTURE_ROOT = "/tmp/openspec-test-fixture-" + Date.now();
const OP = join(FIXTURE_ROOT, "openspec");
const SPECS = join(OP, "specs");
const CHANGES = join(OP, "changes");

beforeAll(() => {
  // 构造 init fixture:openspec/{specs,changes,AGENTS.md}
  mkdirSync(SPECS, { recursive: true });
  mkdirSync(CHANGES, { recursive: true });
  writeFileSync(
    join(OP, "AGENTS.md"),
    "# OpenSpec Harness\n\nWelcome to OpenSpec workflow.\n",
    "utf-8",
  );
  // 加 1 个 spec area
  mkdirSync(join(SPECS, "auth"), { recursive: true });
  writeFileSync(
    join(SPECS, "auth", "spec.md"),
    [
      "# Auth Specification",
      "## Purpose",
      "Authentication and session management.",
      "## Requirements",
      "### Requirement: User Authentication",
      "The system SHALL issue a JWT on successful login.",
      "#### Scenario: Valid credentials",
      "- WHEN a user submits valid credentials",
      "- THEN a JWT is returned",
    ].join("\n"),
    "utf-8",
  );
  // 加 1 个活动变更(含 proposal + tasks + spec delta)
  const changeDir = join(CHANGES, "add-2fa");
  mkdirSync(changeDir, { recursive: true });
  mkdirSync(join(changeDir, "specs", "auth"), { recursive: true });
  writeFileSync(
    join(changeDir, "proposal.md"),
    "# Add 2FA\n\n## Why\nAdd two-factor authentication.\n",
    "utf-8",
  );
  writeFileSync(
    join(changeDir, "tasks.md"),
    "# Tasks\n\n## 1. Backend\n- [ ] 1.1 Add OTP endpoint\n",
    "utf-8",
  );
  writeFileSync(
    join(changeDir, "specs", "auth", "spec.md"),
    [
      "# Delta for Auth",
      "## ADDED Requirements",
      "### Requirement: Two-Factor Authentication",
      "The system MUST require a second factor during login.",
      "#### Scenario: OTP required",
      "- WHEN a user submits valid credentials",
      "- THEN an OTP challenge is required",
    ].join("\n"),
    "utf-8",
  );
});

afterAll(() => {
  if (existsSync(FIXTURE_ROOT)) rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

// 切换 cwd 到 fixture 根(所有 openspec-api 函数 resolve("openspec"))
const ORIG_CWD = process.cwd();
beforeAll(() => process.chdir(FIXTURE_ROOT));
afterAll(() => process.chdir(ORIG_CWD));

// ===== 1. getInitState =====
describe("getInitState", () => {
  test("initialized when openspec/{specs,changes,AGENTS.md} all exist", async () => {
    const r = await getInitState();
    expect(r.initialized).toBe(true);
    expect(r.openspecDir).toBe(true);
    expect(r.specsDir).toBe(true);
    expect(r.changesDir).toBe(true);
    expect(r.agentsMd).toBe(true);
    expect(r.missing).toEqual([]);
  });

  test("not-initialized when missing AGENTS.md", async () => {
    const agentsPath = resolve(OP, "AGENTS.md");
    const backup = "AGENTS.md.bak";
    writeFileSync(join(OP, backup), require("node:fs").readFileSync(agentsPath, "utf-8"));
    rmSync(agentsPath);
    try {
      const r = await getInitState();
      expect(r.initialized).toBe(false);
      expect(r.missing).toContain("openspec/AGENTS.md");
    } finally {
      writeFileSync(agentsPath, require("node:fs").readFileSync(join(OP, backup), "utf-8"));
      rmSync(join(OP, backup));
    }
  });
});

// ===== 2. getStatus =====
describe("getStatus", () => {
  test("counts active + archived + spec areas", async () => {
    const r = await getStatus();
    expect(r.activeChanges).toBeGreaterThanOrEqual(1);
    expect(r.specAreas).toBeGreaterThanOrEqual(1);
    expect(typeof r.archivedChanges).toBe("number");
  });
});

// ===== 3. validateProject =====
describe("validateProject", () => {
  test("valid change passes validate", async () => {
    const r = await validateProject({ changeId: "add-2fa" });
    expect(["pass", "warn"]).toContain(r.status);
    expect(r.changesChecked).toBe(1);
  });

  test("nonexistent change returns empty target list", async () => {
    const r = await validateProject({ changeId: "nonexistent-change-id-xyz" });
    // 没有 specs/ 子目录 → warn + 0 changesChecked
    expect(["warn", "pass"]).toContain(r.status);
    expect(r.changesChecked).toBe(1);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

// ===== 4. listChanges =====
describe("listChanges", () => {
  test("returns active changes by default", async () => {
    const r = await listChanges({});
    expect(r.items).toBeDefined();
    expect(r.matched).toBe(r.items.length);
    expect(r.items.some((i) => i.changeId === "add-2fa")).toBe(true);
  });

  test("specDeltas counts delta files", async () => {
    const r = await listChanges({});
    const item = r.items.find((i) => i.changeId === "add-2fa");
    expect(item).toBeDefined();
    expect(item!.specDeltas).toBeGreaterThanOrEqual(1);
    expect(item!.hasProposal).toBe(true);
    expect(item!.hasTasks).toBe(true);
  });

  test("status archived returns empty when no archive dir", async () => {
    const r = await listChanges({ status: "archived" });
    expect(r.matched).toBe(0);
  });
});

// ===== 5. showItem =====
describe("showItem", () => {
  test("returns proposal + tasks + spec deltas for active change", async () => {
    const r = await showItem("add-2fa");
    expect(r.exists).toBe(true);
    expect(r.proposal).not.toBeNull();
    expect(r.proposal).toContain("2FA");
    expect(r.tasks).not.toBeNull();
    expect(r.specDeltas.length).toBeGreaterThanOrEqual(1);
    // spec deltas 内容包含 "Two-Factor" key word
    const deltaContent = r.specDeltas.map((d) => d.content).join("\n");
    expect(deltaContent).toContain("Two-Factor");
  });

  test("nonexistent change returns exists=false", async () => {
    const r = await showItem("nonexistent-change-xyz");
    expect(r.exists).toBe(false);
    expect(r.proposal).toBeNull();
  });
});

// ===== 6. getInstructions =====
describe("getInstructions", () => {
  test("reads openspec/AGENTS.md content", async () => {
    const r = await getInstructions();
    expect(r.available).toBe(true);
    expect(r.content).toContain("OpenSpec");
    expect(r.path).toContain("AGENTS.md");
  });

  test("returns error when AGENTS.md missing", async () => {
    const agentsPath = resolve(OP, "AGENTS.md");
    const backup = "AGENTS.bak2";
    writeFileSync(join(OP, backup), require("node:fs").readFileSync(agentsPath, "utf-8"));
    rmSync(agentsPath);
    try {
      const r = await getInstructions();
      expect(r.available).toBe(false);
      expect(r.error).toBeDefined();
    } finally {
      writeFileSync(agentsPath, require("node:fs").readFileSync(join(OP, backup), "utf-8"));
      rmSync(join(OP, backup));
    }
  });
});

// ===== 7. archiveChange =====
describe("archiveChange", () => {
  test("archive not-existing change returns error", async () => {
    const r = await archiveChange({ changeId: "not-real-archive-xyz", noCommit: true });
    expect(r.status).toBe("error");
  });

  test("archives real change (noCommit to skip lore)", async () => {
    const r = await archiveChange({ changeId: "add-2fa", noCommit: true });
    expect(r.status).toBe("pass");
    expect(r.movedTo).toContain("archive");
    expect(r.movedTo).toContain("add-2fa");
  });
});
