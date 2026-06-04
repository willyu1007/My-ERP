# Procedure: Interpret k6 regressions

**Base (references):** `.ai/skills/testing/test-perf-k6/reference/`

## Goal
Interpret a k6 failure/regression with:
- a clear explanation of which metric breached thresholds
- a hypothesis grounded in evidence (latency vs errors vs throughput)
- next steps for debugging (service logs, tracing, profiling)

## Inputs (collect before edits)
- k6 CLI output (threshold failures)
- `artifacts/k6/summary.json`
- Target environment details (deploy version, region, capacity)

## Steps
1) **Identify breached thresholds**
   - Determine which metrics failed (p95 latency, error rate, etc.).
   - Confirm whether failures are widespread or endpoint-specific (tags help).

2) **Classify the regression type**
   - Latency-only regression (errors stable)
   - Error-rate regression (timeouts/5xx)
   - Throughput regression (requests/sec dropped)

3) **Correlate with deploy changes**
   - Compare the release changeset with the time of regression.
   - If possible, compare to the last known good summary.

4) **Generate a debugging plan**
   - Latency: check DB queries, cache hit rate, external dependencies, p95/p99 traces.
   - Errors: check logs for 5xx, saturation, rate limits, circuit breakers.
   - Throughput: check CPU/memory, autoscaling, connection pool constraints.

5) **Decide on action**
   - If thresholds are correct: treat as a regression and fix.
   - If thresholds are wrong: adjust with documented rationale and stakeholder sign-off.

## Outputs
- A short regression note:
  - what failed + how severe
  - suspected cause(s)
  - next steps / owner

## Required verification
- After fixes or threshold adjustments, re-run the scenario and confirm results meet thresholds.

## Boundaries
- Do not "fix" regressions by raising thresholds without evidence and agreement.
- Do not compare runs across different environments without documenting differences.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Sudden latency spike | New code path or N+1 query | Check APM traces, DB slow query logs |
| Error rate increase | Downstream service failure | Check dependency health, circuit breaker status |
| Throughput drop | Resource saturation | Check CPU/memory, connection pools, autoscaling |
| Metrics inconsistent run-to-run | Environment instability | Use dedicated perf environment, check for noisy neighbors |

### Common Issues

**1. Can't reproduce regression locally**
- Local environment differs (network, resources)
- Use same VU count and duration as CI
- Check if issue is load-dependent (only appears at scale)

**2. Regression appeared without code change**
- Infrastructure change (new deployment, scaling event)
- Dependency update (DB, cache, external API)
- Data growth (larger dataset, more records)

**3. False positive (threshold too strict)**
- Review historical p95/p99 data
- Add buffer to thresholds (e.g., p95<500 → p95<600)
- Document rationale for any threshold change
