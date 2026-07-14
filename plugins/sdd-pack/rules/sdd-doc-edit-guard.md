---
description: Before writing or editing any file under docs/, route through the SDD skill family (sdd-core/sdd-input/sdd-prd/sdd-phase) instead of bare write/edit — ensures naming conventions, required sections, and PRD↔Phase cross-references are honored at write time, not patched at commit time.
scope: "tool:write(docs/**), tool:edit(docs/**)"
layer: soft-gate
enforcement: ttsr
---

Before you `write` or `edit` a file whose path starts with `docs/`, stop and route through the SDD skill family. Documents under `docs/` follow naming conventions, required sections, and cross-reference rules that bare file edits will violate.

## Quick routing table

| What you're about to do                                  | Skill to use                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Create/modify a spec (`docs/spec/**`)                    | `skill://sdd-input` (idea → spec) or `skill://sdd-core` (structure fix) |
| Create/modify a PRD (`docs/prd/**`)                      | `skill://sdd-prd` (spec → PRD) or `skill://sdd-core` (structure fix)    |
| Create/modify a Phase (`docs/phase/**`)                  | `skill://sdd-phase` (PRD → Phase) or `skill://sdd-core` (structure fix) |
| Create/modify architecture docs (`docs/architecture/**`) | `skill://sdd-core`                                                      |
| Create/modify reference docs (`docs/reference/**`)       | `skill://sdd-core`                                                      |
| Initialize the docs/ tree                                | `skill://sdd-core` (scenario 4)                                         |
| Edit `docs/index.md` or `docs/CONTRIBUTING.md`           | `skill://sdd-core`                                                      |

## When this rule does NOT fire

- **Reading** docs — `read` tool is not in scope; read freely.
- **`.working/` temp files** — paths matching `docs/**/.working/**` are skill-internal working artifacts (problem lists, ADR drafts, task breakdowns). They are created and cleaned up by the skills themselves and do not follow SDD document conventions. Bare `write`/`edit` is fine there.
- **Non-`docs/` markdown** — a `README.md` at repo root or in `src/` is not part of the SDD tree.

## Why this rule exists

`rule://docs-update-guard` only fires at **commit time** — by then the document is already written and structural mistakes (wrong naming, missing sections, broken cross-references) are expensive to fix. This rule fires at **write/edit time**, catching the routing before the content is created.

The two rules are complementary:

1. **This rule** (write/edit time) — route to the right SDD skill so the document is born correct.
2. **`rule://docs-update-guard`** (commit time) — verify the staged change set doesn't leave docs stale.

## What to do if the rule fires

1. Identify the doc type from the path (`docs/prd/**` → PRD, `docs/phase/**` → Phase, etc.).
2. Read the matching skill (`skill://sdd-core` for structure, or the specialized skill for content).
3. If the user explicitly asked for a quick edit that doesn't warrant the full 4-stage workflow (e.g., fixing a typo), note the SDD convention, make the edit, and mention that the full skill workflow was skipped.

## Cross-references

- `skill://sdd-core` — document system base (directory structure, naming, conventions, lore commit).
- `skill://sdd-input` — idea → spec (upstream).
- `skill://sdd-prd` — spec → PRD.
- `skill://sdd-phase` — PRD → Phase.
- `rule://docs-update-guard` — commit-time docs sync check.
- `rule://lore-protocol` — lore query before edit, lore commit after.
