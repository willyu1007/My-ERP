# Procedure: Troubleshoot GitHub Actions CI failures

**Base (references):** `.ai/skills/features/ci/github-actions-ci/reference/`

## Goal
Diagnose CI failures quickly by:
- separating infra/toolchain failures from real test failures
- using artifacts and logs to reproduce
- fixing root causes (not papering over)

## Inputs (collect before edits)
- Failing workflow + job name
- Commit/PR context (what changed)
- CI logs and uploaded artifacts

## Steps
1) **Classify failure type**
   - **Infra/toolchain**:
     - dependency install fails
     - runner out of disk/memory
     - network flakiness downloading browsers
   - **Configuration**:
     - wrong env vars, missing secrets, incorrect base URL
   - **Test failure**:
     - assertion failure with clear evidence
   - **Flaky test**:
     - intermittently fails without code change

2) **Check the earliest error**
   - Don’t start at the bottom; find the first failing step.

3) **Validate environment and secrets**
   - Confirm secrets are present (names match).
   - Confirm base URL is reachable from runner.

4) **Review artifacts**
   - For UI failures:
     - screenshots/traces/videos
   - For API failures:
     - Newman report + response snippet
   - For perf:
     - k6 summary JSON

5) **Fix strategy**
   - Infra/toolchain:
     - pin Node versions
     - fix caches
     - add timeouts and retry downloads (carefully)
   - Config:
     - align env var names and defaults
   - Test:
     - fix product/test determinism; avoid sleeps

6) **Add guardrails**
   - Add clear failure messages and summaries.
   - Add pre-flight checks (e.g., verify base URL reachable) to reduce noisy failures.

## Outputs
- A concrete fix PR (CI config and/or tests)
- A short note explaining the root cause and mitigation

## Required verification
- Re-run CI on the fix PR and confirm stability over at least one additional run.

## Boundaries
- Do not disable CI gating without a replacement plan.
- Do not hide failures by increasing timeouts blindly; identify the missing readiness condition.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| All jobs suddenly failing | Runner image updated or secret expired | Check GitHub status, verify secrets |
| Intermittent network failures | Rate limiting or DNS issues | Add retry logic for downloads |
| "Resource not accessible" | Permission or token scope issue | Check workflow permissions and PAT scopes |
| Workflow hangs indefinitely | Missing `timeout-minutes` | Add timeout to job and step levels |

### Common Issues

**1. Actions rate limiting**
- GitHub has API rate limits for actions
- Use caching to reduce downloads
- Self-hosted runners for high-frequency repos

**2. Secrets suddenly not working**
- Secrets may have been rotated
- Check if secret is at org vs repo level
- Verify secret name exactly matches (case-sensitive)

**3. Re-run doesn't fix flaky test**
- Flakiness may be time-dependent (timestamps, quotas)
- Check if test data was not cleaned up
- Review test isolation and parallelism
