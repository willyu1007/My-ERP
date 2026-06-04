# Example — Observability: OpenTelemetry / Tracing (Optional)

## When to use this example
Use when:
- the system already emits traces/metrics,
- you are debugging distributed latency, retries, or partial failures,
- you need evidence across multiple services/components.

## Debug-mode approach with tracing
Prefer traces as primary evidence:
- confirm the failing span and its parent chain,
- compare durations and error tags,
- identify where the flow diverges from the expected path.

Use `run_id` to correlate when possible:
- include `run_id` as a span attribute (if safe),
- or include `[DBG:<run_id>]` in logs adjacent to the relevant spans.

## Typical evidence to request
- trace_id(s) for a failed request,
- key spans with timing and error tags,
- associated logs filtered by run_id or request_id.

## Minimal instrumentation
If adding new instrumentation:
- add a single span attribute or event at the suspected divergence point,
- avoid high-cardinality attributes with PII.
