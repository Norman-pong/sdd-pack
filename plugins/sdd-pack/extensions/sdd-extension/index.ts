/**
 * sdd-extension — omp slash command 集合
 *
 * 装载: omp --extension plugins/sdd-pack/extensions/sdd-extension/index.ts
 * 决策: docs/architecture/decisions.md ADR-009(替代 ADR-008 独立 CLI)
 *
 * 约束:
 * - 1 个 pi.registerCommand(/sdd 主命令,ADR-018 统一入口,旧 sdd-* 别名已移除)
 * - 不用 @oh-my-pi/pi-coding-agent 类型(unknown 兜底,跟 hooks/sdd/index.ts 同构)
 * - /sdd 路由 + 18 个子命令 handler 在 sdd-router.ts(ADR-018)
 */

import {
  validateDocs,
} from "../../src/cli/api";
import type { CheckSeverity } from "../../src/cli/lib/validator";
import { stagedFiles } from "../../src/cli/lib/orchestration/git";
import { handleSdd } from "./sdd-router";
import { registerSddTools } from "./tools";
import { runReview } from "../../src/cli/lib/gate-runner";

// ===== 类型兜底(unknown,跟 hooks/sdd/index.ts 同构) =====
interface ExtensionAPI {
  registerCommand(
    name: string,
    def: { description: string; handler: (args: string, ctx: unknown) => Promise<unknown> | unknown },
  ): void;
  on(event: string, handler: (e: unknown) => void | Promise<unknown>): void;
  sendMessage(msg: { role: "system" | "user"; content: string }): void;
  /** ADR-019 Step 12: omp tool 注册 API（17.0+ 一等公民） */
  registerTool?(tool: unknown): void;
  /** omp 注入的 zod 实例（用于 tool parameters schema） */
  zod?: { z: unknown };
}
interface ToolCallBlockResult {
  block: true;
  reason: string;
}

// ===== 从 hooks/sdd/index.ts 合并的 tool_call 拦截逻辑 =====

// --- 类型守卫 ---

interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
}

// 匹配 `git commit`(排除 commit-tree/commit-graph)
function isGitCommit(input: Record<string, unknown>): boolean {
  const cmd = input["command"];
  if (typeof cmd !== "string") return false;
  return /\bgit\s+commit(?=\s|$)/.test(cmd);
}

// 匹配 `lore commit`
function isLoreCommit(input: Record<string, unknown>): boolean {
  const cmd = input["command"];
  if (typeof cmd !== "string") return false;
  return /\blore\s+commit(?=\s|$)/.test(cmd);
}

// 路径在 docs/ 下
function isDocWritePath(input: Record<string, unknown>): boolean {
  const path = input["path"];
  if (typeof path !== "string") return false;
  return path.startsWith("docs/") || /(^|\/)docs\//.test(path);
}

// 路径是 PRD 或 Phase 文件
function isPrdOrPhaseFile(path: string): boolean {
  return /\/(prd|phase)\//.test(path);
}

// 检测是否触碰状态行(write 或 edit)
function touchesStatusLine(input: Record<string, unknown>, toolName: string): boolean {
  if (!isPrdOrPhaseFile(String(input.path ?? input.filePath ?? ""))) return false;
  if (toolName === "write") {
    return /^>\s*状态[：:]/m.test(String(input.content ?? ""));
  }
  if (toolName === "edit") {
    return /^\+>\s*状态[：:]/m.test(String(input.body ?? input.new_string ?? ""));
  }
  return false;
}

// --- message 常量 ---

const LORE_PROTOCOL_REMINDER = [
  "📜 lore 提交协议(始终生效,plugin hook 注入):",
  "",
  "1. 修改文件前: `lore constraints <path> --json` / `lore rejected <path> --json` / `lore directives <path> --json`",
  "2. 提交用 `lore commit`(禁止裸 `git commit`): 带 intent + Constraint/Rejected/Directive 等 JSON trailer",
  "3. 文档同步: `sdd validate --staged` 自动校验(已集成到 commit guard)",
  "4. 完整 schema: `rule://lore-protocol`(alwaysApply)",
  "5. 本提醒来自 sdd-pack SDD 范式 extension(ADR-015,合并自 hooks/sdd/)",
].join("\n");

const SDD_COMMAND_REMINDER = [
  "📜 SDD 文档状态流转协议(始终生效,sdd-pack extension 注入):",
  "",
  "文档状态变更必须通过 /sdd 命令,禁止直接 edit 状态行:",
  "  /sdd init <title>                        # 创建新 PRD(草稿)",
  "  /sdd review                              # 草稿 -> 待评审",
  "  /sdd approve                             # 待评审 -> 已评审",
  "  /sdd plan --phase <title>                # 已评审 -> 已规划任务",
  "  /sdd start                               # 已规划任务 -> 进行中",
  "  /sdd archive --reason <completed|abandoned>",
  "  /sdd back --to <draft|pending>           # 回退",
  "  /sdd phase <start|complete|abandon>      # Phase 流转",
  "  /sdd status                              # 状态面板",
  "  /sdd sync [--fix]                        # meta↔markdown 同步",
  "",
  "状态行篡改会被 tool_call 硬拦截(block)。",
].join("\n");

