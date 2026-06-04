# Procedure: Run k6 locally

**Base (references):** `.ai/skills/testing/test-perf-k6/reference/`

## Goal
Run k6 locally with:
- explicit environment selection
- reproducible commands
- exported artifacts for later comparison

## Inputs (collect before edits)
- Which script to run
- Base URL and required auth token(s)
- Whether you want smoke vs load intensity

## Steps
1) **Set environment variables**
   - `BASE_URL`
   - `API_TOKEN` (if needed)
   - Any additional headers/tenant identifiers

2) **Run a low-intensity smoke first**
   - Example:
     - `k6 run tests/perf/k6/scripts/smoke.mjs --summary-export artifacts/k6/summary.json`

3) **Run the intended scenario**
   - `k6 run tests/perf/k6/scripts/<scenario>.mjs --summary-export artifacts/k6/summary.json`

4) **Capture and review results**
   - Review thresholds pass/fail output.
   - Keep the JSON summary for comparison.

## Outputs
- CLI output with pass/fail status
- `artifacts/k6/summary.json`

## Required verification
- Confirm the command returns non-zero when thresholds fail (CI gating relies on this).
- Confirm the summary JSON is created.

## Boundaries
- Do not compare results across different environments without noting the difference.
- Do not run high-intensity scenarios on local dev machines if they cannot sustain the load model.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Connection refused errors | Target not running or wrong URL | Verify `BASE_URL` and target is accessible |
| Extremely slow on local machine | Too many VUs for local resources | Reduce VU count or use cloud execution |
| Results file not created | Directory doesn't exist | Create `artifacts/k6/` before running |
| Env vars undefined in script | Wrong access method | Use `__ENV.VAR_NAME` not `process.env` |

### Common Issues

**1. "too many open files" error**
- Increase ulimit: `ulimit -n 65535`
- Or reduce concurrent connections

**2. Local machine becomes unresponsive**
- k6 is CPU-intensive; reduce VUs
- Use `--vus 1 --iterations 1` for debugging

**3. Results differ from CI**
- Local network latency differs from CI
- Check if CI uses different BASE_URL or has VPN access
