/**
 * git.ts — git 子命令封装
 *
 * api.ts validateDocs 的 --staged 模式需要 `git diff --cached --name-only`,
 * api-runner 也在多处需要 git 调用。集中到这里。
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
/** `git diff --cached --name-only` 的输出文件列表(绝对路径,基于仓库根解析,cwd 无关) */
export function stagedFiles(): string[] {
  const root = repoRoot();
  if (!root) return [];
  const r = spawnSync("git", ["diff", "--cached", "--name-only"], { cwd: root });
  const out = r.stdout?.toString().trim() ?? "";
  if (!out) return [];
  return out
    .split("\n")
    .filter((f) => f.startsWith("docs/") && f.endsWith(".md"))
    .map((f) => resolve(root, f));
}

/** `git rev-parse --show-toplevel` — 仓库根 */
export function repoRoot(): string | null {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"]);
  const out = r.stdout?.toString().trim() ?? "";
  return r.status === 0 && out ? out : null;
}
