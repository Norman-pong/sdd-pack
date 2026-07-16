/**
 * openspec-extension handler smoke test
 *
 * 7 个 slash command 的 handler 单元测试 + tool_call 拦截测试
 */

import { describe, expect, test } from "bun:test";

import factory from "./index";

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

// ===== 7 个 slash command 注册 =====

describe("openspec-extension — 7 slash command 注册", () => {
  test("注册 7 个 command", () => {
    expect(captured.length).toBe(7);
    const names = captured.map((c) => c.name).sort();
    expect(names).toEqual([
      "openspec-archive",
      "openspec-init-check",
      "openspec-instructions",
      "openspec-list",
      "openspec-show",
      "openspec-status",
      "openspec-validate",
    ]);
  });

  test("每个 handler 都有 description", () => {
    for (const c of captured) {
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});

// ===== tool_call 硬拦截测试 =====

describe("openspec-extension — tool_call git commit 硬拦截", () => {
  test("git commit -m 返回 block + reason", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    const result = await h({ toolName: "bash", input: { command: "git commit -m 'test'" } });
    expect(result).toBeDefined();
    if (result && typeof result === "object" && "block" in result) {
      expect(result.block).toBe(true);
    }
  });

  test("git commit --amend 也 block", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    const result = await h({ toolName: "bash", input: { command: "git commit --amend" } });
    expect(result).toBeDefined();
    if (result && typeof result === "object" && "block" in result) {
      expect(result.block).toBe(true);
    }
  });

  test("git commit-tree 不误拦", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    const result = await h({ toolName: "bash", input: { command: "git commit-tree HEAD -m 'x'" } });
    expect(result).toBeUndefined();
  });
});

describe("openspec-extension — tool_call lore commit", () => {
  test("lore commit --amend 放行(返回 undefined)", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    const result = await h({ toolName: "bash", input: { command: "lore commit --amend --no-edit" } });
    expect(result).toBeUndefined();
  });
});

describe("openspec-extension — tool_call openspec/ 路径提示", () => {
  test("write + openspec/specs/ 路径触发 spec-guard", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    await h({ toolName: "write", input: { path: "openspec/specs/auth/spec.md" } });
    expect(capturedMessages.some((m) => m.content.includes("openspec-spec-guard"))).toBe(true);
  });

  test("write + openspec/changes/ 路径触发 change-guard", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    await h({ toolName: "write", input: { path: "openspec/changes/001/proposal.md" } });
    expect(capturedMessages.some((m) => m.content.includes("openspec-change-guard"))).toBe(true);
  });

  test("write + AGENTS.md 触发 agents-guard", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    await h({ toolName: "write", input: { path: "AGENTS.md" } });
    expect(capturedMessages.some((m) => m.content.includes("openspec-agents-guard"))).toBe(true);
  });

  test("write + 非 openspec/ 路径不触发", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("tool_call");
    await h({ toolName: "write", input: { path: "src/foo.ts" } });
    expect(capturedMessages.some((m) => m.content.includes("openspec-"))).toBe(false);
  });
});

describe("openspec-extension — session_start", () => {
  test("触发 session_start 注入 OPENSPEC_REMINDER", async () => {
    capturedMessages.length = 0;
    const h = getEventHandler("session_start");
    await h({});
    expect(capturedMessages.some((m) => m.content.includes("OpenSpec Harness reminder"))).toBe(true);
  });
});
