# Observability - AI Guidance

## Conclusions (read first)

- Observability contracts are defined in `docs/context/observability/`.
- Use `ctl-observability.mjs` to manage metrics, logs, and traces definitions.
- AI proposes instrumentation; humans implement.

## Contract Files

| File | Purpose |
|------|---------|
| `metrics-registry.json` | Metric definitions |
| `logs-schema.json` | Structured log schema |
| `traces-config.json` | Tracing configuration |

## AI Workflow

1. **Review** existing metrics/logs/traces contracts
2. **Propose** new observability points via `ctl-observability`
3. **Generate** instrumentation hints
4. **Document** in `handbook/`

## Metric Types

| Type | Use Case |
|------|----------|
| `counter` | Monotonically increasing values (requests, errors) |
| `gauge` | Values that go up/down (connections, queue size) |
| `histogram` | Distributions (latency, response size) |
| `summary` | Similar to histogram with quantiles |

## Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Detailed debugging information |
| `info` | General operational information |
| `warn` | Warning conditions |
| `error` | Error conditions |

## Best Practices

### Metric Naming

- Use snake_case
- Include unit suffix (e.g., `_seconds`, `_bytes`)
- Prefix with service name for global metrics

### Log Fields

- Always include: timestamp, level, message, service
- Use structured JSON format
- Include correlation IDs for tracing

### Traces

- Follow OpenTelemetry conventions
- Name spans descriptively
- Include relevant attributes

## Forbidden Actions

- Adding metrics without proper naming convention
- Logging sensitive data (PII, credentials)
- High-cardinality labels on metrics (e.g., user_id as label)
- Excessive logging in hot paths
