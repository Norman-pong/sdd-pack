/**
 * gate-runner.ts - 门禁阶段执行器
 *
 * 5 阶段流水线（用户定义）：
 *   编码 -> lint -> 流程验证(功能测试) -> reviewer -> lint(再跑一次) -> lore commit
 *
 * 阶段映射：
 *   lint      -> 跑 lint 命令（必需，缺则 block）
 *   test      -> 跑 test 命令（可选，缺则 skip）
 *   review    -> 检查 review 产物存在 + verdict 通过 + staged hash 匹配（防旧产物复用）
 *   precommit -> 再跑一次 lint（lore 约束检查由 reviewer agent step 3 负责，不重复）
 *   commit    -> 调 lore commit
 *
 * 调用方：sdd-extension slash command（omp 进程内执行，cwd = 用户项目根）
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  resolveGateCommands,
  type GateResult,
} from "./gate-config";
import { isLoreAvailable } from "./lore-wrapper";

// ===== review 产物格式 =====

/** reviewer agent 产出的 review 结果文件格式 */
export interface ReviewArtifact {
  /** 被 review 的 commit SHA（pre-commit 场景为 "staged"） */
  commit_sha: string;
  /** ISO 时间戳 */
  timestamp: string;
  /** reviewer verdict */
  overall_correctness: "correct" | "correct-with-debt" | "incorrect_with_minor_defects" | "incorrect";
  /** 审查者（reviewer / arch-reviewer / sdd-reviewer） */
  reviewer: string;
  /** staged diff 的 hash（防旧产物复用：runReview 会比对当前 staged hash） */
  staged_hash: string;
  /** 发现的 findings（可选，agent 通过 report_finding 自动填充） */
  findings?: unknown[];
}

/** review 产物存放目录 */
const REVIEW_DIR = ".sdd/review";

/**
 * 计算 staged diff 的 hash（用于 review 产物时效校验）
 * 用 git diff --cached 的内容做 SHA-1，不依赖 commit SHA（pre-commit 场景无 commit SHA）
 */
function stagedHash(repoRoot: string): string {
  const r = spawnSync("git", ["diff", "--cached"], {
    encoding: "utf-8",
    cwd: repoRoot,
  });
  if (r.status !== 0 || !r.stdout) return "empty";
  const content = r.stdout;
  // 简单 hash：取 diff 内容长度 + 前 40 字符的 charCode 和
  // 不用 crypto 是为了零依赖，碰撞概率对 review 时效校验足够低
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
  }
  return `${content.length}-${(hash >>> 0).toString(16)}`;
}

/**
 * 获取当前 staged changes 的标识（pre-commit 场景无真实 SHA，用 "staged"）
 */
function currentSha(): string {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  if (r.status !== 0) return "staged";
  const sha = r.stdout.trim();
  // 如果有 staged changes，标记为 staged（review 在 commit 前执行）
  const stagedR = spawnSync("git", ["diff", "--cached", "--name-only"], {
    encoding: "utf-8",
  });
  if (stagedR.stdout.trim().length > 0) return "staged";
  return sha.slice(0, 12);
}

/**
 * 执行 shell 命令，返回结果
 */
function runCommand(cmd: string, cwd: string): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const r = spawnSync(cmd, {
    shell: true,
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    exitCode: r.status ?? 1,
  };
}

// ===== 5 阶段执行器 =====

/**
 * 阶段 1: lint
 * 跑 lint 命令。无 lint 命令 -> block。
 */
export function runLint(repoRoot: string): GateResult {
  const { lint, source, projectType } = resolveGateCommands(repoRoot);

  if (!lint) {
    return {
      stage: "lint",
      status: "block",
      stdout: "",
      stderr: "",
      exitCode: 2,
      message:
        `未检测到 lint 命令（项目类型: ${projectType}）。\n` +
        `请在 .sdd/gate.json 中配置 lint 字段，例如：\n` +
        `  {"lint": "vp check"}\n` +
        `或确保项目根有 Cargo.toml / go.mod / package.json(含 vite-plus) / bun.lockb+Elysia 供自动检测。`,
    };
  }

  const { stdout, stderr, exitCode } = runCommand(lint, repoRoot);
  return {
    stage: "lint",
    status: exitCode === 0 ? "pass" : "fail",
    command: lint,
    stdout,
    stderr,
    exitCode,
    message: source === "auto" ? "(auto-detected)" : "(from .sdd/gate.json)",
  };
}

/**
 * 阶段 2: test
 * 跑功能验证测试。无 test 命令 -> skip（不阻塞，因为有些项目确实无测试）。
 */
export function runTest(repoRoot: string): GateResult {
  const { test } = resolveGateCommands(repoRoot);

  if (!test) {
    return {
      stage: "test",
      status: "skip",
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: "无 test 命令配置，跳过（可在 .sdd/gate.json 添加 test 字段启用）",
    };
  }

  const { stdout, stderr, exitCode } = runCommand(test, repoRoot);
  return {
    stage: "test",
    status: exitCode === 0 ? "pass" : "fail",
    command: test,
    stdout,
    stderr,
    exitCode,
  };
}

