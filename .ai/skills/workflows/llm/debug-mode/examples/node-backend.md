# Example — Backend (Node.js / Services)

## When to use this example
Use when debugging server-side issues such as:
- request handling bugs,
- intermittent 5xx errors,
- timeouts, retries, concurrency issues,
- performance spikes,
- stateful workers/queues.

## Correlation and scope
Prefer to correlate logs by:
- request_id / trace_id (existing if available),
- plus `run_id` for debug-mode: `[DBG:<run_id>]`.

If the system already has tracing/metrics, use them as primary evidence and add minimal logs only where needed.

## Instrumentation targets
High information-gain points:
- request ingress/egress (middleware)
- downstream calls (DB, cache, external APIs): start/end + duration + status
- retries/circuit breakers
- queue enqueue/dequeue and job lifecycle
- lock acquisition/release and contention signals

## Avoiding behavior changes
- Avoid logging full payloads and large objects.
- For hot paths, sample or log only anomalies.
- Prefer structured logs.

## What to ask from the user/operator
- precise repro steps (curl command, test script, or endpoint call pattern)
- if the repro runs in an IDE-integrated terminal: reproduce and reply `DONE` so I can attempt auto-collection (see `examples/ide-terminal-hook.md`)
- the log subset filtered by `[DBG:<run_id>]`
- request_id/trace_id if available
- environment: staging/prod, deployment version/commit, config toggles
