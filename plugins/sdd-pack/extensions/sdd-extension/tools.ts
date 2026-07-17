/**
 * tools.ts — sdd-pack omp tool 注册（ADR-019 Step 12）
 *
 * 通过 pi.registerTool 注册 18 个 sdd_* tool，让 agent 在 omp session 内直接调
 * （与 read/write/bash 同协议），不依赖易漂移的 slash command marketplace cache。
 *
 * 与 /sdd slash command 共存，共享 src/cli/api.ts 单一事实源。
 */

interface SddExtensionApi {
  zod?: { z: unknown };
  registerTool(tool: unknown): void;
}

// zod schema 类型（宽松签名，运行时由 omp 注入真实 zod 实例）
interface ZChain {
  optional(): ZChain;
  describe(_d: string): ZChain;
}
interface ZApi {
  object(_shape: Record<string, unknown>): unknown;
  string(): ZChain;
  boolean(): ZChain;
  enum(_vals: readonly string[]): ZChain;
}

function isZApi(v: unknown): v is ZApi {
  return v !== null && typeof v === "object" &&
    "object" in (v as object) && "string" in (v as object) &&
    "boolean" in (v as object) && "enum" in (v as object);
}

function zodFallback(): ZApi {
  const chain = (): ZChain => {
    const c = {
      optional: () => c,
      describe: (_d: string) => c,
    };
    return c as unknown as ZChain;
  };
  return {
    object: (shape: Record<string, unknown>) => ({ _fallback: true, shape }),
    string: chain,
    boolean: chain,
    enum: chain,
  };
}

interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  defaultInactive?: boolean;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details?: unknown }>;
}

function ok(r: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }], details: r };
}