const SDD_VERSION_PROBE_REMINDER = [
  "📜 sdd-pack 版本探测(始终生效,sdd-pack extension ADR-019 注入):",
  "",
  "调用 /sdd 命令前,如果遇到 '未知子命令' 或命令行为与文档不符,可能是 omp marketplace cache 漂移:",
  "  1. cat ~/.omp/plugins/omp-plugins.lock.json  # 查 version + enabled",
  "  2. readlink ~/.omp/plugins/node_modules/sdd-pack  # 查 symlink 真实指向",
  "  3. 若版本不一致: omp plugin install sdd-pack --force  # 刷新 cache",
  "  4. 或绕过 slash command,直接用 bunx sdd <sub>  # ADR-019 新增 bin 入口",
  "",
  "外部项目(非 sdd-pack 仓库)优先用 bunx sdd <sub>(真 CLI,不依赖 omp cache)。",
].join("\n");

const DOCS_UPDATE_HINT =
  "💡 docs-update-guard [hook]: 检测到 commit 命令。如果本次改动触及 docs/ 请确认 PRD↔Phase 双向引用已更新(skill://sdd)。";

const LORE_COMMIT_BLOCK_REASON = [
  "🚫 lore-commit-guard [hook]: bash 中禁止 `git commit` / `lore commit`(ADR-020)。",
  "",
  "提交的唯一入口是 `/sdd gate commit` slash command 或 `sdd_gate` tool——",
  "走 handleGateCommit → runCommit → spawnSync('lore commit'),不经 bash tool_call。",
  "",
  "完整门禁流水线:",
  "  1. /sdd gate lint         # lint 门禁(block=exit 2, fail=exit 1)",
  "  2. /sdd gate test         # 功能验证(可选,缺则 skip)",
  "  3. spawn reviewer agent    # 审查 staged diff,写 .sdd/review/staged.reviewer.json",
  "                              # reviewer 字段必须是 'reviewer'(不是 'self-review')",
  "                              # staged_hash 必须自动填充(不留空)",
  "  4. /sdd gate review       # 检查 review 产物(缺则 block)",
  "  5. /sdd gate precommit    # 再跑 lint + lore 约束检查",
  '  6. /sdd gate commit --message \'{"intent":"...","trailers":{}}\'  # 或 --message-file <path> 指向 JSON 文件',
  "",
  "lint 命令在 .sdd/gate.json 配置;无配置时自动检测项目类型(vp check / cargo clippy / go vet 等)。",
].join("\n");

const DOC_EDIT_GUIDANCE_DOC = [
  "📝 sdd-doc-edit-guard [hook]: 检测到写 docs/ 目录。",
  "   docs/ 写入请走 skill://sdd 流程:",
  "   - 新需求 → skill://sdd → spec → PRD → Phase",
  "   - PRD 修改 → skill://sdd",
  "   - Phase 任务 → skill://sdd",
].join("\n");

const DOC_EDIT_GUIDANCE_PHASE = [
  "📝 sdd-doc-edit-guard [hook]: 检测到写 docs/phase/ 目录。",
  "   Phase 写入请走 skill://sdd 流程。Phase 归档用 /sdd phase-archive（ADR-017）。",
].join("\n");

const DOC_EDIT_GUIDANCE_ARCH_REF = [
  "📝 sdd-doc-edit-guard [hook]: 检测到写 docs/architecture/ 或 docs/reference/ 目录。",
  "   架构文档变更需同步 ADR（docs/architecture/decisions.md）;参考文档变更请确保引用路径有效。",
].join("\n");

const STATUS_LINE_BLOCK_REASON = [
  "🚫 sdd-status-line-guard [hook] 禁止直接编辑 PRD/Phase 状态行:",
  "状态行必须通过 /sdd <transition> 命令流转,不可直接 edit。",
  "可用命令: /sdd init/review/approve/plan/start/archive/back/phase/sync",
].join("\n");

// --- 辅助函数 ---

// 提取 effective severity(环境变量 SDD_VALIDATE_SEVERITY)
function getValidateSeverity(): CheckSeverity {
  const sev = process.env.SDD_VALIDATE_SEVERITY;
  if (sev === "warn" || sev === "error" || sev === "block") return sev;
  return "warn";
}

