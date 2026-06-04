---
name: github-actions-ci
description: GitHub Actions CI skill: integrate automated tests (web/api/mobile/perf) with consistent artifacts.
---

# GitHub Actions CI Integration (workflow)

## Operating mode (token-efficient)
- Treat this skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow the chosen procedure end-to-end.

## Routing (pick one procedure)

| Task | Open this procedure | Optional templates |
|---|---|---|
| Enable/adjust test jobs (web/api/mobile/perf) | `reference/procedures/enable-test-jobs.md` | `reference/templates/github-actions/ci.yml` |
| Standardize artifacts + reporting | `reference/procedures/artifacts-and-reporting.md` | — |
| Troubleshoot CI failures | `reference/procedures/troubleshoot.md` | — |

## Shared non-negotiables (apply to all procedures)

1) **Test command contract**
   - Each suite must have a single deterministic command runnable in CI:
     - API (Newman): `pnpm test:api`
     - Web (Playwright): `pnpm test:e2e:playwright`
     - Web (Cypress): `pnpm test:e2e:cypress`
     - Perf (k6): `pnpm test:perf:k6` or direct runner (`k6 run ...` / `docker run grafana/k6 ...`)
     - Mobile: `pnpm test:mobile:<detox|maestro|appium>`
   - Commands must:
     - exit non-zero on test failures
     - write artifacts to `artifacts/<suite>/`

2) **Artifacts are mandatory**
   - Always upload artifacts even on failure: `artifacts/` or a well-defined subset.
   - Avoid writing artifacts outside the workspace.

3) **Secrets management**
   - All credentials must use GitHub Actions secrets.
   - Never echo secrets in logs.
   - Prefer OIDC + short-lived tokens if your org supports OIDC.

4) **Gating policy**
   - PR gating should run only fast, stable suites (typically API + 1 web suite + perf smoke).
   - Heavy suites (mobile, load/stress) should be scheduled or manually dispatched.

## Minimal inputs before changing CI
- Which workflows exist today
- Which suites are PR-gated vs scheduled
- Required secrets and how they map to env vars
- Node version and OS runners required (ubuntu vs macOS)
- Artifact retention needs and size constraints

## Verification

- If you changed **skills**:
  - `node .ai/scripts/lint-skills.mjs --strict`
  - `node .ai/skills/features/ci/github-actions-ci/scripts/validate-skill.mjs`

- If you changed **workflow YAML**:
  - Run a PR test run (or use `workflow_dispatch`) and confirm:
    - correct suite execution
    - artifacts uploaded
    - failures show clear signals

## Boundaries
- Do not hardcode secrets or base URLs in workflow YAML.
- Do not add third-party actions without reviewing supply-chain risk.
- Do not make PR gating flaky; move unstable suites to scheduled runs.
