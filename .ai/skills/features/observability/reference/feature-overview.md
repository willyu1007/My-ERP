# Observability Feature

## Purpose

This feature provides **observability contracts** for metrics, logs, and traces, enabling consistent instrumentation across the codebase.

## Key Concepts

### Observability Contracts

Contracts define:
- What metrics to collect
- Log field standards
- Tracing conventions

These contracts are **backend-agnostic** - they define what to measure, not how to store/query it.

### Contract Files

| File | Purpose |
|------|---------|
| `docs/context/observability/metrics-registry.json` | Metric definitions |
| `docs/context/observability/logs-schema.json` | Log field schema |
| `docs/context/observability/traces-config.json` | Tracing configuration |

## AI/LLM Usage

When working with observability, AI should:

1. **Review** existing contracts before proposing instrumentation
2. **Use** `ctl-observability` to add new metrics/log fields
3. **Follow** naming conventions
4. **Avoid** high-cardinality labels
5. **Never** log sensitive data

## Quick Reference

```bash
# Initialize
node .ai/skills/features/observability/scripts/ctl-observability.mjs init

# Add metric
node .ai/skills/features/observability/scripts/ctl-observability.mjs add-metric --name api_latency --type histogram --unit seconds

# Add log field
node .ai/skills/features/observability/scripts/ctl-observability.mjs add-log-field --name correlation_id --type string

# Generate instrumentation hints
node .ai/skills/features/observability/scripts/ctl-observability.mjs generate-instrumentation --lang typescript

# Verify
node .ai/skills/features/observability/scripts/ctl-observability.mjs verify
```

## Metric Naming Conventions

- Use snake_case: `http_requests_total`
- Include unit suffix: `_seconds`, `_bytes`, `_total`
- Be descriptive but concise

## Log Best Practices

- Always use structured JSON logs
- Include correlation IDs for request tracing
- Use appropriate log levels
- Never log sensitive information
