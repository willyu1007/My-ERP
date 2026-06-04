# Procedure: Troubleshoot GitLab CI failures

**Base (references):** `.ai/skills/features/ci/gitlab-ci/reference/`

## Goal
Diagnose GitLab CI failures quickly by:
- distinguishing runner/toolchain issues from real test failures
- using artifacts and reports to reproduce
- fixing root causes instead of masking symptoms

## Inputs (collect before edits)
- Pipeline + job name(s)
- Runner type/tags and environment
- Job logs and retained artifacts

## Steps
1) **Classify failure type**
   - **Runner/infra**: image pull failures, out-of-disk, network issues, missing SDK
   - **Configuration**: missing CI variables, wrong base URL, wrong tags
   - **Test failure**: assertions with clear evidence
   - **Flaky**: intermittent failures

2) **Find the first failing step**
   - Start at the earliest error in the job log.

3) **Validate runner environment**
   - Confirm the runner has required dependencies:
     - Node version
     - browsers/toolchains (if needed)
     - Android/iOS toolchain (for mobile)

4) **Review artifacts + reports**
   - Use `artifacts/<suite>/` and JUnit output to locate failing tests quickly.

5) **Fix strategy**
   - Infra/toolchain:
     - stabilize base images
     - add caching
     - pin versions where necessary
   - Config:
     - align variable names
     - add pre-flight checks (base URL reachable)
   - Test:
     - fix determinism; avoid sleeps

6) **Add guardrails**
   - Timeouts to avoid hung jobs.
   - Clear artifact paths and job naming.

## Outputs
- A fix MR for CI config and/or tests
- A short RCA note describing cause and mitigation

## Required verification
- Re-run pipeline on the fix MR and confirm stability.

## Boundaries
- Do not silence failures by skipping tests.
- Do not move real regressions out of MR gating without an owner and plan.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Jobs suddenly all fail | Runner update or secret expiry | Check runner status, verify secrets |
| "script failed with exit code 1" | Test or command failure | Check job log for actual error |
| Pipeline stuck in "running" | Job timeout or hung process | Add `timeout:` to jobs |
| "This job is stuck" | No available runners | Verify runner tags and availability |

### Common Issues

**1. Docker executor out of disk**
- Add `GIT_CLEAN_FLAGS: -ffdx` to clean workspace
- Configure runner to prune Docker images
- Use smaller base images

**2. Network timeouts**
- May be DNS or proxy issues
- Add retry logic for downloads
- Use internal mirrors for dependencies

**3. Flaky tests only in CI**
- Runner environment differs from local
- Check resource limits (memory/CPU)
- Verify same versions of tools are used
