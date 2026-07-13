/**
 * path.ts — sdd-pack 路径解析 helper(非范式专属,可被 api.ts + test + 其他 caller 共享)
 *
 * 当前导出:
 * - findRepoRoot(): 定位当前 cwd 所属的 sdd-pack 仓库根
 *
 * 语义: sdd-pack 仓库根 = 含 `docs/prd/` 子目录的最近祖先目录。
 *
 * 选择 `docs/prd/` 作为 anchor(而非 `package.json` 含 `name === "sdd-pack"`):
 * - 仓库根 `package.json` 仅含 `{ "type": "module" }`,无 `name` 字段;
 *   `name: "sdd-pack"` 在 plugins/sdd-pack/package.json,但后者与 docs/ 不同层,
 *   按此 anchor 会锁到 plugins/sdd-pack/,resolve("docs") 仍指向不存在的子目录
 * - `docs/prd/` 是 sdd-pack 项目的本质特征,在仓库全局唯一,无 monorepo 父级污染
 * - walk-up 简单,不硬编码 plugins/sdd-pack/ 路径,未来 plugin 改名/移位不破坏
 * - 离 cwd 最近的 docs/prd/ 父目录 = 该 cwd 所属的 sdd-pack 项目根
 *
 * 行为: 找不到时 throw,error message 带 cwd + walk 深度 + 诊断提示
 * (prod 用户从 /tmp 跑 CLI 应看到清晰错误,而不是下游 'docs/prd not found' 迷雾)
 */

import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";

const MAX_WALK_DEPTH = 8;

/**
 * 定位 sdd-pack 仓库根(含 docs/prd/ 的最近祖先)
 * @returns 仓库根绝对路径
 * @throws 找不到时 throw 带 cwd + 深度 + 诊断信息
 */
export function findRepoRoot(): string {
  const start = process.cwd();
  let dir = start;
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    const candidate = resolve(dir, "docs/prd");
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // 已到达 fs 根
    dir = parent;
  }
  throw new Error(
    `sdd-pack project root not found: walked up ${MAX_WALK_DEPTH} levels from cwd=${start}, ` +
      `no ancestor contains 'docs/prd/' subdirectory. ` +
      `Run this command from inside an sdd-pack repository (where docs/prd/ exists).`,
  );
}

/**
 * 定位当前 cwd 所属的项目根（含 .sdd/ 或 .git/ 的最近祖先）
 *
 * 与 findRepoRoot() 的区别：
 * - findRepoRoot 锚定 docs/prd/（sdd-pack 自家仓库专用）
 * - findProjectRoot 锚定 .sdd/ 或 .git/（任意第三方项目可用）
 *
 * 用于 gate 子系统：第三方用户项目可能没有 docs/prd/，
 * 但只要有 .sdd/gate.json 或 .git/ 就能定位项目根。
 *
 * @returns 项目根绝对路径
 * @throws 找不到时 throw
 */
export function findProjectRoot(): string {
  const start = process.cwd();
  let dir = start;
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    if (
      (existsSync(resolve(dir, ".sdd")) && statSync(resolve(dir, ".sdd")).isDirectory()) ||
      (existsSync(resolve(dir, ".git")) && statSync(resolve(dir, ".git")).isDirectory())
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `project root not found: walked up ${MAX_WALK_DEPTH} levels from cwd=${start}, ` +
      `no ancestor contains '.sdd/' or '.git/' directory. ` +
      `Run this command from inside a git repository or a project with .sdd/ directory.`,
  );
}
