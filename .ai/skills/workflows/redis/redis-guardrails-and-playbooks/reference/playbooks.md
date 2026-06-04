# Redis playbooks (typical scenarios)

This reference provides concise patterns that work well in production. Treat them as starting points; tailor based on constraints.

## 1) Cache
**Goal**: reduce backend load and latency.

Recommended baseline:
- Key naming: `<app>:cache:<domain>:<id>`
- TTL: define a TTL for every cache key; add jitter to avoid synchronized expiry
- Invalidation: explicit invalidation on write for critical entities; otherwise TTL-based
- Stampede protection:
  - request coalescing (single-flight)
  - small lock on recomputation, or stale-while-revalidate (serve stale, refresh async)

## 2) Rate limiting
**Goal**: enforce request quotas per user/IP/API key.

Simple fixed-window baseline:
- `INCR key` and `EXPIRE key <window>` on first increment
- Decide behavior on missing TTL (self-heal by setting TTL)

More accurate patterns:
- token bucket (often implemented with Lua for atomicity)
- sliding window (ZSET + timestamps, but be mindful of memory)

## 3) Distributed locks
**Goal**: prevent concurrent work on the same resource.

Safer primitive:
- Acquire: `SET lock:<id> <token> NX PX <ttl_ms>`
- Release: use a Lua script to delete only if token matches

Trade-offs:
- Redis-based locks are best-effort; for strict correctness, consider a system designed for consensus.

## 4) Sessions
**Goal**: store session state server-side.

Baseline:
- Key: `session:<session_id>`
- TTL: align with session expiry; refresh on activity if needed
- Keep session objects small; avoid unbounded growth

## 5) Queues / Streams
**Goal**: durable background processing.

Prefer:
- Redis Streams with consumer groups (ack/retry) for durability
Avoid:
- Lists for critical queues if you need strong durability and replay semantics

## 6) Keyspace migration
**Goal**: change key schema or move instances safely.

Technique:
- Introduce versioned prefixes (`v1:`, `v2:`)
- Dual-read (new then fallback old) and optionally dual-write during transition
- Backfill in batches, observe, then retire old keys
