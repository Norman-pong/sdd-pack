import { existsSync } from "node:fs";
import { join } from "node:path";

export interface OpenSpecProjectState {
  enabled: boolean;
  isGitRepo: boolean;
  hasOpenSpecDirs: boolean;
  reason?: string;
}

export function detectOpenSpecProject(cwd: string): OpenSpecProjectState {
  const isGitRepo = existsSync(join(cwd, ".git"));
  const hasSpecs = existsSync(join(cwd, "openspec", "specs"));
  const hasChanges = existsSync(join(cwd, "openspec", "changes"));
  const hasOpenSpecDirs = hasSpecs && hasChanges;

  if (!isGitRepo) {
    return {
      enabled: false,
      isGitRepo,
      hasOpenSpecDirs,
      reason: "当前目录不是 Git 仓库",
    };
  }

  if (!hasOpenSpecDirs) {
    return {
      enabled: false,
      isGitRepo,
      hasOpenSpecDirs,
      reason: "未检测到 OpenSpec init 产物",
    };
  }

  return {
    enabled: true,
    isGitRepo,
    hasOpenSpecDirs,
  };
}
