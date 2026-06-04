# Common Redis pitfalls (and safer alternatives)

This reference is optimized for assistants: it highlights failure modes that commonly appear in real systems.

## Dangerous commands and patterns
### `KEYS *` in production
- **Problem**: `KEYS` blocks and can cause latency spikes or outages on large keyspaces.
- **Safer alternative**: use `SCAN` with `MATCH` + batching; perform deletes in batches.

### Mass deletion / `FLUSHALL` / `FLUSHDB`
- **Problem**: destructive, easy to run against the wrong environment.
- **Safer alternative**: prefix keys and delete by prefix using `SCAN` batches; require explicit approval and environment verification.

### No TTL on cache/session keys
- **Problem**: memory bloat and unexpected evictions.
- **Safer alternative**: always define TTL; use TTL jitter to avoid synchronized expiration.

### Hot keys
- **Problem**: a small number of keys dominate traffic and create CPU/latency hotspots.
- **Safer alternative**: shard keys (e.g., suffix buckets), add a local in-process cache, or redesign to reduce contention.

### Large values and unbounded collections
- **Problem**: memory blow-ups, slow persistence, large replication payloads.
- **Safer alternative**: keep values small; consider compressing; cap collection sizes; prefer streams for log-like data.

## Cluster-specific traps
- Multi-key operations can fail with cross-slot errors.
- Use hash tags `{...}` to co-locate keys when you truly need multi-key semantics, or redesign to single-key access.

## Locking traps
- Releasing a lock without a unique token can unlock someone else’s lock.
- Always use a unique token and an atomic release (Lua script) if implementing locks in Redis.

## Pub/Sub reliability
- Pub/Sub is ephemeral; messages are not durable.
- If you need durability/acknowledgement, use Redis Streams or another queue.
