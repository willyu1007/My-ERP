# Feature: observability

## Conclusions (read first)

- Provides metrics/logs/traces contracts under `docs/context/observability/`
- Adds implementation scaffolding under `observability/`
- Requires context awareness, because contracts are stored under `docs/context/`

## Requirements

- `features.observability` requires `features.contextAwareness=true`

## How to enable

In `init/_work/project-blueprint.json`:

```json
{
  "features": {
    "contextAwareness": true,
    "observability": true
  },
  "observability": {
    "enabled": true,
    "metrics": true,
    "logs": true,
    "traces": true
  }
}
```

## What Stage C `apply` does

When enabled, Stage C:

1) Copies templates from:
- `.ai/skills/features/observability/templates/`

2) Runs the controller:

```bash
node .ai/skills/features/observability/scripts/ctl-observability.mjs init --repo-root .
```

3) Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/observability/scripts/ctl-observability.mjs verify --repo-root .
```

## Key outputs

- `docs/context/observability/**`
- `observability/**`
