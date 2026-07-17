/**
 * extension handler smoke test
 *
 * 8 个 slash command 的 handler 单元测试:
 * 调 handler(args, ctx) → 验证 ctx.ui.notify 被调用 + 返回值结构正确
 *
 * 替代完整 T011(需要 omp session)的最小化验证。
 */

import { describe, expect, mock, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Mock gate handlers before importing factory (prevents recursive bun test)
mock.module("./gate-handlers", () => {
  function gateMock(stage: string, _a: string, ctx: unknown): { status: string; stage: string } {
    if (ctx && typeof ctx === "object" && "ui" in ctx) {
      const ui = (ctx as Record<string, unknown>).ui;
      if (ui && typeof ui === "object" && "notify" in ui) {
        (ui as { notify: (t: string, l: string) => void }).notify(`gate ${stage}: pass`, "info");
      }
    }
    return { status: "pass", stage };
  }
  return {
    handleGateLint: (a: string, ctx: unknown) => gateMock("lint", a, ctx),
    handleGateTest: (a: string, ctx: unknown) => gateMock("test", a, ctx),
    handleGateReview: (a: string, ctx: unknown) => gateMock("review", a, ctx),
    handleGatePrecommit: (a: string, ctx: unknown) => gateMock("precommit", a, ctx),
    handleGateCommit: (a: string, ctx: unknown) => gateMock("commit", a, ctx),
  };
});

import factory from "./index";
import * as api from "../../src/cli/api";
import { splitArgs } from "./ui-helpers";
import { parseArgs, getStringOption } from "../../src/cli/lib/orchestration/parseArgs";

// ===== mock ExtensionAPI =====
interface CapturedCommand {
  name: string;
  description: string;
  handler: (args: string, ctx: unknown) => Promise<unknown> | unknown;
}
interface CapturedHandler {
  event: string;
  handler: (e: unknown) => void | Promise<unknown>;
}
interface CapturedMessage {
  role: "system" | "user";
  content: string;
}
const captured: CapturedCommand[] = [];
const capturedHandlers: CapturedHandler[] = [];
const capturedMessages: CapturedMessage[] = [];
const mockPi = {
  registerCommand(name: string, def: { description: string; handler: CapturedCommand["handler"] }) {
    captured.push({ name, description: def.description, handler: def.handler });
  },
  on(event: string, handler: (e: unknown) => void | Promise<unknown>) {
    capturedHandlers.push({ event, handler });
  },
  sendMessage(msg: { role: "system" | "user"; content: string }) {
    capturedMessages.push(msg);
  },
};

// ===== mock ctx =====
function makeCtx() {
  const messages: Array<{ level: string; text: string }> = [];
  const widgets: Array<{ key: string; content: string[] }> = [];
  return {
    messages,
    widgets,
    ctx: {
      ui: {
        notify(text: string, level: "info" | "warn" | "error" | "warning" = "info") {
          messages.push({ level, text });
        },
        setWidget(key: string, content: string[]) {
          widgets.push({ key, content });
        },
      },
    },
  };
}

factory(mockPi as Parameters<typeof factory>[0]);

// ===== 测试隔离: 状态流转子命令会写 docs/ 与 .sdd/meta,必须在临时仓库中运行 =====
// 防止污染真实仓库(beforeAll 建最小 docs/prd + index.md + meta 目录,chdir 进去)
const ORIGINAL_CWD = process.cwd();
let TEST_REPO = "";

beforeAll(() => {
  TEST_REPO = realpathSync(mkdtempSync(resolve(tmpdir(), "sdd-ext-test-")));
  mkdirSync(resolve(TEST_REPO, "docs", "prd"), { recursive: true });
  mkdirSync(resolve(TEST_REPO, "docs", "phase"), { recursive: true });
  mkdirSync(resolve(TEST_REPO, ".sdd", "meta", "prd"), { recursive: true });
  mkdirSync(resolve(TEST_REPO, ".sdd", "meta", "phase"), { recursive: true });
  writeFileSync(
    resolve(TEST_REPO, "docs", "index.md"),
    `# 项目文档索引\n\n## 产品需求文档（PRD）\n\n| 日期 | 文档名称 | 状态 | 对应 Phase | 说明 |\n| ---- | -------- | ---- | ---------- | ---- |\n\n## 阶段文档（Phase）\n\n| 日期 | 阶段名称 | 状态 | 对应 PRD | 说明 |\n| ---- | -------- | ---- | -------- | ---- |\n`,
  );
  process.chdir(TEST_REPO);
});

afterAll(() => {
  process.chdir(ORIGINAL_CWD);
  if (TEST_REPO) rmSync(TEST_REPO, { recursive: true, force: true });
});

function getHandler(name: string): CapturedCommand["handler"] {
  const c = captured.find((x) => x.name === name);
  if (!c) throw new Error(`未注册 command: ${name}`);
  return c.handler;
}

function getEventHandler(event: string): (e: unknown) => Promise<unknown> {
  const h = capturedHandlers.find((x) => x.event === event);
  if (!h) throw new Error(`未注册 event: ${event}`);
  return h.handler as (e: unknown) => Promise<unknown>;
}


// ===== splitArgs 单元测试(引号保留) =====

describe("splitArgs — 引号保留", () => {
  test("双引号多词 → 单 token", () => {
    expect(splitArgs('--title "My PRD Title"')).toEqual(["--title", "My PRD Title"]);
  });

  test("单引号多词 → 单 token", () => {
    expect(splitArgs("--title 'My PRD Title'")).toEqual(["--title", "My PRD Title"]);
  });

  test("反斜杠转义空格 → 单 token", () => {
    expect(splitArgs("--title My\\ PRD")).toEqual(["--title", "My PRD"]);
  });

  test("混合: 引号 + positional", () => {
    expect(splitArgs('init --title "My PRD" extra')).toEqual(["init", "--title", "My PRD", "extra"]);
  });
});

// ===== parseArgs token 保留测试 =====

describe("parseArgs — token 边界保留", () => {
  test("引号多词 option → 完整值", () => {
    const tokens = splitArgs('--title "My PRD Title"');
    const opts = parseArgs(tokens);
    expect(getStringOption(opts, "title")).toBe("My PRD Title");
  });

  test("positional 多词 → 拼接", () => {
    const tokens = splitArgs("My PRD Title");
    const opts = parseArgs(tokens);
    expect(opts.positional.join(" ")).toBe("My PRD Title");
  });
});

// ===== tool_call 硬拦截测试 =====

describe("sdd-extension — tool_call git commit 硬拦截", () => {
  test("git commit -m 返回 block + reason + 发 DOCS_UPDATE_HINT", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    const result = await h({ toolName: "bash", input: { command: "git commit -m 'test'" } });
    expect(result).toBeDefined();
    if (result && typeof result === "object" && "block" in result) {
      expect(result.block).toBe(true);
    }
    expect(capturedMessages.some((m) => m.content.includes("docs-update-guard"))).toBe(true);
  });

  test("git commit --amend 也 block(amend 例外只对 lore commit)", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    const result = await h({ toolName: "bash", input: { command: "git commit --amend" } });
    expect(result).toBeDefined();
    if (result && typeof result === "object" && "block" in result) {
      expect(result.block).toBe(true);
    }
  });

  test("git commit -S/-a/--no-verify 全部 block", async () => {
    const h = getEventHandler("tool_call");
    for (const flag of ["-S", "-a", "--no-verify"]) {
      capturedMessages.length = 0;
      const result = await h({ toolName: "bash", input: { command: `git commit ${flag} -m 'x'` } });
      expect(result).toBeDefined();
      if (result && typeof result === "object" && "block" in result) {
        expect(result.block).toBe(true);
      }
    }
  });

  test("git commit-tree / git commit-graph 不误拦", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    const r1 = await h({ toolName: "bash", input: { command: "git commit-tree HEAD -m 'x'" } });
    const r2 = await h({ toolName: "bash", input: { command: "git commit-graph write" } });
    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
  });
});

