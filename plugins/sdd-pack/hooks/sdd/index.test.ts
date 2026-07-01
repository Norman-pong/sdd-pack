/**
 * SDD 范式 hook 行为测试
 *
 * 4 hook + 1 内部门控:
 * 1. session_start → 注入 LORE_PROTOCOL_REMINDER
 * 2. tool_call + bash + commit → DOCS_UPDATE_HINT + LORE_COMMIT_BLOCK_REASON
 * 3. tool_call + bash + commit → runSddValidate(无 docs/ 改动则静默返回)
 * 4. tool_call + write|edit + docs/** → DOC_EDIT_GUIDANCE
 *
 * Mock 策略: 替换 HookAPI 的 on/sendMessage,捕获事件注册 + message 列表
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import factory from "./index";

interface CapturedHandler {
  event: string;
  handler: (e: unknown) => void | Promise<void>;
}

interface CapturedMessage {
  role: "system" | "user";
  content: string;
}

interface MockHookAPI {
  on: (event: string, handler: (e: unknown) => void | Promise<void>) => void;
  sendMessage: (msg: { role: "system" | "user"; content: string }) => void;
}

let handlers: CapturedHandler[];
let messages: CapturedMessage[];

function makeMockPi(): MockHookAPI {
  handlers = [];
  messages = [];
  return {
    on(event, handler) {
      handlers.push({ event, handler });
    },
    sendMessage(msg) {
      messages.push(msg);
    },
  };
}

function getHandler(event: string): (e: unknown) => Promise<void> {
  const h = handlers.find((x) => x.event === event);
  if (!h) throw new Error(`未注册 event: ${event}`);
  return h.handler as (e: unknown) => Promise<void>;
}

// ===== session_start =====

describe("sdd-hook — session_start", () => {
  beforeEach(() => {
    factory(makeMockPi());
  });

  test("注册 session_start handler", () => {
    expect(handlers.some((h) => h.event === "session_start")).toBe(true);
  });

  test("触发 session_start 注入 LORE_PROTOCOL_REMINDER", async () => {
    const h = getHandler("session_start");
    await h({});
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("lore 提交协议");
    expect(messages[0].content).toContain("SDD 范式");
  });
});

// ===== tool_call: bash + commit → docs-update-guard + lore-commit-guard =====

describe("sdd-hook — tool_call bash + git commit", () => {
  beforeEach(() => {
    factory(makeMockPi());
  });

  test("bash + git commit 触发 docs-update-guard + lore-commit-guard", async () => {
    const h = getHandler("tool_call");
    await h({ toolName: "bash", input: { command: "git commit -m 'foo'" } });
    // DOCS_UPDATE_HINT + LORE_COMMIT_BLOCK_REASON(若 stagedFiles() 为空则无 validate 消息)
    const hintMessages = messages.filter((m) => m.content.includes("docs-update-guard"));
    const blockMessages = messages.filter((m) => m.content.includes("lore-commit-guard"));
    expect(hintMessages).toHaveLength(1);
    expect(blockMessages).toHaveLength(1);
    expect(hintMessages[0].role).toBe("system");
    expect(blockMessages[0].role).toBe("system");
  });

  test("bash + lore commit 同样触发双 guard", async () => {
    const h = getHandler("tool_call");
    await h({ toolName: "bash", input: { command: "lore commit --intent test" } });
    expect(messages.some((m) => m.content.includes("docs-update-guard"))).toBe(true);
    expect(messages.some((m) => m.content.includes("lore-commit-guard"))).toBe(true);
  });

  test("bash + 非 commit 命令不触发 guard", async () => {
    const h = getHandler("tool_call");
    await h({ toolName: "bash", input: { command: "ls -la" } });
    expect(messages).toHaveLength(0);
  });

  test("bash + commit message 形如 'git commit' 但不含 commit 关键字则不触发", async () => {
    const h = getHandler("tool_call");
    await h({ toolName: "bash", input: { command: "git log --oneline" } });
    expect(messages).toHaveLength(0);
  });
});

// ===== tool_call: write|edit + docs/ → sdd-doc-edit-guard =====

describe("sdd-hook — tool_call write|edit + docs/", () => {
  beforeEach(() => {
    factory(makeMockPi());
  });

  test("write + docs/foo.md 触发 sdd-doc-edit-guard", async () => {
    const h = getHandler("tool_call");
    await h({ toolName: "write", input: { path: "docs/architecture/overview.md" } });
    const guidance = messages.filter((m) => m.content.includes("sdd-doc-edit-guard"));
    expect(guidance).toHaveLength(1);
    expect(guidance[0].role).toBe("system");
    expect(guidance[0].content).toContain("skill://sdd-core");
  });

  test("edit + docs/foo.md 触发 sdd-doc-edit-guard", async () => {
    const h = getHandler("tool_call");
    await h({ toolName: "edit", input: { path: "docs/PRD/test.md" } });
    expect(messages.some((m) => m.content.includes("sdd-doc-edit-guard"))).toBe(true);
  });

  test("write + 非 docs/ 路径不触发 guard", async () => {
    const h = getHandler("tool_call");
    await h({ toolName: "write", input: { path: "src/foo.ts" } });
    expect(messages).toHaveLength(0);
  });

  test("write + path 含 docs/ 子串(如 src/docs/foo.ts)也命中(isDocWritePath 用 regex 匹配)", async () => {
    // 实际 isDocWritePath = path.startsWith('docs/') || /(^|\/)docs\//.test(path)
    // 第二个分支会命中任何含 '/docs/' 子串的路径,这是当前 hook 的实现行为
    const h = getHandler("tool_call");
    await h({ toolName: "write", input: { path: "src/docs/foo.ts" } });
    expect(messages.some((m) => m.content.includes("sdd-doc-edit-guard"))).toBe(true);
  });

  test("bash 工具不触发 doc-edit-guard", async () => {
    const h = getHandler("tool_call");
    await h({ toolName: "bash", input: { command: "touch docs/foo.md" } });
    expect(messages.some((m) => m.content.includes("sdd-doc-edit-guard"))).toBe(false);
  });
});

// ===== 入口结构 =====

describe("sdd-hook — 入口结构", () => {
  beforeEach(() => {
    factory(makeMockPi());
  });

  test("只注册 2 个 event(session_start + tool_call),避免后注册覆盖", () => {
    expect(handlers).toHaveLength(2);
    const events = handlers.map((h) => h.event).sort();
    expect(events).toEqual(["session_start", "tool_call"]);
  });

  test("input 缺失时 input 默认空对象,不抛错", async () => {
    const h = getHandler("tool_call");
    await h({ toolName: "bash" }); // 无 input
    expect(messages).toHaveLength(0);
  });
});

afterEach(() => {
  handlers = [];
  messages = [];
});
