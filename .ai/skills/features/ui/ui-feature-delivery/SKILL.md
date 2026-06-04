---
name: ui-feature-delivery
description: Implement React UI features using the data-ui contract system and Tailwind B1 (layout-only), including interface/data contract design, evidence capture in .ai/.tmp/ui/<run-id>/, and mandatory governance gate execution.
---

# UI Feature Delivery (React + data-ui Contract)

## Purpose

Deliver UI/UX features with **stable styling** and low drift under LLM leadership.

This skill focuses on:
- UI structure + behavior implementation
- interface/data contract design (API/types)
- strict adherence to `data-ui` contract and Tailwind B1 boundary
- automatically closing the loop by running the governance gate

## Locked policies

- Tailwind: B1-layout-only
- Theme: token-only
- Evidence: `.ai/.tmp/ui/<run-id>/`

## When to use

Use when the user asks to:
- implement a page, flow, or complex UI behavior
- adjust UI + API contracts to support a feature
- refactor UI while keeping style stable

Avoid when:
- initializing the UI system (use `ui-system-bootstrap`)
- converting a screenshot into tokens/contract changes (use `ui-style-intake-from-image`)

## Inputs

- Feature requirement
- Target routes/components
- Data/API constraints

## Outputs

- Feature code changes (React)
- Evidence under `.ai/.tmp/ui/<run-id>/`
- Governance gate report

## Workflow

### Phase 0 — Preflight (SSOT)

1. Confirm `docs/context/ui/ui-spec.json` exists.
   - If missing, invoke `ui-system-bootstrap` first.
2. Confirm Tailwind B1 boundary: layout only.
3. Choose a `run-id` and create `.ai/.tmp/ui/<run-id>/`.

### Phase A — UI spec-constrained design

4. Design the UI using existing contract roles and attributes:
   - Prefer patterns in `ui/patterns/*`.
   - Choose `data-ui` roles + `data-*` enums.
5. Define required data contracts (types / DTOs / API endpoints):
   - Keep data contracts stable and explicit.

### Phase B — Implementation

6. Implement components/pages:
   - All semantic styling must be via `data-ui` + enums.
   - Tailwind allowed only for layout (flex/grid/position/overflow/size/truncate).
   - Do not add inline styles or hard-coded colors.

### Phase C — Close the loop (mandatory)

7. Run governance gate and fix violations:

```bash
python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py run --mode full
```

### Phase D — If you hit spec limits

8. If the feature cannot be expressed with the current contract/tokens:
   - STOP and draft a minimal proposal.
   - Route to:
     - tokens/theme changes: `ui-style-intake-from-image` or `ui-system-bootstrap` (with approval)
     - contract expansion: proposal + approval, then `ui-system-bootstrap` + codegen

## Approval gates

Approval is mandatory when:
- changing tokens or theme files
- changing contract roles/enums
- introducing a documented exception to Tailwind B1

## Verification

- [ ] Uses contract roles/enums only
- [ ] Tailwind is layout-only
- [ ] Gate passes (or violations are documented + approved)
- [ ] Evidence captured
- [ ] Public central test suite passes: `node .ai/tests/run.mjs --suite ui`

## Boundaries

- MUST NOT modify tokens/contract without explicit approval.
- MUST NOT introduce a component library as the primary mechanism.
