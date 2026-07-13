/**
 * test-preload.ts — bun test preload,自动 chdir 到仓库根
 *
 * 背景:plugins/sdd-pack/src/cli/api.ts 内部用 `resolve("docs/prd")` 等
 * 相对 process.cwd() 解析路径。当从 plugins/sdd-pack/ 子目录跑 `bun test`
 * 时 cwd 是 package root,`docs/prd/` 不存在,fixture test fail。
 *
 * 修复:在 bun test 启动时(preload 阶段),从 cwd 向上找包含 docs/prd/ 的
 * 最近父目录,chdir 过去。这样后续 resolve("docs/prd") 都能正确指向仓库根。
 *
 * 副作用评估:
 * - OpenSpec 测试 fixture 已用 `process.chdir(FIXTURE_ROOT)` 隔离,他们的
 *   chdir 在 preload 之后执行,会覆盖本 preload 的 chdir — 隔离行为不受影响
 * - 找不到 docs/prd 时保持原 cwd(不抛错),fallback 安全
 * - 零其他副作用:不写日志、不预加载模块、不修改全局状态
 */

import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const MAX_DEPTH = 8;
const start = process.cwd();
let dir = start;
let repoRoot: string | null = null;

for (let i = 0; i < MAX_DEPTH; i++) {
  const candidate = resolve(dir, "docs/prd");
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    repoRoot = dir;
    break;
  }
  const parent = dirname(dir);
  if (parent === dir) break; // 到达 fs 根
  dir = parent;
}

if (repoRoot && repoRoot !== start) {
  process.chdir(repoRoot);
}