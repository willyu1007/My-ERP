# Procedure: Enable/adjust test jobs in GitHub Actions

**Base (references):** `.ai/skills/features/ci/github-actions-ci/reference/`

## Goal
Enable automated test suites in GitHub Actions with:
- clear separation by suite (api/web/perf/mobile)
- deterministic commands and artifact paths
- appropriate runner selection and gating policy

## Inputs (collect before edits)
- Which suites are PR-gated vs scheduled
- OS runner requirements:
  - Web/API/Perf typically `ubuntu-latest`
  - iOS mobile tests require `macos-*`
- Node version (and package manager)
- Required secrets and env var mapping

## Steps
1) **Ensure canonical commands exist**
   - Before wiring CI, ensure each suite has a single command that:
     - exits non-zero on failures
     - writes artifacts to `artifacts/<suite>/`
   - Typical mapping:
     - Newman → `artifacts/newman/`
     - Playwright → `artifacts/playwright/`
     - Cypress → `artifacts/cypress/`
     - k6 → `artifacts/k6/`
     - Detox → `artifacts/detox/`
     - Maestro → `artifacts/maestro/`
     - Appium → `artifacts/appium/`

2) **Pick the gating policy**
   - PR gating (recommended baseline):
     - API (Newman)
     - One Web suite (Playwright *or* Cypress, not both unless necessary)
     - k6 smoke (low intensity)
   - Scheduled / manual:
     - mobile suites
     - load/stress performance
     - cross-browser matrices if expensive

3) **Add jobs (or steps) per suite**
   - Use `reference/templates/github-actions/ci.yml` as a starting point.
   - Each job should:
     - checkout code
     - setup runtime (Node)
     - install deps (with caching where appropriate)
     - run the canonical test command
     - upload artifacts

4) **Runner selection**
   - Web/API/Perf:
     - `runs-on: ubuntu-latest`
   - iOS (Detox/Appium):
     - `runs-on: macos-*` and ensure Xcode toolchain is available
   - Android:
     - `ubuntu-latest` with Android SDK setup (or self-hosted runners)

5) **Timeouts and retries**
   - Set job-level `timeout-minutes` to prevent hangs.
   - Use framework retries sparingly; prefer fixing determinism.

6) **Secrets injection**
   - Map secrets to env vars consumed by test commands.
   - Ensure logs do not print secrets.

## Outputs
- Updated `.github/workflows/*` with enabled test jobs
- Suites mapped to commands and artifact paths

## Required verification
- Trigger CI on a PR and confirm:
  - PR-gated suites run as expected
  - artifacts upload successfully on both pass and fail
  - failure output is actionable (links to artifacts)

## Boundaries
- Do not run heavy mobile/perf suites on every PR by default.
- Do not keep flaky suites as PR blockers; move them to scheduled runs until stabilized.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Job skipped unexpectedly | `if:` condition or path filter | Check job conditions and trigger events |
| pnpm/npm cache miss | Wrong cache key or lock file | Verify cache key includes lock file hash |
| Secret not available | Wrong secret name or scope | Check repository/org secret settings |
| macOS runner slow/unavailable | Resource contention | Use larger runner or schedule off-peak |

### Common Issues

**1. Dependencies install every run**
- Verify cache configuration uses correct key
- For pnpm: cache `.pnpm-store/`, key on `pnpm-lock.yaml`
- Add `cache: 'pnpm'` to `actions/setup-node`

**2. Tests pass locally but fail in CI**
- Check Node version matches
- Verify env vars are set in CI
- Check if BASE_URL is accessible from runner

**3. Timeout on browser install**
- Use `--with-deps` for system dependencies
- Consider caching browser binaries
- Use official browser images (Playwright/Cypress)
