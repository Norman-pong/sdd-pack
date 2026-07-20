/**
 * gate-config.test.ts + gate-runner.test.ts
 * 门禁配置解析 + 5 阶段执行器单元测试
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detectProjectType,
  defaultCommandsFor,
  resolveGateCommands,
  type ProjectType,
} from "../lib/gate-config";
import {
  runLint,
  runTest,
  runReview,
  writeReviewArtifact,
  type ReviewArtifact,
} from "../lib/gate-runner";

// ===== 临时项目目录 helper =====

function makeTmpProject(setup: (root: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "sdd-gate-test-"));
  setup(dir);
  return dir;
}

function makeVitePlusProject(root: string): void {
  mkdirSync(join(root, "docs", "prd"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "test-vp", dependencies: { "vite-plus": "^1.0.0" } }),
  );
  // 放一个假的 lint 脚本，让 vp check 可以被 mock
  mkdirSync(join(root, ".sdd"), { recursive: true });
}

function makeRustProject(root: string): void {
  mkdirSync(join(root, "docs", "prd"), { recursive: true });
  writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "test"\nversion = "0.1.0"\n');
}

function makeBunProject(root: string): void {
  mkdirSync(join(root, "docs", "prd"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { elysia: "^1.0.0" } }),
  );
  writeFileSync(join(root, "bun.lockb"), "");
}

function makeGoProject(root: string): void {
  mkdirSync(join(root, "docs", "prd"), { recursive: true });
  writeFileSync(join(root, "go.mod"), "module test\n\ngo 1.21\n");
}

function makeUnknownProject(root: string): void {
  // 只有 docs/prd，无任何项目类型信号
  mkdirSync(join(root, "docs", "prd"), { recursive: true });
}

function writeGateConfig(root: string, config: Record<string, unknown>): void {
  mkdirSync(join(root, ".sdd"), { recursive: true });
  writeFileSync(join(root, ".sdd", "gate.json"), JSON.stringify(config));
}

// ===== detectProjectType =====

describe("detectProjectType", () => {
  test("detects vite-plus from package.json dependency", () => {
    const root = makeTmpProject(makeVitePlusProject);
    expect(detectProjectType(root)).toBe("vite-plus");
    rmSync(root, { recursive: true });
  });

  test("detects rust from Cargo.toml", () => {
    const root = makeTmpProject(makeRustProject);
    expect(detectProjectType(root)).toBe("rust");
    rmSync(root, { recursive: true });
  });

  test("detects go from go.mod", () => {
    const root = makeTmpProject(makeGoProject);
    expect(detectProjectType(root)).toBe("go");
    rmSync(root, { recursive: true });
  });

  test("detects bun from bun.lockb + elysia dependency", () => {
    const root = makeTmpProject(makeBunProject);
    expect(detectProjectType(root)).toBe("bun");
    rmSync(root, { recursive: true });
  });

  test("returns unknown when no project markers found", () => {
    const root = makeTmpProject(makeUnknownProject);
    expect(detectProjectType(root)).toBe("unknown");
    rmSync(root, { recursive: true });
  });
});

// ===== defaultCommandsFor =====

describe("defaultCommandsFor", () => {
  test("vite-plus returns vp commands", () => {
    const c = defaultCommandsFor("vite-plus" as ProjectType);
    expect(c.lint).toBe("vp check");
    expect(c.test).toBe("vp test");
    expect(c.build).toBe("vp build");
  });

  test("rust returns cargo commands", () => {
    const c = defaultCommandsFor("rust" as ProjectType);
    expect(c.lint).toContain("cargo clippy");
    expect(c.test).toBe("cargo test");
  });

  test("go returns go commands", () => {
    const c = defaultCommandsFor("go" as ProjectType);
    expect(c.lint).toBe("go vet ./...");
    expect(c.test).toBe("go test ./...");
  });

  test("unknown returns empty strings", () => {
    const c = defaultCommandsFor("unknown" as ProjectType);
    expect(c.lint).toBe("");
    expect(c.test).toBe("");
  });
});

// ===== resolveGateCommands =====

describe("resolveGateCommands", () => {
  test("gate.json overrides auto-detection", () => {
    const root = makeTmpProject((r) => {
      makeVitePlusProject(r);
      writeGateConfig(r, { lint: "echo custom-lint" });
    });
    const { lint, source } = resolveGateCommands(root);
    expect(lint).toBe("echo custom-lint");
    expect(source).toBe("config");
    rmSync(root, { recursive: true });
  });

  test("auto-detects vite-plus when no gate.json", () => {
    const root = makeTmpProject(makeVitePlusProject);
    const { lint, source, projectType } = resolveGateCommands(root);
    expect(lint).toBe("vp check");
    expect(source).toBe("auto");
    expect(projectType).toBe("vite-plus");
    rmSync(root, { recursive: true });
  });

  test("returns source=none when unknown project and no gate.json", () => {
    const root = makeTmpProject(makeUnknownProject);
    const { lint, source, projectType } = resolveGateCommands(root);
    expect(lint).toBe("");
    expect(source).toBe("none");
    expect(projectType).toBe("unknown");
    rmSync(root, { recursive: true });
  });
});

// ===== runLint =====

describe("runLint", () => {
  test("blocks when no lint command available (unknown project, no gate.json)", () => {
    const root = makeTmpProject(makeUnknownProject);
    const result = runLint(root);
    expect(result.status).toBe("block");
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("未检测到 lint 命令");
    rmSync(root, { recursive: true });
  });

  test("passes when lint command succeeds", () => {
    const root = makeTmpProject((r) => {
      makeVitePlusProject(r);
      writeGateConfig(r, { lint: "echo lint-ok" });
    });
    const result = runLint(root);
    expect(result.status).toBe("pass");
    expect(result.exitCode).toBe(0);
    rmSync(root, { recursive: true });
  });

  test("fails when lint command exits non-zero", () => {
    const root = makeTmpProject((r) => {
      makeVitePlusProject(r);
      writeGateConfig(r, { lint: "false" });
    });
    const result = runLint(root);
    expect(result.status).toBe("fail");
    expect(result.exitCode).not.toBe(0);
    rmSync(root, { recursive: true });
  });
});

// ===== runTest =====

describe("runTest", () => {
  test("skips when no test command configured", () => {
    const root = makeTmpProject(makeUnknownProject);
    const result = runTest(root);
    expect(result.status).toBe("skip");
    expect(result.exitCode).toBe(0);
    rmSync(root, { recursive: true });
  });

  test("passes when test command succeeds", () => {
    const root = makeTmpProject((r) => {
      makeVitePlusProject(r);
      writeGateConfig(r, { test: "echo test-ok" });
    });
    const result = runTest(root);
    expect(result.status).toBe("pass");
    rmSync(root, { recursive: true });
  });

  test("fails when test command exits non-zero", () => {
    const root = makeTmpProject((r) => {
      makeVitePlusProject(r);
      writeGateConfig(r, { test: "false" });
    });
    const result = runTest(root);
    expect(result.status).toBe("fail");
    rmSync(root, { recursive: true });
  });
});

// ===== runReview + writeReviewArtifact =====

describe("runReview", () => {
  test("blocks when no review artifact exists", () => {
    const root = makeTmpProject(makeVitePlusProject);
    const result = runReview(root, "staged");
    expect(result.status).toBe("block");
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("缺少 review 产物");
    rmSync(root, { recursive: true });
  });

  test("passes when artifact with correct verdict exists", () => {
    const root = makeTmpProject(makeVitePlusProject);
    const artifact: ReviewArtifact = {
      commit_sha: "staged",
      timestamp: new Date().toISOString(),
      overall_correctness: "correct",
      reviewer: "reviewer",
      staged_hash: "",
    };
    writeReviewArtifact(root, artifact);
    const result = runReview(root, "staged");
    expect(result.status).toBe("pass");
    expect(result.exitCode).toBe(0);
    rmSync(root, { recursive: true });
  });

  test("fails when artifact verdict is incorrect", () => {
    const root = makeTmpProject(makeVitePlusProject);
    const artifact: ReviewArtifact = {
      commit_sha: "staged",
      timestamp: new Date().toISOString(),
      overall_correctness: "incorrect",
      reviewer: "reviewer",
      staged_hash: "",
    };
    writeReviewArtifact(root, artifact);
    const result = runReview(root, "staged");
    expect(result.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    rmSync(root, { recursive: true });
  });

  test("fails when artifact verdict is incorrect_with_minor_defects", () => {
    const root = makeTmpProject(makeVitePlusProject);
    const artifact: ReviewArtifact = {
      commit_sha: "staged",
      timestamp: new Date().toISOString(),
      overall_correctness: "incorrect_with_minor_defects",
      reviewer: "reviewer",
      staged_hash: "",
    };
    writeReviewArtifact(root, artifact);
    const result = runReview(root, "staged");
    expect(result.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    rmSync(root, { recursive: true });
  });

  test("passes with correct-with-debt verdict", () => {
    const root = makeTmpProject(makeVitePlusProject);
    const artifact: ReviewArtifact = {
      commit_sha: "staged",
      timestamp: new Date().toISOString(),
      overall_correctness: "correct-with-debt",
      reviewer: "reviewer",
      staged_hash: "",
    };
    writeReviewArtifact(root, artifact);
    const result = runReview(root, "staged");
    expect(result.status).toBe("pass");
    rmSync(root, { recursive: true });
  });

  test("passes when staged hash mismatches but verdict is correct (stale-pass)", () => {
    const root = makeTmpProject(makeVitePlusProject);
    const artifact: ReviewArtifact = {
      commit_sha: "staged",
      timestamp: new Date().toISOString(),
      overall_correctness: "correct",
      reviewer: "reviewer",
      staged_hash: "outdated-hash",
    };
    writeReviewArtifact(root, artifact);
    // runReview computes stagedHash from git diff --cached, which returns
    // "empty" when no git repo exists -> mismatch with "outdated-hash" -> stale
    // 新语义: stale + verdict=pass 降级为 pass(无 PRD/Phase 项目 lore commit 只需 reviewer 通过)
    const result = runReview(root, "staged");
    expect(result.status).toBe("pass");
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("stale");
    rmSync(root, { recursive: true });
  });

  test("fails when staged hash mismatches AND verdict is incorrect (failed beats stale)", () => {
    const root = makeTmpProject(makeVitePlusProject);
    const artifact: ReviewArtifact = {
      commit_sha: "staged",
      timestamp: new Date().toISOString(),
      overall_correctness: "incorrect",
      reviewer: "reviewer",
      staged_hash: "outdated-hash",
    };
    writeReviewArtifact(root, artifact);
    // failed 优先于 stale: verdict=incorrect 即使产物 stale 也走 fail 分支
    const result = runReview(root, "staged");
    expect(result.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("verdict=incorrect");
    rmSync(root, { recursive: true });
  });
});

describe("writeReviewArtifact", () => {
  test("writes JSON file to .sdd/review/<sha>.<reviewer>.json", () => {
    const root = makeTmpProject(makeVitePlusProject);
    const artifact: ReviewArtifact = {
      commit_sha: "abc123",
      timestamp: "2026-07-13T00:00:00Z",
      overall_correctness: "correct",
      reviewer: "reviewer",
      staged_hash: "",
    };
    const path = writeReviewArtifact(root, artifact);
    expect(existsSync(path)).toBe(true);
    expect(path).toContain("abc123.reviewer.json");
    rmSync(root, { recursive: true });
  });
});
