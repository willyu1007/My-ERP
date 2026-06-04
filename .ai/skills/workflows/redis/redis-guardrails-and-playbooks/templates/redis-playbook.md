# Redis Playbook — <Scenario>

## Context
- Use case: `<cache|sessions|rate limiting|distributed locks|queue/streams|pub/sub>`
- Deployment mode: `<standalone|replica|cluster|unknown>`
- Scale: `<QPS, key count, value size>`
- Persistence: `<none|RDB|AOF|managed default|unknown>`

## Requirements
- Latency SLO: `<...>`
- Consistency: `<strong|eventual|best-effort>`
- Tolerable data loss: `<...>`
- Multi-region: `<yes|no>`

## Recommended approach
- Pattern: `<...>`
- Rationale: `<...>`

## Data layout
### Key naming
- Namespace: `<app>:<domain>:<entity>:<id>`
- Examples:
  - `<...>`

### Value shape
- Type: `<string|hash|set|zset|list|stream>`
- Schema/fields:
  - <...>

## TTL strategy
- Keys that MUST expire:
  - <...>
- TTL values:
  - <...>
- Invalidation strategy:
  - <write-through|write-behind|explicit invalidation|stale-while-revalidate>

## Guardrails (do and do not)
- **Do** use `SCAN` for discovery; avoid `KEYS`.
- **Do** delete in batches for large keyspaces.
- **Do** use unique key prefixes to enable scoped deletes.
- **Do not** run `FLUSHALL`/`FLUSHDB` without explicit approval and environment confirmation.

## Operations (safe commands)
> Replace placeholders and confirm environment before running.

- Discover keys (safe-ish):
  - `SCAN 0 MATCH <prefix:*> COUNT 1000`
- Delete keys in batches:
  - `<client-side: iterate SCAN results and DEL/UNLINK in batches>`
- Inspect memory:
  - `INFO MEMORY`
- Inspect latency/hot commands:
  - `SLOWLOG GET 10`

## Cluster notes (if applicable)
- Multi-key operations require hash tags: `{user:123}`
- Avoid cross-slot operations; redesign to single-key access patterns.

## Failure modes and mitigations
| Failure mode | Symptom | Mitigation | Verification |
|---|---|---|---|
| Cache stampede | spikes on misses | request coalescing / locks / SWR | load test |
| Hot key | high latency | key sharding / local cache | latency + CPU |
| Memory pressure | evictions | TTL tuning / smaller values | INFO MEMORY |

## Observability
- Metrics: memory used, evicted keys, keyspace hits/misses, latency
- Alerts: eviction spikes, latency spikes, replication lag (if used)

## Verification
- Functional: `<tests>`
- Load: `<synthetic traffic>`
- Ops: `<INFO, SLOWLOG, keyspace metrics>`

## Rollback / mitigation
- Immediate mitigation: `<disable feature / bypass cache / increase TTL>`
- Data recovery: `<restore snapshot (if used)>`