describe("sdd-extension — tool_call lore commit", () => {
  test("lore commit --amend 放行(返回 undefined)", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    const result = await h({ toolName: "bash", input: { command: "lore commit --amend --no-edit" } });
    expect(result).toBeUndefined();
  });

  test("lore commit(非 amend)发 LORE_COMMIT_BLOCK_REASON message", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    await h({ toolName: "bash", input: { command: "lore commit --intent test" } });
    expect(capturedMessages.some((m) => m.content.includes("lore-commit-guard"))).toBe(true);
  });
});

describe("sdd-extension — tool_call docs/ 写入提示", () => {
  test("write + docs/ 路径触发 sdd-doc-edit-guard", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    await h({ toolName: "write", input: { path: "docs/architecture/overview.md" } });
    expect(capturedMessages.some((m) => m.content.includes("sdd-doc-edit-guard"))).toBe(true);
  });

  test("write + 非 docs/ 路径不触发", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    await h({ toolName: "write", input: { path: "src/foo.ts" } });
    expect(capturedMessages.some((m) => m.content.includes("sdd-doc-edit-guard"))).toBe(false);
  });
});

describe("sdd-extension — session_start", () => {
  test("触发 session_start 注入 LORE_PROTOCOL_REMINDER + SDD_COMMAND_REMINDER", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("session_start");
    await h({});
    expect(capturedMessages.some((m) => m.content.includes("lore 提交协议"))).toBe(true);
    expect(capturedMessages.some((m) => m.content.includes("SDD 文档状态流转协议"))).toBe(true);
    expect(capturedMessages.some((m) => m.content.includes("/sdd sync"))).toBe(true);
  });
});

