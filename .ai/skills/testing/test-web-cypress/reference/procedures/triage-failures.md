# Procedure: Triage Cypress failures / reduce flakiness

**Base (references):** `.ai/skills/testing/test-web-cypress/reference/`

## Goal
Turn a failing/flaky Cypress run into:
- a reproducible minimal case
- a clear classification (test bug vs product bug vs infra/env)
- a fix that improves determinism without masking regressions

## Inputs (collect before edits)
- Failing spec/test name(s)
- Execution environment (local/CI, base URL, browser)
- Artifacts: screenshot/video, Cypress command log, network intercept logs

## Steps
1) **Classify the failure**
   - **Infra/env**: base URL unreachable, auth provider down, rate limits, CI resource issues
   - **Product bug**: deterministic functional regression
   - **Test flake**: timing/order/state sensitivity

2) **Reproduce with minimum scope**
   - Run only the failing spec.
   - If suite is parallelized, temporarily run single-threaded to detect shared-state issues.

3) **Inspect Cypress logs + snapshots**
   - Identify:
     - the exact command that failed
     - the expected DOM/network state at that moment
   - Verify whether an expected network request actually completed.

4) **Preferred fix order**
   1. Selector: move to stable `data-cy`/`data-testid`.
   2. Network readiness: use `cy.intercept()` + `cy.wait('@alias')` for the relevant call.
   3. Data determinism: seed, isolate, and clean up.
   4. Timeouts: increase only when the app truly needs it; keep bounded.
   5. Retries: use as a last line of defense, not as a primary fix.

5) **Stabilize authentication**
   - Prefer programmatic login and reuse it via `cy.session()` (if available in your Cypress version/config).
   - Avoid repeated UI login steps across specs.

6) **Write a short RCA note**
   - Symptom → Root cause → Fix → Follow-ups (e.g., add data-cy attributes)

## Outputs
- A deterministic spec (or a documented product bug) with evidence
- Artifacts remain under `artifacts/cypress/`

## Required verification
- Re-run the failing spec N times (recommended N=3) locally or in CI.
- Confirm the fix does not introduce masking (assertions still meaningful).

## Boundaries
- Do not suppress real failures by catching and ignoring app errors broadly.
- Do not disable the spec without a replacement plan and owner.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Random 1-in-5 failures | Race condition | Add `cy.wait('@apiCall')` before assertions |
| Always fails in CI | Resource constraints | Increase `defaultCommandTimeout`, check CI memory |
| Screenshot shows loading spinner | Page not ready | Wait for data: `cy.get('[data-loaded="true"]')` |
| "Timed out retrying" | Selector wrong or element conditional | Verify selector, add visibility check |

### Common Issues

**1. Flaky due to animations**
- Disable animations in test environment
- Or wait for animation: `cy.get('.element').should('not.have.class', 'animating')`

**2. Order-dependent failures**
- Run single spec: passes. Full suite: fails
- Check for shared state, use `beforeEach` to reset
- Isolate auth with `cy.session()`

**3. Network-related flakiness**
- Stub unreliable external APIs with `cy.intercept()`
- Add retry logic for critical checks
- Use `cy.wait('@alias')` instead of `cy.wait(ms)`

**4. Memory issues in CI**
- Split large spec files
- Reduce `numTestsKeptInMemory`
- Use `--spec` to run subsets
