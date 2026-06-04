---
name: gitlab-ci
description: GitLab CI skill: integrate automated tests (web/api/mobile/perf) with consistent artifacts.
---

# GitLab CI Integration (workflow)

## Operating mode (token-efficient)
- Treat this skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow the chosen procedure end-to-end.

## Routing (pick one procedure)

| Task | Open this procedure | Optional templates |
|---|---|---|
| Enable/adjust test jobs (web/api/mobile/perf) | `reference/procedures/enable-test-jobs.md` | `reference/templates/gitlab-ci/` |
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
   - Always upload artifacts even on failure: `artifacts/` or `artifacts/<suite>/`
   - Keep artifacts size-bounded (videos/traces on failure only when possible).

3) **Secrets management**
   - Use GitLab CI variables (masked/protected).
   - Never echo secrets in logs.

4) **Gating policy**
   - MR gating should run only fast, stable suites.
   - Heavy suites (mobile, load/stress) should be scheduled or manually triggered.

## Minimal inputs before changing CI
- Whether `.gitlab-ci.yml` already exists and how the file is structured (includes, stages)
- Which suites are MR-gated vs scheduled
- Required CI variables and how they map to env vars
- Runner constraints (Docker executor, macOS runners for iOS, etc.)

## Verification

- If you changed **skills**:
  - `node .ai/scripts/lint-skills.mjs --strict`
  - `node .ai/skills/features/ci/gitlab-ci/scripts/validate-skill.mjs`

- If you changed **.gitlab-ci.yml**:
  - Trigger a pipeline and confirm:
    - correct suite execution
    - artifacts retained
    - failures show clear signals

## Boundaries
- Do not hardcode secrets or base URLs in `.gitlab-ci.yml`.
- Do not make MR gating flaky; move unstable suites to scheduled runs.
