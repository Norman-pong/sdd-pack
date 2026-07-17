#!/usr/bin/env bun
/**
 * bin.ts — sdd-pack CLI 真入口（ADR-019）
 *
 * 由 package.json#bin.sdd 暴露。外部项目通过 `bunx sdd <sub>` 或 `npx sdd <sub>` 调用，
 * 无需 omp slash command、无需长前缀 `bun run plugins/sdd-pack/src/cli/api-runner.ts`。
 *
 * 内部委托给 api-runner.ts 的 main()，保持单一事实源。
 */
import { main } from "./api-runner";

main().catch((e: unknown) => {
  console.error("错误:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
