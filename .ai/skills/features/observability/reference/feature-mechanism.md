# Observability Feature (Optional)

## Conclusions (read first)

- This feature provides **observability contracts** for metrics, logs, and traces.
- Defines instrumentation standards without coupling to specific backends.
- AI uses these contracts to propose consistent observability patterns.

## What this feature writes (blast radius)

New files/directories (created if missing):

- `docs/context/observability/` (observability contracts)
  - `metrics-registry.json` - Metric definitions
  - `logs-schema.json` - Structured log schema
  - `traces-config.json` - Tracing configuration
- `observability/` (observability root)
  - `observability/AGENTS.md` (LLM guidance)
  - `observability/config.json` (observability configuration)
  - `observability/handbook/` (observability planning)
- `.ai/skills/features/observability/scripts/ctl-observability.mjs` (observability management)
- `.ai/skills/features/observability/` (feature documentation)

## Install

### Manual

1. Materialize templates:
   - Copy `.ai/skills/features/observability/templates/` into the repository root (merge/copy-if-missing).
2. Initialize:

```bash
node .ai/skills/features/observability/scripts/ctl-observability.mjs init
```

Optional (recommended for LLM routing): record the flag in project state:

```bash
node .ai/scripts/ctl-project-state.mjs init
node .ai/scripts/ctl-project-state.mjs set features.observability true
```


## Usage

### Initialize Observability

```bash
node .ai/skills/features/observability/scripts/ctl-observability.mjs init
```

### Manage Metrics

```bash
# Add a metric
node .ai/skills/features/observability/scripts/ctl-observability.mjs add-metric --name request_duration --type histogram --unit seconds

# List metrics
node .ai/skills/features/observability/scripts/ctl-observability.mjs list-metrics
```

### Manage Log Fields

```bash
# Add a log field
node .ai/skills/features/observability/scripts/ctl-observability.mjs add-log-field --name user_id --type string

# List log fields
node .ai/skills/features/observability/scripts/ctl-observability.mjs list-log-fields
```

### Generate Instrumentation Hints

```bash
# Generate instrumentation code hints
node .ai/skills/features/observability/scripts/ctl-observability.mjs generate-instrumentation --lang typescript
```

## Observability Contracts

### Metrics Registry

`docs/context/observability/metrics-registry.json` defines:
- Metric name and type (counter, gauge, histogram)
- Units and labels
- Description and owner

### Logs Schema

`docs/context/observability/logs-schema.json` defines:
- Required log fields
- Field types and formats
- Log levels

### Traces Config

`docs/context/observability/traces-config.json` defines:
- Span naming conventions
- Attribute standards
- Sampling configuration

## Verification

```bash
# Verify observability configuration
node .ai/skills/features/observability/scripts/ctl-observability.mjs verify
```

## Rollback / Uninstall

Delete these paths:

- `docs/context/observability/`
- `observability/`
- `.ai/skills/features/observability/scripts/ctl-observability.mjs`
- `.ai/skills/features/observability/`
