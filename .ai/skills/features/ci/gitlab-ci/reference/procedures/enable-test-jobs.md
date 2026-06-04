# Procedure: Enable/adjust test jobs in GitLab CI

**Base (references):** `.ai/skills/features/ci/gitlab-ci/reference/`

## Goal
Enable automated test suites in GitLab CI with:
- clear stages and suite separation
- deterministic commands and artifact paths
- runner selection aligned to platform needs

## Inputs (collect before edits)
- Which suites are MR-gated vs scheduled
- Runner type(s): Docker executor, shell runner, macOS runners for iOS
- Node version and package manager
- Required CI variables and mapping to env vars

## Steps
1) **Ensure canonical commands exist**
   - Each suite must have one deterministic command and artifact output under:
     - `artifacts/<suite>/`

2) **Define stages**
   - Typical:
     - `lint` → `test` → `perf` (or merge perf into test)
   - Keep MR gating minimal (fast suites).

3) **Add jobs per suite**
   - Use `reference/templates/gitlab-ci/.gitlab-ci.yml` as a starting point.
   - Each job should:
     - install deps (use caching)
     - run canonical suite command
     - upload artifacts (always)

4) **Runner selection**
   - Web/API/Perf:
     - Docker image with Node (e.g., `node:20`) or your org standard
   - Perf k6:
     - use `grafana/k6` image or install k6 in the job
   - iOS mobile tests:
     - require a macOS runner (document tags)
   - Android tests:
     - require Android SDK (either a prepared image or a dedicated runner)

5) **Gating policy**
   - MR gating:
     - API + one web suite + perf smoke
   - Scheduled:
     - mobile suites and heavy perf

6) **Secrets**
   - Use masked/protected CI variables.
   - Do not print secrets.

## Outputs
- Updated `.gitlab-ci.yml` / templates with enabled test jobs
- Suites mapped to commands and artifact paths

## Required verification
- Trigger a pipeline and confirm:
  - MR-gated suites run
  - artifacts retained (pass/fail)
  - failure output is actionable

## Boundaries
- Do not run heavy suites on every MR by default.
- Do not keep flaky suites as MR blockers; move them to scheduled runs until stabilized.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Job pending indefinitely | No matching runner | Check tags match available runners |
| Cache not working | Wrong cache key or policy | Verify key includes lock file, use `pull-push` |
| Docker image pull fails | Registry auth or rate limit | Use authenticated registry or cache image |
| Variables not available | Wrong scope (protected/masked) | Check variable settings in CI/CD config |

### Common Issues

**1. No runners available**
- Check runner tags in job match available runners
- For shared runners, verify project has access
- Consider using `gitlab.com` shared runners if available

**2. Dependencies reinstall every job**
- Configure cache correctly with lock file in key
- Use `.cache-config` anchor for consistency
- Verify `cache: policy:` is set appropriately

**3. macOS runner not available**
- macOS runners require specific setup (GitLab SaaS or self-hosted)
- Use tags to select: `tags: [macos]`
- Consider scheduled runs for expensive mobile tests
