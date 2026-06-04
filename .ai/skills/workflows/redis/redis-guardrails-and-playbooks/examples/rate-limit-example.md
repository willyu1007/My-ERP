# Redis Playbook — Rate Limiting (Example)

## Context
- Use case: `rate limiting`
- Deployment mode: `standalone` (single node with replica)
- Scale: ~500 QPS

## Requirements
- Latency SLO: p95 < 5ms
- Consistency: strong enough to prevent obvious abuse

## Recommended approach
- Pattern: fixed window counter per API key (simple baseline)
- Rationale: minimal complexity, sufficient for moderate traffic

## Data layout
- Key: `rl:{apiKey}:{...}`

## TTL strategy
- Window: 60s
- TTL: 65s (window + buffer)

## Guardrails
- Never use `KEYS` to inspect active rate limits; use `SCAN` by prefix.

## Verification
- Unit tests: limit reached behavior + TTL reset
- Load tests: sustained QPS

## Rollback / mitigation
- Temporarily disable rate limiting middleware or increase limit