describe("sdd-extension - 1 slash command 注册", () => {
  test("注册 1 个 command(sdd 主命令)", () => {
    expect(captured.length).toBe(1);
    expect(captured[0].name).toBe("sdd");
  });

  test("handler 有 description", () => {
    expect(captured[0].description.length).toBeGreaterThan(0);
  });
});


describe("/sdd sync 子命令", () => {
  test("sync 调用 syncMeta 并 setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("sync", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
  test("sync --fix 调用 syncMeta 并 setWidget", async () => {
    const { ctx, widgets } = makeCtx();
    const r = await getHandler("sdd")("sync --fix", ctx);
    expect(r).toBeDefined();
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
});

describe("/sdd list 子命令", () => {
  test("默认 type=prd 返回 PRD 列表", async () => {
    const { ctx, widgets, messages } = makeCtx();
    const r = await getHandler("sdd")("list", ctx);
    expect(r).toBeDefined();
    expect(widgets.length).toBeGreaterThan(0);
    expect(messages[0].text).toMatch(/匹配/);
  });
});

describe("/sdd why 子命令", () => {
  test("空 args → error notify", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd")("why", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error")).toBe(true);
  });
});

describe("/sdd apply 子命令", () => {
  test("空 args → error notify", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd")("apply", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" || m.level === "warn")).toBe(true);
  });
});

describe("/sdd validate 子命令", () => {
  test("空 args 调用 validateDocs 并 setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("validate", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
  });
});

