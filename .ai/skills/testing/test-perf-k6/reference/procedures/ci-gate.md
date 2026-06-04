# Procedure: Add CI gating for k6 (threshold-based)

**Base (references):** `.ai/skills/testing/test-perf-k6/reference/`

## Goal
Gate changes in CI using k6 thresholds with:
- explicit pass/fail semantics (exit code)
- artifacts uploaded for analysis
- safe execution scope (smoke on PR, load on schedule)

## Inputs (collect before edits)
- Which scenario(s) are PR-gating vs scheduled
- Environment and base URL for CI
- Secret injection strategy for tokens
- Acceptable runtime budget for CI jobs

## Steps
1) **Define the gating policy**
   - PR/MR: run **smoke** scenario only (fast, low load).
   - Nightly/weekly: run load/stress/soak on a dedicated environment.

2) **Ensure thresholds exist**
   - CI gating requires thresholds; otherwise it becomes “observability only”.

3) **Add a single CI command**
   - `k6 run tests/perf/k6/scripts/smoke.mjs --summary-export artifacts/k6/summary.json`

4) **Upload artifacts**
   - Always upload `artifacts/k6/` even on failure.

5) **Integrate with CI platform**
   - Add a CI job for k6 in your chosen CI system (GitHub Actions / GitLab CI / other).
   - Keep k6 steps isolated and clearly named (`perf-smoke`).

## Outputs
- CI job that gates on k6 exit code (threshold failures)
- Uploaded artifacts for analysis

## Required verification
- Trigger the CI job on a known-failing threshold (temporarily) to confirm it fails the pipeline.
- Restore thresholds and confirm passing behavior.

## Boundaries
- Do not run high load in PR pipelines.
- Do not accept flakey perf gating; keep environment stable or restrict to scheduled runs.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| CI passes but thresholds failed | Exit code not checked | Verify CI checks `k6` exit code (non-zero on failure) |
| Artifacts not uploaded | Path mismatch | Ensure `artifacts/k6/` matches CI artifact config |
| Inconsistent CI results | Shared environment contention | Use dedicated perf environment or schedule runs |
| Docker pull fails in CI | Rate limits or network | Use pre-pulled images or private registry |

### Common Issues

**1. k6 exit code always 0**
- Thresholds must be defined to cause non-zero exit
- Check `thresholds` object exists in script options

**2. CI timeout before k6 completes**
- Reduce test duration for PR gating (smoke only)
- Increase CI job timeout if test is critical

**3. Env secrets not available**
- Verify CI secret names match script expectations
- Check secrets are exposed to the job/step
