---
description: Lore protocol — query constraints/rejected/directives before any file edit; write lore-enriched commits via `lore commit` with the trailer JSON schema
alwaysApply: true
layer: soft-gate
enforcement: ttsr
---

# Lore Protocol

This project embeds structured decision context into git commits via the **Lore protocol v1.0**. Every file edit and every commit should leave a trail.

## Before Modifying Any File

Query Lore context for every file or directory you are about to change. Run all three so you see constraints (hard requirements), rejected (already-tried approaches), and directives (standing instructions) together:

```sh
lore constraints <path> --json
lore rejected <path> --json
lore directives <path> --json
```

Then verify your plan:

- **Constraint** = hard requirement. Do not write code that violates it.
- **Rejected** = approach already tried and abandoned (`alternative | reason`). Do not re-explore it.
- **Directive** = standing instruction. Follow it.

If `lore constraints` returns results, comply. If `lore rejected` matches your intended approach, pick a different one.

## When Committing

Commits go through a mandatory quality-gate flow enforced by TTSR rules:

1. **Docs check** — does the staged change require a doc update? See `rule://docs-update-guard`.
2. **Quality gates** — lint, test, build, then reviewer review. See `rule://lore-commit-guard`.
3. **`lore commit`** — only after steps 1-2. See the JSON schema below.

Never `git commit` directly — the TTSR rules will intercept it.

### Trailer JSON Schema

Only `intent` is required. Include only the trailers that actually apply — do not pad with empty values. `Lore-id` is auto-generated.

| Field           | Type                                              | When to add                                  |
| --------------- | ------------------------------------------------- | -------------------------------------------- |
| `intent`        | string (REQUIRED, ≤72 chars)                      | every commit — one-line "why"                |
| `body`          | string (optional)                                 | longer narrative context                     |
| `Constraint`    | string[]                                          | a rule that must hold going forward          |
| `Rejected`      | string[] (`alternative \| reason`)                | you chose A over B                           |
| `Confidence`    | `"low" \| "medium" \| "high"`                     | when you are unsure                          |
| `Scope-risk`    | `"narrow" \| "moderate" \| "wide"`                | how much the change touches                  |
| `Reversibility` | `"clean" \| "migration-needed" \| "irreversible"` | how easy to undo                             |
| `Directive`     | string[]                                          | standing instructions for future maintainers |
| `Tested`        | string[]                                          | what was verified                            |
| `Not-tested`    | string[]                                          | known untested areas                         |
| `Supersedes`    | string[] (8-char hex Lore-id)                     | decisions this replaces                      |
| `Depends-on`    | string[] (8-char hex Lore-id)                     | decisions this requires                      |
| `Related`       | string[] (8-char hex Lore-id)                     | informational links                          |

## 查看文件修改记录

要查某个文件/目录的历次 Lore-enriched 提交记录(替代裸 `git log`),用:

```sh
lore log [paths...]              # 带 Lore trailer 的 git log;传路径过滤
lore log --limit 20 src/auth.ts  # 最近 20 条针对该文件的修改
lore why <file>:<line>           # 查某一行背后的决策上下文
lore context <path>              # 文件/目录的全量 lore 摘要(约束 + rejected + directives)
```

`lore log <path>` 输出与 `git log <path>` 一样按时间倒序,但每条 commit 旁边会附上 `intent` 和关键 trailer(Constraint / Rejected / Directive),让"为什么这么改"立刻可见。

## 关联的强制执行规则

These TTSR rules intercept actual tool calls to keep the protocol enforced:

- `rule://lore-commit-guard` — quality gates (lint/test/build/reviewer) then `lore commit`
- `rule://docs-update-guard` — docs sync (check staged → `skill://sdd`) before commit
- `rule://frontend-use-vp` — Vite+ command enforcement (`vp` instead of raw npm/pnpm/vite)

## Other Commands

```sh
lore context <path> --json       # Full context for a file/directory
lore why <file>:<line> --json    # Line-level blame with Lore context
lore search --text "q" --json    # Search across all lore
lore stale <path> --json         # Check for outdated decisions
lore trace <lore-id> --json      # Trace a decision chain
```
