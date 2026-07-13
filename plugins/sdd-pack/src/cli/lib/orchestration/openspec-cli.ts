import { spawnSync } from "node:child_process";

export interface OpenSpecExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
}

export type OpenSpecRunner = (args: string[], cwd?: string) => OpenSpecExecResult;

function defaultRunner(args: string[], cwd = process.cwd()): OpenSpecExecResult {
  const proc = spawnSync("openspec", args, {
    cwd,
    encoding: "utf-8",
  });

  return {
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
    exitCode: proc.status ?? 1,
    command: `openspec ${args.join(" ")}`,
  };
}

let currentRunner: OpenSpecRunner = defaultRunner;

export function runOpenSpec(args: string[], cwd?: string): OpenSpecExecResult {
  return currentRunner(args, cwd);
}

export function setOpenSpecRunnerForTests(runner: OpenSpecRunner | null): void {
  currentRunner = runner ?? defaultRunner;
}
