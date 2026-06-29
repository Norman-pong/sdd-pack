/**
 * lore-wrapper.ts — lore commit 封装
 *
 * spawn `lore commit` 子进程，传入 commit message + JSON trailer
 * 遵守 lore-protocol rule 的 trailer JSON schema
 */

/** lore commit trailer 的 JSON schema */
export interface LoreCommitTrailer {
  type: string;
  scope?: string;
  description: string;
  files?: string[];
  breaking?: boolean;
}

/** lore commit 结果 */
export interface LoreCommitResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 执行 lore commit
 * 不调用 git commit 裸命令
 */
export async function loreCommit(
  message: string,
  trailer?: LoreCommitTrailer,
): Promise<LoreCommitResult> {
  const { spawnSync } = await import("bun");

  const args = ["commit", "-m", message];
  if (trailer) {
    const trailerStr = `lore: ${JSON.stringify(trailer)}`;
    args.push("-m", trailerStr);
  }

  const result = spawnSync(["lore", ...args]);

  return {
    success: result.exitCode === 0,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode ?? 0,
  };
}

/**
 * 生成 lore commit trailer
 */
export function buildTrailer(
  type: string,
  description: string,
  scope?: string,
  files?: string[],
  breaking?: boolean,
): LoreCommitTrailer {
  return {
    type,
    scope,
    description,
    files,
    breaking,
  };
}

/**
 * 检查 lore CLI 是否可用
 */
export function isLoreAvailable(): boolean {
  const result = Bun.spawnSync(["which", "lore"]);
  return result.exitCode === 0;
}
