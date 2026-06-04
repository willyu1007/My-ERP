---
name: test-web-cypress
description: Cypress Web UI E2E automation: bootstrap, author specs, run/debug, and triage failures with consistent artifacts and CI hooks.
---

# Cypress Web UI Automation (workflow)

## Operating mode (token-efficient)
- Treat this skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow it end-to-end.
- Prefer deterministic tests and actionable failure output.

## Routing (pick one procedure)

| Task | Open this procedure | Optional examples |
|---|---|---|
| Bootstrap Cypress in a repo | `reference/procedures/bootstrap.md` | `reference/examples/cypress.config.ts` |
| Add a new E2E test/spec | `reference/procedures/add-test.md` | `reference/examples/smoke.cy.ts`, `reference/examples/commands.ts` |
| Run locally (debug) | `reference/procedures/run-local.md` | — |
| Triage failures / reduce flaky | `reference/procedures/triage-failures.md` | — |

## Shared non-negotiables (apply to all procedures)
1) **Stable selectors**
   - Prefer `data-cy` / `data-testid` attributes.
   - Avoid selectors that depend on layout or auto-generated classnames.

2) **No fixed sleeps**
   - Do not use `cy.wait(1000)` as a primary strategy.
   - Use Cypress built-in retry-ability + assertions + `cy.intercept()` for network readiness.

3) **Network control (when appropriate)**
   - For non-critical external dependencies, prefer deterministic stubs via `cy.intercept()`.
   - For core integration flows, run against a stable staging environment.

4) **Artifact contract (for CI + triage)**
   - Standardize under: `artifacts/cypress/`
   - Store: screenshots, videos (optional), and machine-readable results (e.g., JUnit).

5) **No secrets in repo**
   - Credentials must come from CI secrets / local env vars.
   - Never commit tokens, cookies, or real user passwords.

## Minimal inputs you should capture before changing code
- Target environment(s): local / dev / staging
- Base URL and route(s) to cover
- Auth approach (UI login vs token injection)
- External dependencies that should be stubbed vs real
- Test data strategy (seeded fixtures, dedicated test tenant)

## Verification
- If you changed **skills**:
  - Prefer host-repo tooling if present:
    - `node .ai/scripts/lint-skills.mjs --strict`
  - Always run the local validator:
    - `node .ai/skills/testing/test-web-cypress/scripts/validate-skill.mjs`

- If you changed **tests/config**:
  - `npx cypress --version`
  - `npx cypress verify`
  - `npx cypress run`

## Boundaries
- Do not edit `.codex/skills/` or `.claude/skills/` directly (generated).
- Do not introduce a second Web UI framework if Cypress is the chosen tool for the suite.
- Do not rely on production data or production credentials.
- Do not disable assertions to "make tests pass"; fix the determinism issue.

## Reconnaissance-then-action workflow (borrowed)

When adding or debugging Cypress E2E tests:

1. **Reconnaissance**
   - Confirm the target app is running and reachable.
   - Use the Cypress runner to inspect the rendered DOM.
   - Identify stable selectors (`data-cy`, `data-testid`, or roles).
   - Prefer intercepts and explicit assertions over fixed waits.

2. **Action**
   - Implement the interaction using stable selectors.
   - Assert on outcomes (visible UI state, route, network behavior) rather than layout details.

### If Cypress and Playwright skills are both loaded

- Do not attempt to use both frameworks in the same test suite.
- Choose the framework already present in the repo (or explicitly requested by the user) and proceed with that skill's procedures.
