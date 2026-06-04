# Redis Playbook — Cache (Example)

## Context
- Use case: `cache`
- Deployment mode: `cluster`
- Scale: ~5k QPS, ~2M keys, values < 2KB
- Persistence: managed default

## Requirements
- Latency SLO: p95 < 10ms for cache hits
- Consistency: eventual
- Tolerable data loss: yes (cache only)

## Recommended approach
- Pattern: read-through cache with TTL + jitter and stale-while-revalidate
- Rationale: minimizes origin load while avoiding stampede during expirations

## Data layout
### Key naming
- Namespace: `myapp:cache:product:{productId}`
- Note: use hash tags `{productId}` so related per-product keys co-locate in cluster when needed

### Value shape
- Type: string (JSON)
- Fields: product summary payload

## TTL strategy
- Keys that MUST expire:
  - `myapp:cache:product:*`
- TTL values:
  - 10 minutes + jitter (±10%)
- Invalidation strategy:
  - explicit invalidation on product write, plus TTL as a safety net

## Guardrails (do and do not)
- Use `SCAN` for discovery; avoid `KEYS`.
- Delete in batches; prefer `UNLINK` for large values.

## Failure modes and mitigations
| Failure mode | Symptom | Mitigation | Verification |
|---|---|---|---|
| Cache stampede | origin spikes | single-flight lock + SWR | load test |
| Hot key | latency spikes | shard key suffix | perf test |

## Verification
- Functional: cache hit/miss behavior + invalidation tests
- Load: synthetic traffic at peak QPS
- Ops: monitor hit ratio, latency, evictions

## Rollback / mitigation
- Immediate mitigation: bypass cache on error; temporarily increase TTL
