# Example: Web research output (decision-oriented)

## Research brief
- Question: Should we enable HTTP/2 for internal service-to-service calls?
- Why it matters: latency and connection efficiency
- Required recency: last 12 months

## Key findings (with citations)
1) HTTP/2 provides multiplexing... (Source: <primary-doc-1>)
2) Some proxies terminate HTTP/2 and can introduce behavior differences... (Source: <primary-doc-2>)

## Evidence table

| Claim | Source | Why trust | Notes |
|---|---|---|---|
| HTTP/2 supports multiplexing multiple streams on one connection | <primary-doc-1> | Official RFC / standards body | Applies to transport behavior |
| Proxy termination can affect end-to-end semantics | <primary-doc-2> | Vendor documentation | Confirm deployment topology |

## Recommendation
- Default: enable HTTP/2 only where end-to-end support is confirmed.
- Rollout: canary + metrics on error rate and latency.

## Sources (anchors)
- <primary-doc-1> (standards/spec)
- <primary-doc-2> (official vendor docs)
- <secondary-1> (reputable engineering blog; used for interpretation only)
