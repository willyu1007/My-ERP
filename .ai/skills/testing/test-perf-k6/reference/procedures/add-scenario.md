# Procedure: Add a new k6 scenario (smoke/load/stress/soak)

**Base (references):** `.ai/skills/testing/test-perf-k6/reference/`

## Goal
Add a performance scenario that is:
- clearly scoped (what endpoints and what load model)
- threshold-driven (pass/fail is explicit)
- reproducible across runs and environments

## Inputs (collect before edits)
- Scenario type: smoke / load / stress / soak
- Target endpoints and success criteria
- Load model: VUs/arrival rate, ramping, duration
- Thresholds: latency (p95/p99), error rate, throughput
- Environment: staging vs dedicated perf environment

## Steps
1) **Create a new script file**
   - Place under `tests/perf/k6/scripts/`:
     - `load_<feature>.mjs`, `stress_<feature>.mjs`, etc.

2) **Define the load model explicitly**
   - Use k6 `options` to define:
     - stages or scenarios
     - duration/iterations
   - Keep the model readable and commented.

3) **Add thresholds**
   - Define thresholds for key metrics, e.g.:
     - `http_req_failed` rate
     - `http_req_duration` p95/p99
   - Document rationale and expected variance.

4) **Parameterize environment**
   - Use env vars:
     - `BASE_URL`
     - token/tenant headers (injected)
   - Avoid hardcoding hosts and secrets.

5) **Add tags for observability**
   - Tag requests by endpoint or feature for later aggregation.

6) **Export results**
   - Ensure CI exports summary JSON under `artifacts/k6/`.

## Outputs
- New scenario script committed in-repo
- Thresholds documented and enforced
- Consistent output to `artifacts/k6/`

## Required verification
- Dry-run / smoke-run the script at low load first.
- Then run the intended load model in a safe environment.

## Boundaries
- Do not set thresholds without stakeholder agreement (SLOs/SLAs).
- Do not run stress/soak on shared environments without coordination.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Thresholds not evaluated | No `thresholds` in options | Add `thresholds: { ... }` to `export const options` |
| All requests 0ms latency | Using wrong http import | Use `import http from 'k6/http'` |
| VUs not ramping as expected | Wrong stages config | Verify `stages` array syntax in options |
| Tags not appearing in results | Wrong tag syntax | Use `{ tags: { name: 'value' } }` in request params |

### Common Issues

**1. Thresholds pass but should fail**
- Ensure threshold syntax is correct: `['p(95)<500']` not `['p95<500']`
- Check metric name matches k6 built-in: `http_req_duration` not `http_duration`

**2. Script runs but no metrics**
- Verify `export default function()` exists
- Check that http requests are actually being made (not just defined)

**3. Memory issues with large tests**
- Reduce `--out` outputs if not needed
- Use `--no-vu-connection-reuse` cautiously (increases load)

**4. Different results each run**
- Add `randomSeed` for reproducible random data
- Ensure test data is deterministic
