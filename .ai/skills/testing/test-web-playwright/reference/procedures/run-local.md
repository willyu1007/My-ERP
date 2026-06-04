# Procedure: Run Playwright locally (debug)

**Base (references):** `.ai/skills/testing/test-web-playwright/reference/`

## Goal
Run and debug Playwright tests locally with:
- minimal time to reproduce failures
- consistent environment selection
- easy access to traces/reports

## Inputs (collect before edits)
- Which spec(s) to run
- Base URL (or environment) to target
- Whether the failure is timing-related or data-related

## Steps
1) **Ensure dependencies are installed**
   - `npx playwright --version`
   - If browsers are missing:
     - `npx playwright install --with-deps`

2) **Set environment**
   - Export `BASE_URL` (or your repo’s equivalent).
   - If auth is required, export required env vars (never commit).

3) **Run a narrow scope first**
   - Single file:
     - `npx playwright test path/to/spec --reporter=line`
   - Single test:
     - `npx playwright test -g "test name"`

4) **Use interactive debugging when needed**
   - UI mode:
     - `npx playwright test --ui`
   - Headed mode:
     - `npx playwright test --headed`
   - Inspector:
     - `npx playwright test --debug`

5) **Inspect artifacts**
   - If trace is enabled on retry:
     - locate traces under `artifacts/playwright/` (config-dependent)
   - HTML report:
     - `npx playwright show-report artifacts/playwright/report`

6) **Classify the failure**
   - Selector issue (element not found / multiple matches)
   - Timing issue (timeouts)
   - Data issue (unexpected state)
   - Environment issue (base URL, auth, feature flags)

## Outputs
- Reproduced failure locally (or confirmed environment-specific)
- A short failure classification + suggested fix direction

## Required verification
- Re-run the test after change:
  - `npx playwright test path/to/spec`
- Confirm the failure no longer reproduces.

## Boundaries
- Do not "fix" by adding unconditional sleeps.
- Do not broaden assertions to meaningless checks ("page loads" only).

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| `--ui` mode blank screen | Port conflict or browser issue | Try different port: `--ui-port=8080` |
| `--debug` not pausing | Breakpoint not set | Add `await page.pause()` in test code |
| Trace files too large | Video/screenshot on all tests | Set `trace: 'on-first-retry'` only |
| Report command fails | Report not generated | Ensure `reporter: ['html']` in config |

### Common Issues

**1. Cannot connect to browser in headed mode**
- On Linux without display: use `xvfb-run npx playwright test --headed`
- Or run in UI mode which provides its own display

**2. Tests hang indefinitely**
- Check for unresolved promises or missing `await`
- Add global timeout in config: `timeout: 30000`

**3. Different results headed vs headless**
- Headed mode may have different timing
- Check viewport size matches config
- Some sites detect headless; use `--headed` to debug
