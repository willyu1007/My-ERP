---
name: ui-system-bootstrap
description: Bootstrap or repair the repo UI SSOT (ui/tokens, ui/contract, ui/styles, docs/context/ui) for data-ui contract + Tailwind B1; run codegen + validation with an approval gate when overwriting.
---

# UI System Bootstrap (SSOT + Contract)

## Purpose

Establish and maintain a **robust, low-drift UI/UX foundation** for LLM-led development using:

- **Token SSOT**: `ui/tokens/*` (values live here)
- **Contract SSOT**: `ui/contract/contract.json` (`data-ui` roles + enumerations)
- **Global CSS layers**: `ui/styles/*` (tokens + contract + feature layer)
- **LLM context**: `docs/context/ui/ui-spec.json`

This skill is the **only** way to initialize or repair the UI system. It is intentionally deterministic and idempotent.

## Locked policies

- Tailwind boundary: **B1 (layout-only)**
- Theme policy: **token-only** (themes must not fork contract)
- Evidence directory: `.ai/.tmp/ui/<run-id>/` (quick mode)

See:
- `./references/locked-system-parameters.md`

## When to use

Use when the user asks to:

- set up UI tokens / contract / global styles from scratch
- add UI spec structure to a repo that has none
- repair missing UI files (tokens, contract, context)
- upgrade the UI spec version safely

Avoid when:

- the task is implementing a specific page/feature (use `ui-feature-delivery`)
- the task is auditing compliance only (use `ui-governance-gate`)

## Inputs

- Repo root (default: current working directory)
- Desired default themes (optional): `default.light`, `default.dark` (provided)
- Overwrite mode: must be explicit (`--force`) and always requires approval

## Outputs

- UI SSOT directories created/repaired:
  - `ui/` (tokens, contract, styles, patterns)
  - `docs/context/ui/ui-spec.json`
- Evidence captured under:
  - `.ai/.tmp/ui/<run-id>/`

## Steps

### Phase 0 — Detect and scope

1. Detect whether `ui/` and `docs/context/ui/ui-spec.json` already exist.
2. Choose a `run-id` and create evidence dir:
   - `.ai/.tmp/ui/<run-id>/`
3. Write evidence templates:
   - `00-intake.md`, `01-analysis.md`, `02-proposal.md`, `03-execution-log.md`, `04-post-verify.md`

### Phase A — Scaffold or repair

4. If UI spec is missing: scaffold using the bundled template.
5. If UI spec is partial: create missing files only (do not overwrite by default).

### Approval checkpoint (mandatory when overwriting)

6. If any existing SSOT file would be overwritten (`ui/tokens/*`, `ui/contract/contract.json`, `ui/styles/contract.css`), STOP and request explicit approval.

### Phase B — Codegen and context refresh

7. Run:

```bash
python3 .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py init
python3 .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py codegen
python3 .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py validate
```

### Phase C — Post-verify

8. Confirm:
- `ui/styles/tokens.css` regenerated
- `ui/codegen/contract-types.ts` regenerated
- `docs/context/ui/ui-spec.json` regenerated

Record results in `04-post-verify.md`.

## Verification

- [ ] Tailwind policy is B1-layout-only
- [ ] Themes are token-only (no contract branches)
- [ ] All SSOT files exist and validate
- [ ] LLM context file is refreshed
- [ ] Public central test suite passes: `node .ai/tests/run.mjs --suite ui`

## Boundaries

- MUST NOT generate feature UI pages in this skill.
- MUST NOT loosen Tailwind policy.
- MUST NOT create new contract roles/attrs without an explicit RFC + approval.
