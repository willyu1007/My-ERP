# Procedure: Run Cypress locally (debug)

**Base (references):** `.ai/skills/testing/test-web-cypress/reference/`

## Goal
Run and debug Cypress tests locally with:
- minimal time to reproduce failures
- consistent environment selection
- access to screenshots/videos and runner logs

## Inputs (collect before edits)
- Which spec(s) to run
- Base URL / environment
- Whether the issue is timing/network/data related

## Steps
1) **Verify Cypress installation**
   - `npx cypress --version`
   - `npx cypress verify`

2) **Set environment**
   - Set base URL (choose one):
     - via config (`cypress.config.*`)
     - via env (`CYPRESS_baseUrl=...`)
   - Export auth-related env vars as needed (never commit).

3) **Run narrow scope first**
   - Single spec:
     - `npx cypress run --spec <path-to-spec>`
     - Notes:
       - Use the path that matches your repo’s `specPattern` (check `cypress.config.*`).
       - Common layouts: `cypress/e2e/...` or `tests/web/cypress/specs/...`.
   - Use `--browser` if you need parity with CI.

4) **Use interactive runner**
   - `npx cypress open`
   - Re-run the failing spec in the GUI, inspect command logs and snapshots.

5) **Inspect artifacts**
   - Screenshots/videos are expected under `artifacts/cypress/` (if config aligned).
   - Confirm the captured screenshot corresponds to the failing step.

6) **Classify the failure**
   - Selector issue (wrong target / not stable)
   - Network issue (API failure, slow response, stub mismatch)
   - Data issue (unexpected state)
   - Environment issue (base URL, feature flags, auth)

## Outputs
- Reproduced failure locally (or confirmed environment-specific)
- A short failure classification + suggested fix direction

## Required verification
- Re-run the spec after change:
  - `npx cypress run --spec <path-to-spec>`
- Confirm the failure no longer reproduces.

## Boundaries
- Do not "fix" by adding unconditional sleeps.
- Do not ignore errors via `cy.on('uncaught:exception', ...)` unless you have a documented rationale.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| `cypress open` blank window | Browser compatibility issue | Try `--browser chrome` or update Cypress |
| Tests pass in open, fail in run | Timing differences | Add explicit waits for critical elements |
| Videos not generated | Running in open mode | Videos only generate in `cypress run` |
| Spec not found | Wrong path or pattern | Check `specPattern` in config matches file location |

### Common Issues

**1. Interactive mode (cypress open) very slow**
- Disable video recording for local dev: `video: false`
- Reduce `numTestsKeptInMemory` in config

**2. Different behavior open vs run**
- `cypress run` is headless by default with different timing
- Use `--headed` flag in run mode to debug

**3. Can't see network requests**
- Use `cy.intercept()` to log: `cy.intercept('**/*').as('all')`
- Check DevTools Network tab in interactive mode
