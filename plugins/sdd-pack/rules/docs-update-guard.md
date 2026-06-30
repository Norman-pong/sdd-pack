---
description: Before any commit, check whether the staged change requires updating docs (PRD / Phase / Architecture / Reference / index). If yes, follow the `sdd` skill before submitting.
condition: "(^|[\\s;&|]+)(git|lore)\\s+commit(?=\\s|$)"
scope: "tool:bash"
---

Before you `git commit` or `lore commit`, scan the staged change set and ask: does anything in this commit require a doc update? If yes, apply the `sdd` skill **before** the commit goes out — either in this commit (stage the doc changes too) or in a separate docs-only commit immediately before.

## Quick checklist

Run `git diff --cached --stat` and look at the file list. Does the change touch, or have implications for, any of the following:

| Trigger                                                           | Doc to update                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| New product requirement, scope change, feature add/remove         | `docs/prd/YYYY-MM-DD-<name>.md` + matching `docs/phase/...`             |
| New phase kicked off, milestone hit, phase plan revised           | `docs/phase/YYYY-MM-DD-<phase>.md`                                      |
| New module, system-design change, deprecated API, tech-stack swap | `docs/architecture/<topic>.md` (and `overview.md` if structure changes) |
| New external dependency, third-party API, updated spec            | `docs/reference/<external-doc>.md`                                      |
| New doc file, moved file, renamed file                            | `docs/index.md` and any relevant `README.md`                            |

If **none** of the above applies — purely internal refactor, test-only change, build/CI tweak, comment-only edit — **skip doc work** and proceed to the commit guard.

## Workflow when docs ARE in scope

1. **Read the skill** for the full discipline (templates, conventions, lore query, index sync, commit format):

   ```
   skill://sdd-core
   ```

2. **Run the sdd skill's workflow**:
   - Query `lore constraints / rejected / directives` for the doc path(s) you'll touch.
   - Read the matching template from `docs/<x>/_template.md` first; fall back to the skill's `references/templates.md` if the project template is missing.
   - Update the doc, follow the template structure, observe the naming convention.
   - Update `docs/index.md` (and the relevant sub-directory `README.md`).
   - If you created a Phase, the PRD must reference it and vice versa — the back-link format is non-negotiable.

3. **Stage the doc updates alongside the code**, then hand off to the commit guard:

   ```sh
   git add docs/
   # Now: follow rule://lore-commit-guard (quality gates → reviewer → lore commit)
   ```

## Workflow when docs are NOT in scope

Skip the doc step. Go straight to the commit guard:

```sh
git add <files>
# Quality gates, reviewer, lore commit
```

## Common false positives — when docs are NOT needed

- Pure refactor with no external behavior change
- Internal test additions, fix typos in tests
- CI / build / tooling-only changes (`vite.config.ts` block tweaks, GitHub Actions)
- Comment-only or whitespace-only edits
- Dependency bumps with no behavioral change (same API surface)

## Common false negatives — when docs ARE needed

- Added/changed a CLI flag, env var, or config option that users touch → Architecture + Reference
- Renamed a public function, class, or module → Architecture (if it has one) + cross-references
- Added a new package to the monorepo → `docs/architecture/overview.md` workspace section
- Replaced one tool with another (e.g. ESLint → Oxlint, Webpack → Vite) → Architecture + Reference
- Added a new entry-point command (e.g. `vp foo`) → Architecture (overview) + Reference
- Dependency version change that impacts user-facing behavior → `docs/reference/`

## Why this rule fires alongside `lore-commit-guard`

Both rules share the commit command stream as the trigger, so the agent sees both bodies when a commit is attempted. The order of operations is:

1. **This rule** — first: decide if docs need updating. Update them if so.
2. **`lore-commit-guard`** — second: run quality gates, reviewer, then submit via `lore commit`.

Never let `lore commit` go through with stale docs in the same change set.

## Cross-references

- `skill://sdd-core` — the full Software Development Documentation discipline (templates, conventions, full workflow).
- `rule://lore-commit-guard` — the commit quality gate (lint / test / build / reviewer / lore commit).
- `rule://lore-protocol` — the Lore protocol for embedding decision context in commits.
- `rule://frontend-use-vp` — Vite+ enforced command surface (`vp check` / `vp test` / `vp build`).
- `~/.omp/agent/AGENTS.md` — quick reference for `lore` commands and the SDD rule.