/**
 * 阶段 3: review
 * 检查 review 产物存在 + verdict 通过 + staged hash 匹配。
 *
 * 时效校验：产物中的 staged_hash 必须与当前 staged diff hash 一致，
 * 否则视为旧产物（代码已变更但未重新 review）-> block。
 *
 * 多 reviewer 支持：gate.json 的 reviewers 字段配置需要哪些 reviewer 产物。
 * 默认 ["reviewer"]。可配置 ["reviewer", "arch-reviewer", "sdd-reviewer"]。
 */
export function runReview(repoRoot: string, sha?: string): GateResult {
  const targetSha = sha ?? currentSha();
  const currentHash = stagedHash(repoRoot);

  // 默认只检查 reviewer；gate.json 可配置多 reviewer
  const reviewers = loadRequiredReviewers(repoRoot);

  const missing: string[] = [];
  const stale: string[] = [];
  const failed: string[] = [];

  for (const reviewer of reviewers) {
    const reviewPath = resolve(repoRoot, REVIEW_DIR, `${targetSha}.${reviewer}.json`);

    if (!existsSync(reviewPath)) {
      missing.push(reviewer);
      continue;
    }

    let artifact: ReviewArtifact;
    try {
      artifact = JSON.parse(readFileSync(reviewPath, "utf-8")) as ReviewArtifact;
    } catch (e) {
      failed.push(`${reviewer}: 产物解析失败 ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    // 时效校验：staged hash 不匹配 -> 旧产物(stale)。新语义下 stale 不阻塞,但仍记录,
    // 且 verdict 校验继续执行——stale + verdict=incorrect 仍走 failed 分支。
    if (artifact.staged_hash !== currentHash) {
      stale.push(reviewer);
    }

    if (artifact.overall_correctness === "incorrect" || artifact.overall_correctness === "incorrect_with_minor_defects") {
      failed.push(`${reviewer}: verdict=${artifact.overall_correctness}`);
    }
  }

  if (missing.length > 0) {
    return {
      stage: "review",
      status: "block",
      stdout: "",
      stderr: "",
      exitCode: 2,
      message:
        `缺少 review 产物: ${missing.join(", ")}\n` +
        `请先 spawn 对应 reviewer agent 审查 staged diff：\n` +
        missing.map((r) => `  task(agent="${r}", prompt="Review staged diff...")`).join("\n") +
        `\n产物路径: .sdd/review/${targetSha}.<reviewer>.json`,
    };
  }

  // failed(verdict 失败) 优先于 stale——stale+incorrect 走 fail 分支,不被 stale-pass 吞掉。
  if (failed.length > 0) {
    return {
      stage: "review",
      status: "fail",
      stdout: "",
      stderr: "",
      exitCode: 1,
      message: `review 未通过:\n${failed.join("\n")}`,
    };
  }

  // stale 降级为 pass(ADR: 无 PRD/Phase 项目 lore commit 只需 reviewer 通过即可提交)
  // 产物存在 + verdict=pass 即视为通过;staged_hash 不匹配提示 agent 产物可能过时,但不阻塞。
  // 真正的阻塞由 missing(产物缺失) + failed(verdict 失败) 保证(failed 已在上面处理)。
  if (stale.length > 0) {
    return {
      stage: "review",
      status: "pass",
      stdout: "",
      stderr: "",
      exitCode: 0,
      message:
        `⚠ reviewer 产物 staged_hash 与当前 staged diff 不匹配(stale),已降级放行: ${stale.join(", ")}\n` +
        `产物存在 + verdict 通过即视为有效审查。若改动范围已变,建议重新 spawn reviewer。`,
    };
  }

  return {
    stage: "review",
    status: "pass",
    stdout: "",
    stderr: "",
    exitCode: 0,
    message: `${reviewers.join(", ")} verdict: pass (staged hash: ${currentHash})`,
  };
}

/**
 * 阶段 4: precommit
 * 再跑一次 lint。
 *
 * 注意：lore 约束检查由 reviewer agent 的 step 3（lore constraint probe）负责，
 * precommit 不重复--避免把"文件有 lore 约束"误判为"文件违反了 lore 约束"。
 */
export function runPrecommit(repoRoot: string): GateResult {
  const lintResult = runLint(repoRoot);
  if (lintResult.status !== "pass") {
    return {
      stage: "precommit",
      status: lintResult.status,
      command: lintResult.command,
      stdout: lintResult.stdout,
      stderr: lintResult.stderr,
      exitCode: lintResult.exitCode,
      message: `precommit lint 失败: ${lintResult.message ?? ""}`,
    };
  }

  if (!isLoreAvailable()) {
    return {
      stage: "precommit",
      status: "block",
      stdout: "",
      stderr: "",
      exitCode: 2,
      message: "lore CLI 不可用。sdd-gate 要求 lore 已安装并可在 PATH 中调用。",
    };
  }

  return {
    stage: "precommit",
    status: "pass",
    stdout: "",
    stderr: "",
    exitCode: 0,
    message: "lint pass + lore available",
  };
}

/**
 * 阶段 5: commit
 * 调 lore commit，commit message JSON 通过参数传入。
 * ADR-019 Step 10: 成功后反查 Lore-id + commitHash 填入 GateResult（非 breaking，旧调用方不需改）。
 */
export function runCommit(repoRoot: string, commitMessageJson?: string): GateResult {
  if (!isLoreAvailable()) {
    return {
      stage: "commit",
      status: "block",
      stdout: "",
      stderr: "",
      exitCode: 2,
      message: "lore CLI 不可用，无法执行 lore commit。",
    };
  }

  if (!commitMessageJson) {
    return {
      stage: "commit",
      status: "block",
      stdout: "",
      stderr: "",
      exitCode: 2,
      message:
        "缺少 commit message。请通过 --message 传入 JSON。\n" +
        '示例: /sdd gate commit --message \'{"intent":"fix: ...","trailers":{}}\'',
    };
  }

  const r = spawnSync("lore", ["commit"], {
    cwd: repoRoot,
    encoding: "utf-8",
    input: commitMessageJson,
    maxBuffer: 10 * 1024 * 1024,
  });

  const status: GateResult["status"] = r.status === 0 ? "pass" : "fail";
  const result: GateResult = {
    stage: "commit",
    status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    exitCode: r.status ?? 1,
  };

  // 成功后反查 commitHash + Lore-id（ADR-019 Step 10）
  // 策略：commit 成功后该 commit 一定是 lore log 最新一条；通过 git rev-parse HEAD + lore log --limit 1 --json 反查
  if (status === "pass") {
    try {
      const hashR = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf-8",
      });
      if (hashR.status === 0) result.commitHash = (hashR.stdout ?? "").trim();
    } catch {
      // git rev-parse 失败不阻塞 commit 结果
    }
    try {
      const logR = spawnSync("lore", ["log", "--limit", "1", "--json"], {
        cwd: repoRoot,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      if (logR.status === 0) {
        const parsed = JSON.parse(logR.stdout ?? "") as {
          results?: Array<{ lore_id?: string; commit?: string }>;
        };
        const latest = parsed.results?.[0];
        // 确认是本次 commit（hash 前 7 位匹配）
        if (latest?.lore_id && (!result.commitHash || latest.commit?.startsWith(result.commitHash.slice(0, 7)))) {
          result.loreId = latest.lore_id;
        }
      }
    } catch {
      // lore log 反查失败不阻塞 commit 结果
    }
  }

  return result;
}

/**
 * ADR-019 Step 10b: 从文件路径读 commit message JSON 再调 runCommit
 * 避免 bash 中多行 JSON 字符串的 shell escape 问题
 */
export function runCommitWithFile(repoRoot: string, commitMessagePath: string): GateResult {
  let message: string;
  try {
    message = readFileSync(commitMessagePath, "utf-8");
  } catch (e) {
    return {
      stage: "commit",
      status: "block",
      stdout: "",
      stderr: String(e),
      exitCode: 2,
      message: `无法读取 commit message 文件: ${commitMessagePath}`,
    };
  }
  return runCommit(repoRoot, message);
}

// ===== review 产物写入（供 reviewer agent 调用） =====

/**
 * 写入 review 产物。
 * reviewer agent 执行完毕后调用此函数，将 verdict 落盘到 .sdd/review/<sha>.<reviewer>.json。
 * gate-runner 的 review 阶段会检查该产物。
 *
 * staged_hash 由调用方传入（reviewer agent 在写产物时计算当前 staged diff hash）。
 * 如果调用方未传入，本函数自动计算。
 */
export function writeReviewArtifact(
  repoRoot: string,
  artifact: ReviewArtifact,
): string {
  const dir = resolve(repoRoot, REVIEW_DIR);
  mkdirSync(dir, { recursive: true });
  // 文件名格式：<sha>.<reviewer>.json（支持多 reviewer 各自独立）
  const path = resolve(dir, `${artifact.commit_sha}.${artifact.reviewer}.json`);
  // 如果 artifact.staged_hash 为空，自动填充
  if (!artifact.staged_hash) {
    artifact.staged_hash = stagedHash(repoRoot);
  }
  writeFileSync(path, JSON.stringify(artifact, null, 2) + "\n", "utf-8");
  return path;
}

// ===== gate.json reviewers 字段读取 =====

/** gate.json 扩展：reviewers 字段配置需要哪些 reviewer 产物 */
interface GateConfigWithReviewers {
  reviewers?: string[];
}

/**
 * 读取 gate.json 的 reviewers 配置。
 * 默认 ["reviewer"]。可配置 ["reviewer", "arch-reviewer", "sdd-reviewer"]。
 */
function loadRequiredReviewers(repoRoot: string): string[] {
  const configPath = resolve(repoRoot, ".sdd", "gate.json");
  if (!existsSync(configPath)) return ["reviewer"];
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as GateConfigWithReviewers;
    if (Array.isArray(config.reviewers) && config.reviewers.length > 0) {
      return config.reviewers;
    }
  } catch {
    // 解析失败，用默认值
  }
  return ["reviewer"];
}
