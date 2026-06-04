---
name: test-mobile-maestro
description: Maestro mobile UI automation: YAML flow authoring, stable selectors, local/CI execution, and failure triage with reproducible artifacts.
---

# Maestro Mobile UI Automation (workflow)

## Operating mode (token-efficient)
- Treat this skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow it end-to-end.
- Optimize for readable flows and reproducible failures.

## Routing (pick one procedure)

| Task | Open this procedure | Optional examples |
|---|---|---|
| Bootstrap Maestro (CLI + flow layout) | `reference/procedures/bootstrap.md` | — |
| Author a new Maestro flow | `reference/procedures/author-flow.md` | `reference/examples/flows/smoke.yaml`, `reference/examples/flows/login.yaml`, `reference/examples/subflows/` |
| Run flows (local/CI) | `reference/procedures/run.md` | — |
| Triage failures / improve stability | `reference/procedures/triage-failures.md` | — |

## Shared non-negotiables (apply to all procedures)
1) **Stable selectors**
   - Prefer accessibility identifiers / testIDs over visible text.
   - Avoid coordinate-based taps unless there is no alternative.

2) **Readable YAML**
   - Keep flows small and composable.
   - Use clear step naming and avoid duplication (extract reusable subflows when practical).

3) **Deterministic waiting**
   - Avoid arbitrary sleeps as a primary strategy.
   - Wait for explicit UI readiness conditions.

4) **Artifact contract (for CI + triage)**
   - Standardize under: `artifacts/maestro/`
   - Capture at least: screenshots on failure + logs (and video if your setup supports it).

5) **No secrets in repo**
   - Inject secrets via CI secrets / env vars.
   - Never commit real credentials in flows.

## Minimal inputs you should capture before changing code
- App identifiers (Android package / iOS bundle id)
- Device targets (emulator/simulator, OS versions)
- Auth strategy for tests
- Test data strategy (seeded tenant vs local mock)
- Which flows are PR-gating (smoke) vs nightly (regression)

## Verification
- If you changed **skills**:
  - Prefer host-repo tooling if present:
    - `node .ai/scripts/lint-skills.mjs --strict`
  - Always run the local validator:
    - `node .ai/skills/testing/test-mobile-maestro/scripts/validate-skill.mjs`

- If you changed **flows/config**:
  - `maestro --version`
  - `maestro test <flow.yaml>`

## Boundaries
- Do not edit `.codex/skills/` or `.claude/skills/` directly (generated).
- Do not store secrets inside YAML.
- Do not run destructive flows against shared environments without explicit gating.
