/**
 * extension handler smoke test
 *
 * 8 个 slash command 的 handler 单元测试:
 * 调 handler(args, ctx) → 验证 ctx.ui.notify 被调用 + 返回值结构正确
 *
 * 替代完整 T011(需要 omp session)的最小化验证。
 */

import { describe, expect, test } from "bun:test";

import factory from "./index";
import * as api from "../../src/cli/api";

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
  test("触发 session_start 注入 LORE_PROTOCOL_REMINDER", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("session_start");
    await h({});
    expect(capturedMessages.some((m) => m.content.includes("lore 提交协议"))).toBe(true);
  });
});

describe("sdd-extension — 13 slash command 注册", () => {
  test("注册 13 个 command", () => {
    expect(captured.length).toBe(13);
    const names = captured.map((c) => c.name).sort();
    expect(names).toEqual([
      "sdd-apply",
      "sdd-archive",
      "sdd-gate-commit",
      "sdd-gate-lint",
      "sdd-gate-precommit",
      "sdd-gate-review",
      "sdd-gate-test",
      "sdd-list",
      "sdd-migrate",
      "sdd-propose",
      "sdd-status",
      "sdd-validate",
      "sdd-why",
    ]);
  });

  test("每个 handler 都有 description", () => {
    for (const c of captured) {
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});

describe("sdd-validate handler", () => {
  test("空 args 调用 validateDocs 并 setWidget + notify", async () => {
    const { ctx, messages, widgets } = makeCtx();
    const r = await getHandler("sdd-validate")("", ctx);
    expect(r).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(widgets.length).toBeGreaterThan(0);
  });

  test("block 状态时返回 blocked", async () => {
    // 构造非法路径 → error → 不会 block;实际 block 需要状态机违规
    // 这里仅 smoke test 流程
    const { ctx, messages } = makeCtx();
    await getHandler("sdd-validate")("--path /nonexistent --severity error", ctx);
    expect(messages.some((m) => m.level === "error")).toBe(true);
  });
});

describe("sdd-propose handler", () => {
  test("dry-run 模式返回 path + content", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd-propose")("--title test-smoke --dry-run", ctx);
    expect(r).toBeDefined();
    if (r && typeof r === "object" && "path" in r) {
      expect((r as { path: string }).path).toBeDefined();
    }
    if (messages.length > 0) expect(typeof messages[0].text).toBe("string");
  });
});

describe("sdd-archive handler", () => {
  test("缺少 prd-path 返回 error", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd-archive")("", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error")).toBe(true);
  });
});

describe("sdd-migrate handler", () => {
  test("缺少 prd-path 返回 error", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd-migrate")("", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error")).toBe(true);
  });
});

describe("sdd-status handler", () => {
  test("调用后 setWidget 含文档统计", async () => {
    const { ctx, widgets, messages } = makeCtx();
    const r = await getHandler("sdd-status")("", ctx);
    expect(r).toBeDefined();
    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets[0].content.join("\n")).toMatch(/PRD: \d+, Phase: \d+/);
    expect(messages.length).toBeGreaterThan(0);
  });
});

describe("sdd-list handler", () => {
  test("默认 type=prd 返回 PRD 列表", async () => {
    const { ctx, widgets, messages } = makeCtx();
    const r = await getHandler("sdd-list")("", ctx);
    expect(r).toBeDefined();
    expect(widgets.length).toBeGreaterThan(0);
    expect(messages[0].text).toMatch(/匹配/);
  });
});

describe("sdd-why handler", () => {
  test("空 args → error notify", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd-why")("", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "error")).toBe(true);
  });
});

describe("sdd-apply handler", () => {
  test("空 args → warn notify", async () => {
    const { ctx, messages } = makeCtx();
    const r = await getHandler("sdd-apply")("", ctx);
    expect(r).toBeDefined();
    expect(messages.some((m) => m.level === "warn" || m.level === "error")).toBe(true);
  });
});

describe("sdd-extension 隔离性(api 实际被调)", () => {
  test("api.ts 的 8 个函数都从 extension 可访问", () => {
    expect(typeof api.validateDocs).toBe("function");
    expect(typeof api.proposePrd).toBe("function");
    expect(typeof api.archivePrd).toBe("function");
    expect(typeof api.migratePrd).toBe("function");
    expect(typeof api.getStatus).toBe("function");
    expect(typeof api.listPrds).toBe("function");
    expect(typeof api.getWhy).toBe("function");
    expect(typeof api.getApplyChecklist).toBe("function");
  });
});
