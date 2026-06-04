---
name: ui-governance-gate
description: One-command UI governance gate that enforces the data-ui contract + Tailwind B1 and (optionally) orchestrates ESLint/Stylelint/Playwright under the same evidence run directory.
---

# UI Governance Gate (Compliance + Drift Control)

## Purpose

Provide a **hard enforcement layer** for UI/UX consistency in LLM-led development.

The `ui-governance-gate` skill runs deterministic checks (and records evidence) to prevent:
- Tailwind style drift beyond B1 (layout-only)
- local hard-coded colors/shadows/radius/typography in feature code
- contract misuse (`data-ui` roles/enums)
- feature CSS leaking visual styling

## Locked policies

- Tailwind: B1-layout-only
- Theme: token-only
- Evidence directory: `.ai/.tmp/ui/<run-id>/` (quick mode)

See:
- `./references/locked-system-parameters.md`

## When to use

Use when the user asks to:
- verify UI compliance
- reduce drift across LLM generations
- troubleshoot a style inconsistency
- validate a PR before merge
- introduce or review an exception

Avoid when:
- initializing UI spec structure (use `ui-system-bootstrap`)

## Inputs

- Target code roots (default from `ui/config/governance.json`)
- Optional: explicit run-id

## Outputs (evidence)

Writes an audit report to:
- `.ai/.tmp/ui/<run-id>/`

Minimum artifacts:
- `00-intake.md`
- `03-execution-log.md`
- `04-post-verify.md`
- `ui-gate-report.json`
- `ui-gate-report.md`

## Steps

### Phase 0 — Confirm prerequisites

1. Confirm the repo uses the **data-ui contract** system:
   - `ui/tokens/base.json`
   - `ui/contract/contract.json`
   - `docs/context/ui/ui-spec.json`

If missing, STOP and route to `ui-system-bootstrap`.

### Phase A — Run the gate

2. Run (full mode; orchestrates configured external tools if available):

```bash
python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py run --mode full
```

The gate will:
- generate a run-id
- write evidence under `.ai/.tmp/ui/<run-id>/`
- exit non-zero if errors are found

### Phase B — Remediation loop

3. If the gate fails, fix by priority:

1) Feature code: remove inline styles and hard-coded values
2) Replace Tailwind style utilities with `data-ui` roles/attrs
3) If contract is missing a reusable semantic capability:
   - draft a **contract expansion RFC** (approval required)

### Real-time approval checkpoint (mandatory)

4. The gate enforces approvals in real time (local workflow; not tied to PR):

- Spec changes (tokens/contract/patterns) require a `spec_change` approval.
- Policy relaxations (Tailwind boundary, feature CSS relaxations, scan exclusions, etc.) require an `exception` approval.

If the gate detects an unapproved change, it writes `.ai/.tmp/ui/<run-id>/approval.request.json` and fails.

Approve locally with:

```bash
python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py approval-approve --request .ai/.tmp/ui/<run-id>/approval.request.json --approved-by "<name>" --expires-at-utc "<iso>"
```

## Verification

- [ ] Gate report created in `.ai/.tmp/ui/<run-id>/`
- [ ] No errors remain (warnings acceptable but should be tracked)
- [ ] If exceptions exist, they are documented and time-bounded
- [ ] Public central test suite passes: `node .ai/tests/run.mjs --suite ui`

## Boundaries

- MUST NOT silently change tokens/contract.
- MUST NOT weaken the Tailwind boundary.
- Under Tailwind B1, `className` MUST be static or composed from explicit string literals; avoid opaque dynamic className construction.
- `data-ui` and contract `data-*` attributes MUST be static string literals or conditional expressions of string literals.
