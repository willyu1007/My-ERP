# Procedure: Add a new Cypress E2E test/spec

**Base (references):** `.ai/skills/testing/test-web-cypress/reference/`

## Goal
Add an E2E spec that is:
- readable (clear arrange/act/assert)
- stable (selector + retry-ability + network control)
- CI-friendly (produces artifacts and fails for real regressions)

## Inputs (collect before edits)
- Target user journey and success criteria
- Target environment(s) and base URL
- Data prerequisites (feature flags, seeded data)
- External dependencies to stub vs run live

## Steps
1) **Create the spec in the correct location**
   - Use your repo’s configured E2E spec location (check `cypress.config.*` → `e2e.specPattern`).
   - Common layouts:
     - Cypress default: `cypress/e2e/<feature>.cy.*`
     - tests/ root pattern: `tests/web/cypress/specs/<feature>.cy.*`
   - Keep names descriptive and scoped.

2) **Use stable selectors**
   - Prefer `cy.get('[data-cy="..."]')` or `data-testid`.
   - Avoid brittle selectors (deep DOM chains, dynamic classnames).

3) **Use Cypress retry-ability (avoid sleeps)**
   - Prefer `cy.contains(...).should(...)` and `cy.get(...).should(...)`.
   - Avoid `cy.wait(<ms>)` except for controlled, bounded debugging.

4) **Control network deterministically (where appropriate)**
   - Use `cy.intercept()` to:
     - stub third-party/non-critical calls
     - wait on key API calls (`cy.wait('@alias')`) rather than sleeping
   - Keep stubs minimal and contract-based.

5) **Handle authentication deterministically**
   - Prefer programmatic login (token/cookie injection) if your app supports it.
   - If UI login is required:
     - encapsulate it as a custom command in `cypress/support/commands.*`
     - keep selectors stable and assert on “logged-in” readiness

6) **Make test data deterministic**
   - Use unique identifiers for created entities.
   - Clean up when running against shared environments (if possible).
   - Avoid asserting on data that can change outside your test.

7) **Add targeted diagnostics**
   - Log key IDs (non-secret) for debugging.
   - Keep logs concise; avoid dumping full payloads unless needed.

## Outputs
- New spec under your configured spec folder (examples: `cypress/e2e/` or `tests/web/cypress/specs/`)
- Any shared commands/utilities under your configured support folder (examples: `cypress/support/` or `tests/web/cypress/support/`)
- If new stable selectors are required, document them for the feature team

## Required verification
- Run the new spec:
  - `npx cypress run --spec <path-to-new-spec>`
- Then run the suite:
  - `npx cypress run`
- Confirm artifacts on failure land in `artifacts/cypress/`

## Boundaries
- Do not overuse global stubs that mask real integration issues.
- Do not weaken assertions to reduce failure rate.
- Avoid cross-spec dependencies; each spec must run in isolation.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| `cy.intercept()` not catching requests | Request fires before intercept | Move intercept before action that triggers request |
| Element detached from DOM | React/Vue re-render | Re-query element or use `.should()` for retry |
| Cross-origin error | Navigating to different domain | Use `cy.origin()` (Cypress 10+) or adjust `chromeWebSecurity` |
| Custom command not found | Not imported in support file | Add import to `cypress/support/e2e.js` |

### Common Issues

**1. cy.intercept() doesn't match**
- Check URL pattern: use `**/api/endpoint` not just `/api/endpoint`
- Verify HTTP method matches (GET vs POST)
- Use `cy.intercept({ method: 'GET', url: '**/api/*' })`

**2. Assertions fail despite element visible**
- Element may be covered by another element
- Use `cy.get().should('be.visible').click({ force: true })` only if intentional

**3. Test data bleeding between specs**
- Use `beforeEach` to reset state
- Leverage `cy.session()` for auth isolation
