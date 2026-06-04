# Procedure: Bootstrap Cypress in a repo

**Base (references):** `.ai/skills/testing/test-web-cypress/reference/`

## Goal
Bootstrap Cypress E2E testing with:
- Cypress-standard project layout (unless repo already dictates otherwise)
- a single CI-friendly entrypoint command
- consistent artifacts under `artifacts/cypress/`
- stable selectors and deterministic network behavior

## Inputs (collect before edits)
- Package manager: `npm` / `pnpm` / `yarn`
- Repo type: single app vs monorepo (where Cypress should live)
- Base URL(s): local/dev/staging
- Auth strategy: UI login vs token/cookie injection
- Whether video recording is required (often “retain on failure” only)

## Steps
1) **Detect existing Cypress setup**
   - Look for: `cypress.config.mjs` (preferred), `.ts`, `.js`, or `cypress/` folder.
   - If it exists, do not re-init; only align artifacts + conventions.

2) **Install Cypress**
   - If missing:
     - `npm i -D cypress`
   - Verify:
     - `npx cypress verify`

3) **Initialize layout**
   - Prefer Cypress defaults:
     - `cypress/e2e/`
     - `cypress/fixtures/`
     - `cypress/support/`
   - If the repo requires `tests/` root:
     - configure `e2e.specPattern` accordingly.

4) **Configure baseUrl + retries**
   - In `cypress.config.mjs` (ESM, preferred) or `.ts`/`.js`:
     - set `e2e.baseUrl` via env var (pick one and standardize):
       - `CYPRESS_baseUrl` (Cypress config override)
       - `BASE_URL` (recommended for consistency across suites)
       - `WEB_BASE_URL` (common when separating web vs API endpoints)
     - set `retries` (recommended: enabled for CI, modest values)
     - set timeouts intentionally (avoid huge defaults)

5) **Align artifacts to the contract**
   - Configure:
     - `screenshotsFolder: 'artifacts/cypress/screenshots'`
     - `videosFolder: 'artifacts/cypress/videos'`
   - Consider:
     - `video: true` with retention policies depending on your runner/plugins.

6) **Add a single CI-friendly command**
   - Add script (preferred) or document exact command:
     - `test:e2e:cypress` → `npx cypress run`
   - Ensure the command is headless and reproducible.

7) **Add a smoke spec**
   - Create a smoke spec under your configured spec folder (examples: `cypress/e2e/smoke.cy.*` or `tests/web/cypress/specs/smoke.cy.*`) that:
     - visits `/`
     - asserts a stable element using `data-cy`/`data-testid` or role-based selectors

8) **Document env vars**
   - Minimum:
     - base URL variable(s)
     - auth variables (as secrets, never committed)

## Outputs
- Cypress config (`cypress.config.mjs` preferred, or `.ts`/`.js`) aligned to artifact contract
- Cypress test layout (default `cypress/` or repo-specific `tests/.../cypress/`) with at least one smoke test
- A deterministic CI entrypoint command (`test:e2e:cypress` or equivalent)
- Artifacts produced under `artifacts/cypress/`

## Required verification
- `npx cypress --version`
- `npx cypress run`
- Confirm artifacts exist:
  - `artifacts/cypress/` contains screenshots/videos (as configured)

## Boundaries
- Do not hardcode credentials or tokens.
- Do not rely on fixed sleeps.
- Do not couple tests to unstable UI text unless the text is part of the contract.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| `npx cypress verify` fails | Missing system dependencies | Run `npx cypress install --force` |
| Electron app won't launch | Display server missing (Linux) | Use `xvfb-run` or set `DISPLAY` |
| Config file not found | Wrong config extension/location | Use `cypress.config.mjs` (preferred), `.ts`, or `.js` in project root |
| Videos not recording | Config disabled or disk space | Check `video: true` in config |

### Common Issues

**1. Cypress fails to install behind proxy**
- Set `HTTP_PROXY` and `HTTPS_PROXY` env vars
- Or set `CYPRESS_INSTALL_BINARY` to a local path

**2. Chrome crashes in CI (Docker)**
- Use official Cypress Docker images: `cypress/browsers:*`
- Add `--disable-dev-shm-usage` via `CYPRESS_CHROME_FLAGS`
- Increase shared memory: `--shm-size=2gb` in Docker

**3. baseUrl not applied**
- Confirm which variable your repo uses for `e2e.baseUrl` (examples: `CYPRESS_baseUrl`, `BASE_URL`, `WEB_BASE_URL`).
- If using `CYPRESS_baseUrl`, it is case-sensitive.
- Or set `e2e.baseUrl` directly in the config file.
