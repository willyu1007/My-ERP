---
name: ui-style-intake-from-image
description: Convert a UI screenshot into a Style Profile and a minimal change proposal (prefer new theme tokens) for the data-ui contract system, with a mandatory approval gate for any token/contract changes.
---

# UI Style Intake from Image (Screenshot -> Tokens/Contract)

## Purpose

Use a screenshot or reference image to drive **controlled** UI evolution without drift.

This skill turns:
- an image (in-chat screenshot or a local file path)

into:
- Style Profile (what is observed)
- Mapping (pattern vs tokens vs contract)
- Minimal change proposal (default: new theme token set)
- Optional execution (only after approval)

## Locked policies

- Tailwind: B1-layout-only
- Theme: token-only
- Approval gate: required for any SSOT change
- Evidence: `.ai/.tmp/ui/<run-id>/`

See:
- `./references/locked-system-parameters.md`

## When to use

Use when the user asks to:
- "adopt this look" / "match this screenshot" / "make it look like this"
- introduce a new brand/theme
- adjust visual style in a controlled way

Avoid when:
- the request is purely layout or information architecture (use patterns and feature implementation)

## Inputs

- Screenshot (best) OR local image path
- Target theme scope:
  - default: create a **new theme** under `ui/tokens/themes/`
- Constraints:
  - do not expand contract unless strictly required

## Outputs (evidence)

Write artifacts under:
- `.ai/.tmp/ui/<run-id>/`

Files:
- `00-intake.md` (include the image reference)
- `01-analysis.md` (Style Profile)
- `02-proposal.md` (token/contract/pattern mapping + diff summary)
- `03-execution-log.md`
- `04-post-verify.md`

## Steps

### Phase 0 — Ensure UI system exists

1. If `ui/tokens` or `ui/contract` is missing, invoke `ui-system-bootstrap` first.

### Phase A — Extract style signals

2. Create `run-id` and evidence directory.
3. Extract the following (prefer quantified statements):

- Foundations: density, spacing unit (4/8), radius scale, shadow character, typography scale, color semantics
- Components: which roles/variants/states are visible
- Patterns: page structure that contributes to perceived style

Optional deterministic probe (for local images):

```bash
python3 .ai/skills/features/ui/ui-style-intake-from-image/scripts/image_style_probe.py <image-path> --out .ai/.tmp/ui/<run-id>/image-style-probe.json
```

### Phase B — Mapping decision tree (strict)

4. Map observations in this order:

1) Pattern-only (structure) -> update `ui/patterns/*` (no token/contract)
2) Token-only -> update / add theme tokens (preferred)
3) Contract expansion -> only if a new reusable semantic or state is required
4) Exception -> last resort, must include expiration

### Approval checkpoint (mandatory)

5. Before writing any SSOT change, request explicit approval for:
- which files will change
- whether we are adding a theme or modifying an existing one
- whether contract changes are proposed

### Phase C — Execute (only after approval)

6. Apply the approved changes:
- Prefer adding `ui/tokens/themes/<theme>.json`
- Run codegen:

```bash
python3 .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py codegen
python3 .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py validate
python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py run --mode full
```

7. Record results in `04-post-verify.md`.

## Verification

- [ ] Evidence created under `.ai/.tmp/ui/<run-id>/`
- [ ] Any SSOT change is approved before apply
- [ ] `ui_specctl.py validate` passes after codegen
- [ ] Governance gate passes (or violations are documented + approved)
- [ ] Public central test suite passes: `node .ai/tests/run.mjs --suite ui`

## Boundaries

- MUST NOT "pixel-copy" by writing ad-hoc CSS into pages.
- MUST NOT loosen Tailwind B1.
- MUST NOT change contract for theme differences.
