// hooks/openspec/index.ts — OpenSpec Harness 守卫 hook
// 装载: omp --hook plugins/sdd-pack/hooks/openspec/index.ts
// 决策: docs/architecture/decisions.md ADR-011 (OpenSpec 作为 hook 默认实现 + 可选入口)
//
// 设计原则(对称 hooks/sdd/index.ts SDD 版本):
// - 不写 omp.hooks manifest 字段(omp 16.1.16 不识别)
// - 不依赖 @oh-my-pi/pi-coding-agent 类型(unknown 兜底)
// - 单文件聚合 3 个 hook(session_start + tool_call 双分支)
// - 严格 type-only: 无 any,无 as any
//
// 拦截行为(对应 docs/reference/openspec-harness.md 阻断行为):
// 1. session_start — 注入 OpenSpec 工作流 reminder(模拟 alwaysApply)
// 2. tool_call + bash + commit → runs openspec-api validate + status gate
// 3. tool_call + write|edit + 路径 = openspec/specs/** 或 openspec/changes/**
//    → 提示走 /openspec-* slash command 或 openspec CLI
// 4. tool_call + write|edit + 路径 = AGENTS.md → 提示走 OpenSpec lifecycle
//    (OpenSpec init 后 AGENTS.md 由 openspec/AGENTS.md 接管,绕过 OpenSpec
//    修改需经过 /openspec-archive 或受控变更)

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

// ===== 类型守卫 =====

function isCommitCommand(input: Record<string, unknown>): boolean {
  const cmd = input["command"];
  if (typeof cmd !== "string") return false;
  return /\b(git|lore)\s+commit\b/.test(cmd);
}

function isOpenSpecSpecPath(input: Record<string, unknown>): boolean {
  const path = input["path"];
  if (typeof path !== "string") return false;
  return /(^|\/)openspec\/specs\//.test(path);
}

function isOpenSpecChangePath(input: Record<string, unknown>): boolean {
  const path = input["path"];
  if (typeof path !== "string") return false;
  return /(^|\/)openspec\/changes\//.test(path);
}

function isRootAgentsMd(input: Record<string, unknown>): boolean {
  const path = input["path"];
  if (typeof path !== "string") return false;
  return path === "AGENTS.md" || path.endsWith("/AGENTS.md");
}

// ===== 3 个 hook 的 message 常量 =====

const OPENSPEC_REMINDER = [
  "📜 OpenSpec Harness reminder (alwaysApply):",
  "",
  "1. 启用判定: openspec/specs/ + openspec/changes/ + openspec/AGENTS.md 全部存在",
  "2. 修改前: `openspec list` 看活动变更,`openspec show <change-id>` 看详情",
  "3. 提交前: `/openspec-validate` + `/openspec-status`(本 hook 自动跑)",
  "4. 规范更新走 /openspec-archive 或 OpenSpec CLI,不要 raw 编辑",
  "5. 本提醒来自 sdd-pack v1.5.0-alpha OpenSpec hook(ADR-011)",
].join("\n");

const RAW_SPEC_WRITE_WARNING = [
  "⚠ openspec-spec-guard [hook]: 检测到直接写入 openspec/specs/**",
  "   OpenSpec 工作流: 编辑应走 change proposal 路径",
  "   → /openspec-show <change-id>  → 编辑 specs/<area>/spec.md delta",
  "   → /openspec-archive          → 合并 delta 回 openspec/specs/",
].join("\n");

const RAW_CHANGE_WRITE_WARNING = [
  "⚠ openspec-change-guard [hook]: 检测到直接写入 openspec/changes/<id>/**",
  "   OpenSpec 生命周期: 通过 slash command 创建/修改变更,不走 raw edit",
  "   → /openspec-list    → 找到现有变更",
  "   → /openspec-show    → 读 proposal/tasks/spec deltas",
  "   → /openspec-archive → 变更完成时归档",
].join("\n");

const AGENTS_MD_GUARD = [
  "⚠ openspec-agents-guard [hook]: 检测到直接编辑 AGENTS.md。",
  "   OpenSpec init 后,根 AGENTS.md 由 openspec/AGENTS.md 接管,",
  "   修改应走 OpenSpec 生命周期(/openspec-* 或 openspec CLI)而非 raw edit。",
  "   例外: 引入新 AI 工具时,可走 `openspec update` 刷新子工具绑定。",
].join("\n");

// ===== OpenSpec 守卫 gate:在 commit 时跑 validate + status =====
import { spawnSync } from "node:child_process";

async function runOpenSpecGate(pi: HookAPI): Promise<void> {
  try {
    const v = spawnSync(
      "bun",
      ["run", "plugins/sdd-pack/src/cli/openspec-api-runner.ts", "validate"],
      {
        cwd: process.cwd(),
      },
    );
    if (v.status === 1) {
      pi.sendMessage({
        role: "system",
        content: `🚫 OpenSpec validate 失败:\n${v.stdout?.toString() ?? ""}${v.stderr?.toString() ?? ""}`,
      });
    } else if (v.status === 2) {
      pi.sendMessage({
        role: "system",
        content: `⚠ OpenSpec 未初始化,跳过 validate(status=2)`,
      });
    } else if (v.status !== 0) {
      pi.sendMessage({
        role: "system",
        content: `⚠ OpenSpec validate gate 异常(exit=${v.status})`,
      });
    }
    const s = spawnSync(
      "bun",
      ["run", "plugins/sdd-pack/src/cli/openspec-api-runner.ts", "status"],
      {
        cwd: process.cwd(),
      },
    );
    if (s.status === 1) {
      pi.sendMessage({
        role: "system",
        content: `🚫 OpenSpec status 失败:\n${s.stdout?.toString() ?? ""}${s.stderr?.toString() ?? ""}`,
      });
    }
  } catch (e) {
    pi.sendMessage({
      role: "system",
      content: `⚠ OpenSpec gate 异常(已跳过): ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

// ===== 入口 =====
export default function (pi: HookAPI): void {
  // (1) session_start — 注入 OpenSpec reminder
  pi.on("session_start", (_e) => {
    pi.sendMessage({ role: "system", content: OPENSPEC_REMINDER });
  });

  // (2)/(3)/(4) tool_call — 单一 on + 内部分发
  pi.on("tool_call", async (e) => {
    const ev = e as ToolCallEvent;
    const toolName = ev.toolName;
    const input = ev.input ?? {};

    if (toolName === "bash" && isCommitCommand(input)) {
      await runOpenSpecGate(pi);
      return;
    }

    if (toolName === "write" || toolName === "edit") {
      if (isOpenSpecSpecPath(input))
        pi.sendMessage({ role: "system", content: RAW_SPEC_WRITE_WARNING });
      else if (isOpenSpecChangePath(input))
        pi.sendMessage({ role: "system", content: RAW_CHANGE_WRITE_WARNING });
      else if (isRootAgentsMd(input)) pi.sendMessage({ role: "system", content: AGENTS_MD_GUARD });
    }
  });
}