describe("/sdd gate 子命令", () => {
  test("缺少 stage → error + setWidget", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("gate", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("stage invalid → error + setWidget", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("gate invalid", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("gate lint 转发到 handleGateLint", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd")("gate lint", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
  });
});

describe("/sdd status 子命令", () => {
  test("status → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("status", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
});

describe("/sdd 主命令路由", () => {
  test("空 args → 显示用法(含新子命令)", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd")("", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.text.includes("用法"))).toBe(true);
  });
  test("未知子命令 → error", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd")("unknown-sub", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("未知子命令"))).toBe(true);
  });
  test("init 子命令缺少 title → error + setWidget", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("init", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("back 缺少 --to → error + setWidget(不调用 API)", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("back", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("back --to reviewed → error + setWidget(非法值,不调用 API)", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("back --to reviewed", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("back --to draft → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("back --to draft", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
  test("back --to pending → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("back --to pending", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
  test("review 子命令 → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("review", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
  test("approve 子命令 → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("approve", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
});

describe("/sdd plan 子命令", () => {
  test("缺少 --phase 和 --link → error + setWidget", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("plan", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("--phase <title> → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")('plan --phase "Phase 1"', ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
  test("--link <phase-id> → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("plan --link phase-001", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
});

describe("/sdd start 子命令", () => {
  test("start → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("start", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
});

describe("/sdd archive 子命令", () => {
  test("缺少 --reason → error + setWidget", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("archive", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("--reason invalid → error + setWidget", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("archive --reason invalid", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("--reason completed → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("archive --reason completed", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
  test("--reason abandoned → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("archive --reason abandoned", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
});

describe("/sdd phase 子命令", () => {
  test("缺少 action → error + setWidget", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("phase", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("action invalid → error + setWidget", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("phase invalid", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error" && m.text.includes("用法"))).toBe(true);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
    expect(widgets[0].content.join("\n")).toContain("usage");
  });
  test("phase start → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("phase start", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
  test("phase complete → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("phase complete", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
  test("phase abandon → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("phase abandon", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
  test("phase start --id phase-001 → setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd")("phase start --id phase-001", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].key).toBe("sdd-display");
  });
});

describe("sdd-extension — tool_call 状态行硬拦截", () => {
  test("write PRD 文件含状态行 → block", async () => {
    const handler = getEventHandler("tool_call");
    const r = await handler({
      toolName: "write",
      input: {
        path: "docs/prd/2026-07-16-test.md",
        content: "# PRD\n\n> 状态：已批准\n",
      },
    });
    expect(r).toBeDefined();
    expect((r as { block?: boolean }).block).toBe(true);
    expect((r as { reason?: string }).reason).toContain("状态行必须通过");
  });

  test("write Phase 文件含状态行 → block", async () => {
    const handler = getEventHandler("tool_call");
    const r = await handler({
      toolName: "write",
      input: {
        path: "docs/phase/prd-001/001-foundation.md",
        content: "# Phase\n\n> 状态：进行中\n",
      },
    });
    expect(r).toBeDefined();
    expect((r as { block?: boolean }).block).toBe(true);
    expect((r as { reason?: string }).reason).toContain("状态行必须通过");
  });

  test("edit PRD 文件新增状态行 → block", async () => {
    const handler = getEventHandler("tool_call");
    const r = await handler({
      toolName: "edit",
      input: {
        path: "docs/prd/2026-07-16-test.md",
        body: "+> 状态：已批准\n",
      },
    });
    expect(r).toBeDefined();
    expect((r as { block?: boolean }).block).toBe(true);
    expect((r as { reason?: string }).reason).toContain("状态行必须通过");
  });

  test("edit PRD 文件修改状态行 → block", async () => {
    const handler = getEventHandler("tool_call");
    const r = await handler({
      toolName: "edit",
      input: {
        path: "docs/prd/2026-07-16-test.md",
        new_string: "+> 状态：已批准\n",
      },
    });
    expect(r).toBeDefined();
    expect((r as { block?: boolean }).block).toBe(true);
    expect((r as { reason?: string }).reason).toContain("状态行必须通过");
  });

  test("write 非 PRD/Phase 文件含状态行 → 不 block", async () => {
    const handler = getEventHandler("tool_call");
    const r = await handler({
      toolName: "write",
      input: {
        path: "docs/architecture/overview.md",
        content: "# Arch\n\n> 状态：稳定\n",
      },
    });
    expect(r).toBeUndefined();
  });

  test("write PRD 文件不含状态行 → 不 block", async () => {
    const handler = getEventHandler("tool_call");
    const r = await handler({
      toolName: "write",
      input: {
        path: "docs/prd/2026-07-16-test.md",
        content: "# PRD\n\n## 1. 背景\n",
      },
    });
    expect(r).toBeUndefined();
  });

  test("edit PRD 文件不含状态行 → 不 block", async () => {
    const handler = getEventHandler("tool_call");
    const r = await handler({
      toolName: "edit",
      input: {
        path: "docs/prd/2026-07-16-test.md",
        body: "+## 2. 新章节\n",
      },
    });
    expect(r).toBeUndefined();
  });

  test("write docs/index.md 含状态行 → 不 block", async () => {
    const handler = getEventHandler("tool_call");
    const r = await handler({
      toolName: "write",
      input: {
        path: "docs/index.md",
        content: "# Index\n\n> 状态：活跃\n",
      },
    });
    expect(r).toBeUndefined();
  });

  test("bash 命令 → 不 block(非 write/edit)", async () => {
    const handler = getEventHandler("tool_call");
    const r = await handler({
      toolName: "bash",
      input: {
        command: "echo '> 状态：已批准' > docs/prd/test.md",
      },
    });
    expect(r).toBeUndefined();
  });
});

describe("sdd-extension 隔离性(api 实际被调)", () => {
  test("api.ts 的 14 个函数都从 extension 可访问", () => {
    expect(typeof api.validateDocs).toBe("function");
    expect(typeof api.proposePrd).toBe("function");
    expect(typeof api.archivePrd).toBe("function");
    expect(typeof api.migratePrd).toBe("function");
    expect(typeof api.getStatus).toBe("function");
    expect(typeof api.listPrds).toBe("function");
    expect(typeof api.getWhy).toBe("function");
    expect(typeof api.getApplyChecklist).toBe("function");
    expect(typeof api.initPrd).toBe("function");
    expect(typeof api.reviewPrd).toBe("function");
    expect(typeof api.approvePrd).toBe("function");
    expect(typeof api.backPrd).toBe("function");
    expect(typeof api.syncMeta).toBe("function");
    expect(typeof api.rebuildMeta).toBe("function");
  });
});

describe("/sdd 主命令路由", () => {
  test("空 args → 显示用法", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd")("", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.text.includes("用法"))).toBe(true);
  });
});