export function registerSddTools(pi: SddExtensionApi): void {
  const zRaw = (pi.zod && typeof pi.zod === "object" && "z" in pi.zod ? pi.zod.z : null) ?? zodFallback();
  const z: ZApi = isZApi(zRaw) ? zRaw : zodFallback();
  const define = (def: ToolDef): void => pi.registerTool(def);

  // ===== 17 个 api.ts 函数对应的 tool =====

  define({
    name: "sdd_init_prd",
    label: "SDD Init PRD",
    description: "Initialize a new PRD draft. Use when creating a Product Requirements Document.",
    parameters: z.object({
      title: z.string().describe("PRD title (required)"),
      slug: z.string().optional().describe("Override auto-generated ASCII kebab-case slug"),
      force: z.boolean().optional().describe("Allow overwriting empty draft"),
      dryRun: z.boolean().optional().describe("Preview without writing"),
    }),
    async execute(_id, params) {
      const { initPrd } = await import("../../src/cli/api");
      return ok(await initPrd(params as unknown as Parameters<typeof initPrd>[0]));
    },
  });

  define({
    name: "sdd_review_prd",
    label: "SDD Review PRD",
    description: "Transition active PRD from draft to pending review.",
    parameters: z.object({}),
    async execute() {
      const { reviewPrd } = await import("../../src/cli/api");
      return ok(await reviewPrd());
    },
  });

  define({
    name: "sdd_approve_prd",
    label: "SDD Approve PRD",
    description: "Transition active PRD from pending review to approved.",
    parameters: z.object({
      skipReviewer: z.boolean().optional().describe("Skip reviewer gate if configured"),
    }),
    async execute(_id, params) {
      const { approvePrd } = await import("../../src/cli/api");
      return ok(await approvePrd(params as unknown as Parameters<typeof approvePrd>[0]));
    },
  });

  define({
    name: "sdd_back_prd",
    label: "SDD Back PRD",
    description: "Revert active PRD to draft or pending state.",
    parameters: z.object({
      to: z.enum(["draft", "pending"]).describe("Target state"),
    }),
    async execute(_id, params) {
      const { backPrd } = await import("../../src/cli/api");
      return ok(await backPrd(params as unknown as Parameters<typeof backPrd>[0]));
    },
  });

  define({
    name: "sdd_plan_prd",
    label: "SDD Plan PRD",
    description: "Transition approved PRD to planned; create or link a Phase.",
    parameters: z.object({
      phase: z.string().optional().describe("New Phase title"),
      link: z.string().optional().describe("Existing Phase ID to link"),
    }),
    async execute(_id, params) {
      const { planPrd } = await import("../../src/cli/api");
      return ok(await planPrd(params as unknown as Parameters<typeof planPrd>[0]));
    },
  });

  define({
    name: "sdd_start_prd",
    label: "SDD Start PRD",
    description: "Transition planned PRD to in-progress.",
    parameters: z.object({}),
    async execute() {
      const { startPrd } = await import("../../src/cli/api");
      return ok(await startPrd());
    },
  });

  define({
    name: "sdd_archive_prd",
    label: "SDD Archive PRD",
    description:
      "Archive active PRD (terminal state). Reason completed runs gate (lint+test+review); abandoned skips gate.",
    parameters: z.object({
      reason: z.enum(["completed", "abandoned"]).describe("Archive reason"),
    }),
    async execute(_id, params) {
      const { archivePrdV2 } = await import("../../src/cli/api");
      return ok(await archivePrdV2(params as unknown as Parameters<typeof archivePrdV2>[0]));
    },
  });

  define({
    name: "sdd_phase_transition",
    label: "SDD Phase Transition",
    description: "Transition a Phase: start/complete/abandon.",
    parameters: z.object({
      id: z.string().optional().describe("Phase ID (defaults to first in-progress phase)"),
      action: z.enum(["start", "complete", "abandon"]).describe("Transition action"),
    }),
    async execute(_id, params) {
      const { phaseTransition } = await import("../../src/cli/api");
      return ok(await phaseTransition(params as unknown as Parameters<typeof phaseTransition>[0]));
    },
  });

  define({
    name: "sdd_phase_archive",
    label: "SDD Phase Archive",
    description: "Archive a Phase doc (physical move to archive/ + meta + PRD link + index sync).",
    parameters: z.object({
      phasePath: z.string().describe("Phase doc path (relative to repo root)"),
      reason: z.enum(["completed", "abandoned"]).describe("Archive reason"),
      dryRun: z.boolean().optional(),
      noCommit: z.boolean().optional(),
    }),
    async execute(_id, params) {
      const { archivePhase } = await import("../../src/cli/api");
      return ok(await archivePhase(params as unknown as Parameters<typeof archivePhase>[0]));
    },
  });

  define({
    name: "sdd_get_status",
    label: "SDD Status Panel",
    description: "Get active PRD status panel with phases and available actions.",
    parameters: z.object({}),
    async execute() {
      const { getStatusPanel } = await import("../../src/cli/api");
      return ok(await getStatusPanel());
    },
  });

  define({
    name: "sdd_sync_meta",
    label: "SDD Sync Meta",
    description: "Sync meta.json with markdown status lines; optionally fix inconsistencies.",
    parameters: z.object({
      fix: z.boolean().optional().describe("Overwrite markdown status line from meta.json"),
    }),
    async execute(_id, params) {
      const { syncMeta } = await import("../../src/cli/api");
      return ok(await syncMeta(params as unknown as Parameters<typeof syncMeta>[0]));
    },
  });

  define({
    name: "sdd_list_prds",
    label: "SDD List PRDs",
    description: "List PRDs/Phases/Specs with filters.",
    parameters: z.object({
      status: z.string().optional(),
      date: z.string().optional(),
      keyword: z.string().optional(),
      type: z.enum(["prd", "phase", "spec"]).describe("List type"),
    }),
    async execute(_id, params) {
      const { listPrds } = await import("../../src/cli/api");
      return ok(await listPrds(params as unknown as Parameters<typeof listPrds>[0]));
    },
  });

  define({
    name: "sdd_get_why",
    label: "SDD Why",
    description: "Get lore decision context for a file:line.",
    parameters: z.object({
      target: z.string().describe("file:line format (e.g. docs/prd/foo.md:42)"),
    }),
    async execute(_id, params) {
      const { getWhy } = await import("../../src/cli/api");
      const target = typeof params.target === "string" ? params.target : "";
      return ok(await getWhy(target));
    },
  });

  define({
    name: "sdd_get_apply_checklist",
    label: "SDD Apply Checklist",
    description: "Get apply checklist items for a PRD.",
    parameters: z.object({
      prdPath: z.string().describe("PRD doc path (relative to repo root)"),
    }),
    async execute(_id, params) {
      const { getApplyChecklist } = await import("../../src/cli/api");
      const p = typeof params.prdPath === "string" ? params.prdPath : "";
      return ok(await getApplyChecklist(p));
    },
  });

  define({
    name: "sdd_validate_docs",
    label: "SDD Validate Docs",
    description: "Run SDD validator checks on docs/ (12 rules: state machine, refs, naming, archive location, command drift, etc.).",
    parameters: z.object({
      path: z.string().optional().describe("Specific file/dir to validate"),
      severity: z.enum(["warn", "error", "block"]).describe("Min severity to report"),
      rulesOnly: z.boolean().optional(),
      structureOnly: z.boolean().optional(),
    }),
    async execute(_id, params) {
      const { validateDocs } = await import("../../src/cli/api");
      return ok(await validateDocs(params as unknown as Parameters<typeof validateDocs>[0]));
    },
  });

  define({
    name: "sdd_propose_prd",
    label: "SDD Propose PRD",
    description: "Generate a PRD draft from a spec (full or delta template).",
    parameters: z.object({
      spec: z.string().describe("Spec file path"),
      title: z.string().optional(),
      supersedes: z.string().optional(),
      type: z.enum(["full", "delta"]).describe("Template type"),
      dryRun: z.boolean().optional(),
    }),
    async execute(_id, params) {
      const { proposePrd } = await import("../../src/cli/api");
      return ok(await proposePrd(params as unknown as Parameters<typeof proposePrd>[0]));
    },
  });

  define({
    name: "sdd_migrate_prd",
    label: "SDD Migrate PRD",
    description: "Migrate a legacy PRD to current format.",
    parameters: z.object({
      prdPath: z.string().describe("PRD doc path"),
      dryRun: z.boolean().optional(),
      noBackup: z.boolean().optional(),
    }),
    async execute(_id, params) {
      const { migratePrd } = await import("../../src/cli/api");
      return ok(await migratePrd(params as unknown as Parameters<typeof migratePrd>[0]));
    },
  });

  // ===== 1 个 gate tool（stage 参数分派 5 阶段，与 sdd-router /sdd gate 一致）=====

  define({
    name: "sdd_gate",
    label: "SDD Gate",
    description:
      "Run a gate stage: lint/test/review/precommit/commit. Commit stage requires message or message-file.",
    parameters: z.object({
      stage: z.enum(["lint", "test", "review", "precommit", "commit"]).describe("Gate stage"),
      sha: z.string().optional().describe("Commit SHA for review stage"),
      message: z.string().optional().describe("Commit message JSON for commit stage"),
      messageFile: z.string().optional().describe("Path to commit message JSON file"),
    }),
    async execute(_id, params) {
      const { runLint, runTest, runReview, runPrecommit, runCommit, runCommitWithFile } =
        await import("../../src/cli/lib/gate-runner");
      const { findRepoRoot } = await import("../../src/cli/lib/path");
      const repoRoot = findRepoRoot();
      const stage = typeof params.stage === "string" ? params.stage : "";
      let r: unknown;
      if (stage === "lint") r = runLint(repoRoot);
      else if (stage === "test") r = runTest(repoRoot);
      else if (stage === "review") {
        const sha = typeof params.sha === "string" ? params.sha : undefined;
        r = runReview(repoRoot, sha);
      } else if (stage === "precommit") r = runPrecommit(repoRoot);
      else if (stage === "commit") {
        const msgFile = typeof params.messageFile === "string" ? params.messageFile : null;
        const msg = typeof params.message === "string" ? params.message : null;
        if (msgFile) r = runCommitWithFile(repoRoot, msgFile);
        else if (msg) r = runCommit(repoRoot, msg);
        else throw new Error("commit stage requires message or messageFile");
      } else throw new Error(`unknown gate stage: ${stage}`);
      return ok(r);
    },
  });
}
