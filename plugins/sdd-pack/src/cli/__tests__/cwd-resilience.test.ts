/**
 * cwd-resilience.test.ts — 锁住 findRepoRoot() 在子目录 cwd 下也能正确解析 docs/prd/
 *
 * 背景:v1.4.0-alpha 引入 src/cli/api.ts 时,内部用 `resolve("docs/prd")` 相对
 * process.cwd() 解析路径。从 plugins/sdd-pack/ 子目录跑 `bun test` 时 cwd 是
 * package root,docs/prd/ 不在那里,3 个 fixture test fail(getStatus / listPrds /
 * getApplyChecklist)。
 *
 * v1.5.0-alpha 修复:api.ts 加 findRepoRoot() helper,walk-up 找含 docs/prd/
 * 的最近祖先(throw 含诊断信息),13 处 resolve 收敛过去。
 *
 * 此 test 锁住「从子目录跑 api 仍能正确解析 docs/prd/」的 robustness:
 * - beforeAll: process.chdir 到 plugins/sdd-pack/(子目录)
 * - 调 getStatus():期望返回的 PRD path 都指向仓库根 docs/prd/(而非子目录)
 * - 验证本任务新建的 2026-07-01-sdd-dual-paradigm.md PRD 可被解析到
 * - afterAll:还原 cwd,避免污染后续 test
 *
 * 未来 refactor findRepoRoot() 改了 anchor 或破坏 walk-up → 这条 test 立刻 fail。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { resolve } from "node:path";
import { findRepoRoot } from "../lib/path";
import { getStatus } from "../api";

const ORIGINAL_CWD = process.cwd();

const REPO_ROOT = findRepoRoot();
const SUBDIR = resolve(REPO_ROOT, "plugins/sdd-pack");

describe("cwd resilience", () => {
  beforeAll(() => {
    // 切到 plugins/sdd-pack/ 子目录,模拟 user 从子目录跑 CLI 的场景
    process.chdir(SUBDIR);
  });

  afterAll(() => {
    process.chdir(ORIGINAL_CWD);
  });

  test("getStatus from plugins/sdd-pack subdir resolves docs/prd via findRepoRoot", async () => {
    // 验证 cwd 已切到子目录(测试前置条件,避免 beforeAll 静默失败)
    expect(process.cwd()).toBe(SUBDIR);

    const r = await getStatus();

    // prdCount > 0(子目录 cwd 也能解析到 docs/prd/)
    expect(r.prdCount).toBeGreaterThan(0);

    // 归档 PRD 也可被解析到（scan 包含 archive/ 子目录）
    const dualParadigm = r.items.find((i) => i.fileName === "2026-07-01-sdd-dual-paradigm.md");

    // 所有 PRD path 都指向仓库根 docs/prd/(绝对路径),不是子目录 docs/prd/
    for (const item of r.items) {
      if (item.type !== "prd") continue;
      expect(item.path.startsWith(`${REPO_ROOT}/docs/prd/`)).toBe(true);
    }
  });

  test("getStatus from subdir returns same items as repo-root", async () => {
    // 临时切回仓库根取 baseline
    process.chdir(REPO_ROOT);
    const fromRoot = await getStatus();
    // 切回子目录
    process.chdir(SUBDIR);
    const fromSubdir = await getStatus();

    // 两个 cwd 拿到的 item 数 + fileName 列表一致(robustness 锁住)
    expect(fromRoot.prdCount).toBe(fromSubdir.prdCount);
    expect(fromRoot.phaseCount).toBe(fromSubdir.phaseCount);
    const rootFiles = new Set(fromRoot.items.map((i) => i.fileName).sort());
    const subdirFiles = new Set(fromSubdir.items.map((i) => i.fileName).sort());
    expect([...rootFiles]).toEqual([...subdirFiles]);
  });
});
