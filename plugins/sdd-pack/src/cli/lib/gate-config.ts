/**
 * gate-config.ts - 门禁命令解析器
 *
 * 职责：确定当前项目该跑什么 lint / test / build 命令。
 * 优先级：.sdd/gate.json 显式配置 > 项目类型自动检测 > 阻塞报错。
 *
 * 设计原则：
 * - 不指定 lint 则阻塞（用户明确要求："若不指定 lint 则阻塞流程"）
 * - 自动检测覆盖 Vite+ / Rust / Go / Bun 四种项目类型（对齐 rule://backend-toolchain）
 * - gate.json 与 SDD 文档体系同源放 .sdd/ 目录，git 可追踪
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 项目类型 */
export type ProjectType = "vite-plus" | "rust" | "go" | "bun" | "unknown";

/** gate.json 配置结构 */
export interface GateConfig {
  /** lint 命令（必需，缺则阻塞） */
  lint?: string;
  /** 功能验证测试命令（可选，缺则 test 阶段跳过） */
  test?: string;
  /** 构建命令（可选，缺则 build 阶段跳过） */
  build?: string;
}

/** 门禁阶段 */
export type GateStage = "lint" | "test" | "review" | "precommit" | "commit";

/** 单阶段执行结果 */
export interface GateResult {
  stage: GateStage;
  status: "pass" | "fail" | "skip" | "block";
  command?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  message?: string;
  /** commit 阶段专用：成功后的 git commit hash（ADR-019 Step 10） */
  commitHash?: string;
  /** commit 阶段专用：成功后的 Lore-id（8-char hex，通过 lore log 反查；ADR-019 Step 10） */
  loreId?: string;
}

/** gate.json 路径 */
const GATE_CONFIG_PATH = ".sdd/gate.json";

/**
 * 检测项目类型（对齐 rule://backend-toolchain 判别表）
 */
export function detectProjectType(repoRoot: string): ProjectType {
  // Vite+ 优先：package.json 含 vite-plus 依赖
  const pkgPath = resolve(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if ("vite-plus" in deps) return "vite-plus";
      // Bun 后端：bun.lockb + Elysia 依赖
      if (existsSync(resolve(repoRoot, "bun.lockb")) && "elysia" in deps) {
        return "bun";
      }
    } catch {
      // package.json 解析失败，继续检测其他类型
    }
  }

  // Rust：Cargo.toml 存在
  if (existsSync(resolve(repoRoot, "Cargo.toml"))) return "rust";

  // Go：go.mod 存在
  if (existsSync(resolve(repoRoot, "go.mod"))) return "go";

  return "unknown";
}

/**
 * 按项目类型返回默认 lint/test/build 命令
 */
export function defaultCommandsFor(type: ProjectType): {
  lint: string;
  test: string;
  build: string;
} {
  switch (type) {
    case "vite-plus":
      return { lint: "vp check", test: "vp test", build: "vp build" };
    case "rust":
      return {
        lint: "cargo fmt --check && cargo clippy",
        test: "cargo test",
        build: "cargo build",
      };
    case "go":
      return {
        lint: "go vet ./...",
        test: "go test ./...",
        build: "go build ./...",
      };
    case "bun":
      return { lint: "bunx tsc --noEmit", test: "bun test", build: "" };
    case "unknown":
    default:
      return { lint: "", test: "", build: "" };
  }
}

/**
 * 加载 .sdd/gate.json（若存在）
 */
function loadGateConfig(repoRoot: string): GateConfig {
  const configPath = resolve(repoRoot, GATE_CONFIG_PATH);
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as GateConfig;
  } catch (e) {
    throw new Error(
      `.sdd/gate.json 解析失败: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * 解析最终门禁命令：gate.json 覆盖自动检测，检测不到则阻塞。
 *
 * @returns { lint, test, build, source, projectType }
 * @throws 当 lint 命令无法确定时抛错（调用方应转为 block 结果）
 */
export function resolveGateCommands(repoRoot: string): {
  lint: string;
  test: string;
  build: string;
  source: "config" | "auto" | "none";
  projectType: ProjectType;
} {
  const config = loadGateConfig(repoRoot);
  const projectType = detectProjectType(repoRoot);
  const defaults = defaultCommandsFor(projectType);

  const lint = config.lint ?? defaults.lint;
  const test = config.test ?? defaults.test;
  const build = config.build ?? defaults.build;

  // lint 是必需的 - 不指定则阻塞
  if (!lint) {
    return {
      lint: "",
      test: "",
      build: "",
      source: "none",
      projectType,
    };
  }

  // source 判断：逐字段判定，每个命令独立追踪来源
  // lint 来源决定是否阻塞，test/build 来源仅影响显示信息
  return {
    lint,
    test,
    build,
    source: config.lint !== undefined ? "config" : "auto",
    projectType,
  };
}