// in-process 调 api.validateDocs()
async function runSddValidate(pi: ExtensionAPI): Promise<void> {
  try {
    const files = stagedFiles();
    if (files.length === 0) return;
    const result = await validateDocs({ staged: true, files, severity: getValidateSeverity() });
    if (result.status === "block") {
      pi.sendMessage({
        role: "system",
        content: `🚫 sdd validate 硬拦截:\n${result.errors.join("\n")}`,
      });
    } else if (result.status === "error") {
      pi.sendMessage({
        role: "system",
        content: `⚠ sdd validate 错误(灰度阶段,仅警告):\n${result.errors.join("\n")}`,
      });
    }
  } catch (e) {
    pi.sendMessage({
      role: "system",
      content: `⚠ sdd validate 异常(已跳过): ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

// 调 runReview 检查 reviewer 产物,返回 block result 或 null
function runLoreReviewGate(): ToolCallBlockResult | null {
  const result = runReview(process.cwd());
  if (result.status === "block") {
    return {
      block: true,
      reason: `🚫 /sdd gate review 硬拦截:\n${result.message ?? "reviewer 产物缺失或未通过"}`,
    };
  }
  return null;
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("sdd", {
    description: "SDD 主命令(ADR-018): /sdd <init|review|approve|back|plan|start|archive|phase|phase-archive|status|sync|list|why|apply|validate|propose|migrate|gate> [args]",
    handler: handleSdd,
  });

  // ===== session_start — 注入 lore protocol + SDD command + 版本探测 reminder =====
  pi.on("session_start", (_e) => {
    pi.sendMessage({ role: "system", content: LORE_PROTOCOL_REMINDER });
    pi.sendMessage({ role: "system", content: SDD_COMMAND_REMINDER });
    pi.sendMessage({ role: "system", content: SDD_VERSION_PROBE_REMINDER });
  });

  // ===== tool_call — commit 硬拦截 + docs/ 写入提示 =====
  pi.on("tool_call", async (e) => {
    const ev = e as ToolCallEvent;
    const toolName = ev.toolName;
    const input = ev.input ?? {};

    if (toolName === "bash" && (isGitCommit(input) || isLoreCommit(input))) {
      const cmd = typeof input["command"] === "string" ? (input["command"] as string) : "";
      const isLore = isLoreCommit(input);
      // isGit 需排除 lore commit 的情况(lore commit 内部可能含 git commit 字样)
      const isGit = isGitCommit(input) && !isLore;
      pi.sendMessage({ role: "system", content: DOCS_UPDATE_HINT });

      if (isGit) {
        return {
          block: true,
          reason:
            "🚫 lore-commit-guard [hook] 禁止 `git commit`(任意 flag):\n`git commit` 绕过 lore trailer + SDD 上下文,本插件硬拦截。\n请改用 `lore commit`(或先跑 `/sdd gate lint` -> reviewer -> `/sdd gate commit` 流水线)。",
        };
      }

      if (isLore && /(?:^|\s)--amend(?:\s|$)/.test(cmd)) {
        return; // lore commit --amend 放行
      }

      pi.sendMessage({ role: "system", content: LORE_COMMIT_BLOCK_REASON });
      await runSddValidate(pi);
      const reviewBlock = runLoreReviewGate();
      if (reviewBlock) return reviewBlock;
      return;
    }

    // ===== PRD/Phase 状态行硬拦截(PRD §2.6) =====
    if ((toolName === "write" || toolName === "edit") && touchesStatusLine(input, toolName)) {
      // docs/index.md 不拦截
      const path = String(input.path ?? input.filePath ?? "");
      if (!path.includes("docs/index.md")) {
        return { block: true, reason: STATUS_LINE_BLOCK_REASON };
      }
    }

    if (toolName === "write" || toolName === "edit") {
      const path = typeof input["path"] === "string" ? input["path"] : "";
      if (path.includes("/phase/") || path.startsWith("docs/phase/")) {
        pi.sendMessage({ role: "system", content: DOC_EDIT_GUIDANCE_PHASE });
      } else if (path.includes("/architecture/") || path.includes("/reference/") ||
                 path.startsWith("docs/architecture/") || path.startsWith("docs/reference/")) {
        pi.sendMessage({ role: "system", content: DOC_EDIT_GUIDANCE_ARCH_REF });
      } else if (isDocWritePath(input)) {
        pi.sendMessage({ role: "system", content: DOC_EDIT_GUIDANCE_DOC });
      }
    }
  });

  // ===== ADR-019 Step 12: 注册 18 个 sdd_* omp tool（绕过 slash command cache 漂移）=====
  // pi.registerTool 在 omp 17.0+ 可用；旧版本静默跳过（仍走 slash command）
  if (typeof pi.registerTool === "function") {
    registerSddTools(pi as Parameters<typeof registerSddTools>[0]);
  }
}
