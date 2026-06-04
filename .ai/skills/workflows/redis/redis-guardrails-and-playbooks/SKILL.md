---
name: redis-guardrails-and-playbooks
description: Provide Redis design/operation guardrails and scenario playbooks to prevent common mistakes (keys, TTL, memory, cluster, locks, rate limits).
---

# Redis Guardrails and Playbooks

## Purpose
Help an assistant propose safe, production-ready Redis patterns and operational guidance while avoiding high-risk mistakes.

## When to use
Use this skill when the user asks about:
- Using Redis as a cache, session store, rate limiter, lock provider, queue/stream, or pub/sub
- Choosing TTL, eviction, key naming, or data modeling in Redis
- Operating Redis safely (scanning keys, deleting keys, mitigating hot keys, memory issues)
- Migrating or scaling Redis (single node → replicas → cluster)

Avoid this skill when:
- The user needs vendor-specific operational runbooks (managed service dashboards, exact console clicks)
- The request is unrelated to Redis

## Inputs
- Scenario: what Redis is being used for (cache, sessions, rate limiting, locks, queues, pub/sub, etc.)
- Constraints: latency requirements, consistency needs, scale/QPS, key cardinality, data size, and deployment mode (standalone/replica/cluster)

If any of the above are missing or ambiguous, ask targeted questions before recommending a design.

## Outputs
- A structured playbook (Markdown) that includes:
  - recommended approach and data layout
  - key naming scheme and TTL strategy
  - operational guardrails (safe commands and anti-patterns)
  - failure modes and mitigation
  - verification and rollback guidance

## Steps
1. Clarify the scenario and constraints.
2. Identify the Redis deployment mode (standalone/replica/cluster) and persistence requirements.
3. Choose the closest playbook template and tailor it:
   - cache
   - sessions
   - rate limiting
   - distributed locks
   - queues/streams
4. Produce a safe design:
   - key naming and namespacing
   - TTL strategy (what should expire, when, and why)
   - read/write patterns and concurrency controls
5. Add guardrails:
   - prefer `SCAN` over `KEYS` for key discovery
   - avoid mass deletes without a plan (pipeline/batches)
   - call out cluster pitfalls (multi-key ops, hash tags)
6. Provide verification steps:
   - functional tests
   - load/latency checks
   - operational signals (memory, eviction, slowlog)
7. Provide a rollback or mitigation plan.

## Verification
- [ ] The recommendation matches the stated scenario and constraints
- [ ] Key naming and TTL strategy are explicit
- [ ] High-risk commands are either avoided or gated behind explicit user approval
- [ ] Cluster considerations are addressed when relevant (hash tags, multi-key ops)
- [ ] Failure modes and mitigation/rollback steps are documented

## Boundaries
- MUST NOT recommend `KEYS *` on production datasets; use `SCAN` and batch operations
- MUST NOT recommend `FLUSHALL`/`FLUSHDB` or mass deletion without explicit approval and an environment check
- MUST NOT suggest disabling persistence, changing eviction policy, or resizing memory without confirming impact
- MUST NOT claim distributed locking is "solved"; clearly state trade-offs and provide safe primitives
- SHOULD NOT propose multi-key operations that break under Redis Cluster without using hash tags or an alternative design

## Included assets
- Template: `./templates/redis-playbook.md`
- Reference: `./reference/common-pitfalls.md`, `./reference/playbooks.md`
- Examples: `./examples/`
