---
description: All commits must go through `lore commit` AND pass quality gates first (lint + verify + reviewer review). Catches both `git commit` (wrong tool) and `lore commit` (premature).
condition: "(^|[\\s;&|]+)(git|lore)\\s+commit(?=\\s|$)"
scope: "tool:bash"
---

Every commit — whether the command is `git commit` or `lore commit` — must clear three quality gates **in order** first. Then submit through `lore commit` only.

## The full flow

### Step 1 — Lint / format / typecheck

In a Vite+ project:

```sh
vp check                # fmt + lint + typecheck in one
vp check --fix          # auto-fix where possible, then re-run
```

In other projects:

```sh
npm run lint && npm run typecheck
# or whatever the project defines
```

<!-- If the project is NOT Vite+, `frontend-use-vp` may fire on `npm` commands.
     Follow that rule's fallback: check whether `vp` is installed first. -->

If this fails, **fix the failures and re-run**. Do not skip.

### Step 2 — Verification rules

Run the project's own verification — tests, type tests, build, etc.

```sh
vp test                 # Vitest in Vite+ projects
vp build                # confirm production build still works
```

Skip a step only if the project has no equivalent (no tests, no build script). Otherwise a green `vp check` + `vp test` + `vp build` is the bar.

### Step 3 — Reviewer review (mandatory, no exceptions)

Spawn the `reviewer` agent against the staged diff. This is a hard gate.

```sh
git add <files>
git diff --cached       # eyeball it first; abort if anything looks off
```

Then in a single tool call, hand the diff to the reviewer:

```text
Task tool call:
  agent:    reviewer
  prompt:   "Review this staged diff. Intent: <one-line why>.

              Diff:
              <paste `git diff --cached` output here>"

  Wait for the reviewer's verdict. Only proceed if overall_correctness is `pass`.
  If findings come back, fix them, re-stage, and re-review.
```

### Step 4 — Commit via `lore commit` (never `git commit` directly)

```sh
echo '{
  "intent": "<one-line why, max 72 chars>",
  "body": "<what changed and why; cite reviewer verdict>",
  "trailers": {
    "Confidence": "high",
    "Scope-risk": "narrow",
    "Tested": [
      "vp check passes",
      "vp test passes",
      "vp build passes",
      "reviewer verdict: pass"
    ],
    "Not-tested": []
  }
}' | lore commit
```

`intent` is the **only** required field. Add only the trailers that genuinely apply — do not pad. `Lore-id` is auto-generated.

## Why this rule fires

The condition matches the bash command stream for both `git commit` and `lore commit`, with any common flag (`-m`, `--amend`, `-a`, `--no-verify`, `-S`).

- **`git commit` is wrong** — it skips the Lore trailer entirely. Always redirect to `lore commit`.
- **`lore commit` without prior gates is wrong** — it submits unverified code with no audit trail.

| Pattern | Verdict |
| --- | --- |
| `git commit`, `git commit -m "x"`, `git commit --amend`, `git commit -a`, `git commit --no-verify`, `git commit -S` | Block; redirect to `lore commit` after gates |
| `lore commit`, `lore commit -m "x"` | Block; remind to do gates 1-3 first |
| `git status`, `git diff`, `git log`, `git add` | Not a commit, do not fire |
| `lore log`, `lore why`, `lore context` | Read-only lore, do not fire |
| `git commit-tree`, `git commit-graph` | Different git commands, do **not** match (word boundary) |

## When this rule does *not* fire

- Read-only git operations (`status`, `diff`, `log`, `show`, `blame`).
- Read-only lore operations (`lore log`, `lore why`, `lore context`, `lore search`, `lore trace`, `lore stale`).
- `lore commit --amend` to fix a typo on a commit that already passed gates — assume the prior review covers the amended shape; the amended commit's trailers should still be present and valid.

## Exceptions

- **Emergency hotfix in a time-critical incident**: still go through the gates, but you can collapse the body and trailers. Skipping the reviewer requires a stated reason in the commit body and an explicit user OK.
- **`vp` not installed** (non-Vite+ project): substitute the project's own lint/test/build commands. The Lore step is non-negotiable regardless of stack.
- **First commit in a brand-new repo with no tooling configured**: do the best lint/test pass you can with what's available, then commit. The `Tested` trailer should honestly say what was actually exercised.

## Cross-references

- `rule://lore-protocol` — full Lore protocol, query commands, JSON schema.
- `rule://frontend-use-vp` — Vite+ command surface (`vp check`, `vp test`, `vp build`, etc.).
- `rule://docs-update-guard` — docs sync check before commit (runs before this rule).
