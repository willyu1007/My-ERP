# Procedure: Bootstrap Playwright in a repo

**Base (references):** `.ai/skills/testing/test-web-playwright/reference/`

## Goal
Bootstrap Playwright E2E testing with:
- a predictable directory layout
- a single entrypoint command suitable for CI
- consistent artifacts under `artifacts/playwright/`
- minimal flakiness by default (selectors + auto-wait + tracing)

## Inputs (collect before edits)
- Package manager: `npm` / `pnpm` / `yarn`
- Repo type: single app vs monorepo (where to place tests)
- Base URL(s): local/dev/staging
- Auth strategy: none / test user login / cookie injection / SSO bypass
- Browser scope: Chromium-only vs cross-browser

## Steps
1) **Detect existing Playwright setup**
   - Look for: `playwright.config.mjs` (preferred), `.ts`, `.js`, or existing `tests/` layout.
   - If it exists, do not re-init; only align artifacts + conventions.

2) **Install dependencies**
   - If missing:
     - `npm i -D @playwright/test`
     - `npx playwright install --with-deps`
   - If using `pnpm`/`yarn`, translate accordingly.

3) **Create/align directory layout**
   - Recommended (adapt to repo conventions):
     - `tests/web/playwright/`
       - `specs/`
       - `fixtures/`
       - `pages/` (optional POM)
       - `utils/`
   - Keep Playwright-specific assets under `tests/web/playwright/`.

4) **Create/align Playwright config**
   - Use `playwright.config.mjs` (ESM, preferred) or `.ts`/`.js`.
   - Ensure these baseline settings exist:
     - `use.baseURL` (via env var, e.g., `BASE_URL`)
     - `trace: 'on-first-retry'`
     - `screenshot: 'only-on-failure'`
     - `video: 'retain-on-failure'` (optional but recommended)
     - `outputDir: 'artifacts/playwright/test-results'`
     - HTML report output: `artifacts/playwright/report`
     - JUnit output: `artifacts/playwright/junit.xml` (or per-shard files)

5) **Add a single CI-friendly command**
   - Add a script (preferred) or document the exact command:
     - `test:e2e:playwright` → runs headless with deterministic settings.
   - Example:
     - `npx playwright test --reporter=html,junit`

6) **Add a smoke test**
   - Create one spec that:
     - navigates to the base URL
     - asserts a stable page element (by role or testid)
   - Keep it environment-agnostic (no prod-only assumptions).

7) **Document env vars**
   - Minimum:
     - `BASE_URL`
     - Any auth variables (e.g., `TEST_USER`, `TEST_PASS`) via secrets, never committed.

## Outputs
- Playwright config (`playwright.config.mjs` preferred, or `.ts`/`.js`) aligned to artifact contract
- `tests/web/playwright/` with an initial smoke spec
- One deterministic command for CI (`test:e2e:playwright` or equivalent)
- Artifacts produced under `artifacts/playwright/`

## Required verification
- `npx playwright --version`
- `npx playwright test`
- Confirm artifacts exist:
  - `artifacts/playwright/` contains report/results (and on failure: trace/screenshot/video as configured)

## Boundaries
- Do not hardcode credentials or tokens.
- Do not introduce fixed sleeps as a substitute for assertions.
- Do not write tests that depend on existing user data in shared environments.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| `npx playwright install` hangs or fails | Network/proxy issues | Set `PLAYWRIGHT_DOWNLOAD_HOST` or use offline cache |
| Browsers not found after install | Incomplete install | Run `npx playwright install --with-deps` with sudo if needed |
| Config file not recognized | Wrong file extension | Use `playwright.config.mjs` (ESM preferred), `.ts`, or `.js` |
| Tests fail with "base URL not set" | Missing env var | Export `BASE_URL` or set in config `use.baseURL` |

### Common Issues

**1. Browser installation fails behind corporate proxy**
- Set proxy env vars: `HTTP_PROXY`, `HTTPS_PROXY`
- Or download browsers manually and set `PLAYWRIGHT_BROWSERS_PATH`

**2. Permission denied on Linux CI**
- Ensure CI image has required dependencies: `npx playwright install-deps`
- Use official Playwright Docker image: `mcr.microsoft.com/playwright`

**3. TypeScript config not loading**
- Install `typescript` as dev dependency
- Ensure `tsconfig.json` exists with valid config
