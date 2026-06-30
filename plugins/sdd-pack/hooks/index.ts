// sdd-pack hooks/index.ts — hook 聚合
// 装载: omp --hook plugins/sdd-pack/hooks/index.ts
// 决策: docs/architecture/decisions.md ADR-006(CLI flag 路径)
//
// 设计原则:
// - 不写 omp.hooks manifest 字段(omp 16.1.16 不识别)
// - 不依赖 @oh-my-pi/pi-coding-agent 类型(bun runtime 直加载 .ts,缺类型用 unknown 兜底)
// - 单文件聚合 4 个 hook,避免分文件造成装载顺序隐式依赖
// - 严格 type-only: 无 any,无 as any;event payload 用 unknown + 类型守卫
//
// B1.6 实测发现两条 omp v16.1.16 hook API 限制:
// 1. event payload **不含 kind 字段** — event 类型必须用 pi.on 第一参数名区分
// 2. pi.on() 多次注册同 event 名会**后注册覆盖先注册** — 必须用一次 on + 内部分发
//    解决方案: 每个 event 只 on 一次,内部分发到多个子 handler

// ===== 类型定义 =====

interface HookAPI {
  on(event: string, handler: (e: unknown) => void | Promise<void>): void;
  sendMessage(msg: { role: "system" | "user"; content: string }): void;
}

interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
}

interface SessionStartEvent {
  payload?: Record<string, unknown>;
}

// ===== 类型守卫(命名域概念,允许保留) =====

// 匹配 `git commit` 或 `lore commit`(原 rule condition: `(git|lore)\s+commit`)
function isCommitCommand(input: Record<string, unknown>): boolean {
  const cmd = input["command"];
  if (typeof cmd !== "string") return false;
  return /\b(git|lore)\s+commit\b/.test(cmd);
}

// 路径在 docs/ 下(原 rule scope: write/edit(docs/**))
function isDocWritePath(input: Record<string, unknown>): boolean {
  const path = input["path"];
  if (typeof path !== "string") return false;
  return path.startsWith("docs/") || /(^|\/)docs\//.test(path);
}

// ===== 4 个 hook 的 message 常量(顶部,避免内联到回调) =====

const LORE_PROTOCOL_REMINDER = [
  "📜 lore 提交协议(始终生效,plugin hook 注入):",
  "",
  "1. 修改文件前: `lore constraints <path> --json` / `lore rejected <path> --json` / `lore directives <path> --json`",
  "2. 提交用 `lore commit`(禁止裸 `git commit`): 带 intent + Constraint/Rejected/Directive 等 JSON trailer",
  "3. 文档同步: `sdd validate --staged` 自动校验(已集成到 commit guard)",
  "4. 完整 schema: `rule://lore-protocol`(alwaysApply)",
  "5. 本提醒来自 sdd-pack v1.3.0 plugin hook(`omp --hook plugins/sdd-pack/hooks/index.ts`)",
].join("\n");

const DOCS_UPDATE_HINT =
  "💡 docs-update-guard [hook]: 检测到 commit 命令。如果本次改动触及 docs/ 请确认 PRD↔Phase 双向引用已更新(skill://sdd-core)。";

const LORE_COMMIT_BLOCK_REASON = [
  "🚫 lore-commit-guard [hook]: 请用 `lore commit` 提交(自动满足 PRD/Phase 双向引用 + sdd validate)。",
  "   `lore commit --intent \"<why>\" [--body \"<narrative>\"] [--constraint ...] [--directive ...]`",
  "   裸 `git commit` 会绕过 lore 协议,破坏决策追溯链。",
].join("\n");

const DOC_EDIT_GUIDANCE = [
  "📝 sdd-doc-edit-guard [hook]: 检测到写 docs/ 目录。",
  "   docs/ 写入请走 skill://sdd-core 流程:",
  "   - 新需求 → skill://sdd-input → spec → PRD → Phase",
  "   - PRD 修改 → skill://sdd-prd",
  "   - Phase 任务 → skill://sdd-phase",
].join("\n");

// ===== sdd-validate-guard: in-process 调 api.validateDocs()(v1.4.0-alpha 起,ADR-009) =====

import { validateDocs } from "../src/cli/api";
import { stagedFiles } from "../src/cli/lib/orchestration/git";
import type { CheckSeverity } from "../src/cli/lib/validator";

// 提取 effective severity(环境变量 SDD_VALIDATE_SEVERITY)
function getValidateSeverity(): CheckSeverity {
  const sev = process.env.SDD_VALIDATE_SEVERITY;
  if (sev === "warn" || sev === "error" || sev === "block") return sev;
  return "warn";
}

// in-process 调 api.validateDocs()(替代原 spawnSync)
async function runSddValidate(pi: HookAPI): Promise<void> {
  try {
    const files = stagedFiles();
    if (files.length === 0) return;
    const result = await validateDocs({ staged: true, files, severity: getValidateSeverity() });
    if (result.status === "block") {
      pi.sendMessage({ role: "system", content: `🚫 sdd validate 硬拦截:\n${result.errors.join("\n")}` });
    } else if (result.status === "error") {
      pi.sendMessage({ role: "system", content: `⚠ sdd validate 错误(灰度阶段,仅警告):\n${result.errors.join("\n")}` });
    }
  } catch (e) {
    pi.sendMessage({ role: "system", content: `⚠ sdd validate 异常(已跳过): ${e instanceof Error ? e.message : String(e)}` });
  }
}
// ===== 入口: 每个 event 只 on 一次,内部分发到 4 个子 handler =====

export default function (pi: HookAPI): void {
  // (1) session_start — 模拟 alwaysApply: true
  //     omp hook 无原生 alwaysApply,通过 session_start 注入 lore reminder
  pi.on("session_start", (_e) => {
    pi.sendMessage({ role: "system", content: LORE_PROTOCOL_REMINDER });
  });

  // (2)(3)(4)(5) tool_call — 单一 on + 内部按 tool 名称/路径分发
  //     docs-update-guard:      bash + commit → 提示
  //     lore-commit-guard:      bash + commit → 强提示(替代原 block)
  //     sdd-validate-guard:     bash + commit → sdd validate --staged
  //     sdd-doc-edit-guard:     write|edit + docs/ → 提示
  pi.on("tool_call", async (e) => {
    const ev = e as ToolCallEvent;
    const toolName = ev.toolName;
    const input = ev.input ?? {};

    if (toolName === "bash" && isCommitCommand(input)) {
      pi.sendMessage({ role: "system", content: DOCS_UPDATE_HINT });
      pi.sendMessage({ role: "system", content: LORE_COMMIT_BLOCK_REASON });
      await runSddValidate(pi);
      return;
    }
    if ((toolName === "write" || toolName === "edit") && isDocWritePath(input)) {
      pi.sendMessage({ role: "system", content: DOC_EDIT_GUIDANCE });
    }
  });
}
