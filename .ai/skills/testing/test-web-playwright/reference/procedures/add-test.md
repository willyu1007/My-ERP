# Procedure: Add a new Playwright E2E test/spec

**Base (references):** `.ai/skills/testing/test-web-playwright/reference/`

## Goal
Add an E2E spec that is:
- readable and maintainable (clear arrange/act/assert)
- stable (resilient selectors, no flakey timing)
- triage-friendly (produces useful artifacts on failure)

## Inputs (collect before edits)
- What user journey is being tested (happy path + key assertions)
- Target environment for execution (local/dev/staging)
- Data prerequisites (feature flags, seeded data, test tenant)
- Auth needs (pre-auth cookie, UI login, API login)

## Steps
1) **Choose the correct location**
   - Put specs under: `tests/web/playwright/specs/`
   - Name file: `<feature>.spec.ts` (or `.js`), keep it descriptive.

2) **Define the test scope**
   - Prefer 1 journey per test, 1–3 key assertions that prove value.
   - Avoid asserting on incidental UI (layout, pixel-perfect).

3) **Use stable locators**
   - Priority order:
     1. `getByTestId('...')` (or equivalent)
     2. `getByRole(...)` with accessible name
     3. text locators only when text is stable and intentional
   - Avoid long CSS chains and XPath.

4) **Replace sleeps with assertions**
   - Use `await expect(locator).toBeVisible({ timeout: ... })`
   - For navigation/data loads, assert on a stable “ready” condition.

5) **Handle authentication deterministically**
   - Prefer API-backed login + storage state (cookie/session) where feasible.
   - If UI login is required:
     - isolate it in a helper to avoid copy/paste
     - keep selectors stable and retries reasonable

6) **Make test data deterministic**
   - If the test creates data:
     - create uniquely named entities (timestamp or uuid)
     - clean up if the environment is shared
   - If the test reads data:
     - prefer seeded fixtures or a dedicated test tenant

7) **Add targeted diagnostics**
   - Use explicit step logging (when available) for complex flows.
   - Do not print secrets; redact tokens.

## Outputs
- A new spec under `tests/web/playwright/specs/`
- Any helper utilities under `tests/web/playwright/utils/` (if needed)
- Stable selectors / testids documented for product owners if new attributes are required

## Required verification
- Run only the new spec first:
  - `npx playwright test tests/web/playwright/specs/<feature>.spec.*`
- Then run the suite:
  - `npx playwright test`
- Confirm artifacts on failure land in `artifacts/playwright/`

## Boundaries
- Do not use production credentials or production-only flags.
- Do not disable assertions to avoid failures.
- Avoid network stubbing unless you have a clear contract (prefer real integration in staging).

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Element not found | Selector changed or dynamic | Use `getByTestId` or `getByRole` with stable attributes |
| Multiple elements matched | Non-unique selector | Add `.first()`, `.nth(n)`, or refine selector |
| Timeout waiting for element | Page not loaded or element conditional | Add explicit wait: `await expect(el).toBeVisible()` |
| Test passes locally, fails in CI | Environment differences | Check `BASE_URL`, auth state, viewport size |

### Common Issues

**1. Flaky element visibility**
- Avoid checking immediately after navigation
- Use `await page.waitForLoadState('networkidle')` if needed
- Prefer `toBeVisible()` over `toHaveCount(1)`

**2. Auth state not persisting**
- Ensure `storageState` path is correct in config
- Check that auth setup runs before dependent tests (use `dependencies`)

**3. Test data conflicts**
- Generate unique IDs: `const id = Date.now()`
- Clean up created data in `afterEach` or use isolated test tenants
