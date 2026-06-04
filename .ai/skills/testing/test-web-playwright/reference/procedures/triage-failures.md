# Procedure: Triage Playwright failures / reduce flakiness

**Base (references):** `.ai/skills/testing/test-web-playwright/reference/`

## Goal
Turn a failing/flaky Playwright run into:
- a reproducible minimal case
- a clear classification (test bug vs product bug vs infra/env)
- a fix with stable, deterministic behavior

## Inputs (collect before edits)
- Failing spec/test name(s)
- Execution environment (local/CI, base URL, browser)
- Artifacts: trace, screenshot, video, logs, report

## Steps
1) **Confirm failure category**
   - **Infra/env**: DNS, timeouts to base URL, auth provider down, rate limits
   - **Product bug**: deterministic failure aligned with code change
   - **Test bug/flaky**: non-deterministic; depends on timing/order/state

2) **Reproduce with minimum scope**
   - Run only the failing spec.
   - Disable parallelism temporarily (if needed) to confirm shared state issues.

3) **Inspect Playwright trace / report**
   - Use trace to pinpoint:
     - which locator failed
     - whether UI was in expected state
     - if navigation/network requests stalled
   - Capture the exact “first bad state” step.

4) **Fix strategy (preferred order)**
   1. Improve selector stability (testid/role-based).
   2. Replace implicit timing with explicit readiness assertions.
   3. Make data deterministic (seed/setup/cleanup).
   4. If async background jobs exist, add API-level polling with a bounded timeout.
   5. Only if unavoidable: add a bounded wait tied to a condition (never `sleep`).

5) **Harden against order dependence**
   - Ensure each test sets up its own state.
   - Avoid relying on previously created entities unless explicitly created in `beforeEach`.

6) **Produce a concise RCA note**
   - What failed (symptom)
   - Why (root cause)
   - Fix applied (test vs product)
   - Follow-ups (e.g., add testid, add API seed endpoint)

## Outputs
- A deterministic test (or a documented product bug) with clear evidence
- Updated artifacts contract remains intact (still under `artifacts/playwright/`)

## Required verification
- Re-run the failing tests N times (recommended N=3) locally or in CI.
- Confirm no new flakiness introduced:
  - parallel run (if your suite uses parallelism)
  - target browser(s) as configured

## Boundaries
- Do not paper over product bugs with over-permissive assertions.
- Do not suppress failures by disabling tests without a replacement plan.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Flaky ~10-20% of runs | Race condition or timing | Add explicit waits, check network idle state |
| Always fails in CI, passes locally | Env differences | Compare `BASE_URL`, auth, viewport, parallelism |
| Trace shows element was visible | Assertion ran too early | Use `await expect().toBeVisible()` before interact |
| Screenshot shows wrong page | Navigation not complete | Wait for specific element indicating page ready |

### Common Issues

**1. Test order dependency**
- Run tests in isolation: `npx playwright test --workers=1`
- If it passes, there's shared state; add proper setup/teardown

**2. Network timing flakiness**
- Use `page.waitForResponse()` for critical API calls
- Mock unstable third-party endpoints with `page.route()`

**3. Animation-related failures**
- Disable animations in test: `page.emulateMedia({ reducedMotion: 'reduce' })`
- Or wait for animation to complete before asserting

**4. Parallel test interference**
- Ensure tests create unique data (timestamps/UUIDs)
- Use `test.describe.serial()` only when truly needed
