# Feature: deployment

## Conclusions (read first)

- Provides deployment conventions and runbooks under `ops/deploy/`
- Keeps deploy automation provider-agnostic by default (placeholders)
- Intended to be extended to match your chosen deployment model (k8s/serverless/vm/paas)

## How to enable

In `init/_work/project-blueprint.json`:

```json
{
  "features": {
    "deployment": true
  },
  "deploy": {
    "enabled": true,
    "model": "k8s",
    "environments": ["dev", "staging", "prod"]
  }
}
```

## What Stage C `apply` does

When enabled, Stage C:

1) Copies templates from:
- `.ai/skills/features/deployment/templates/`

2) Runs the controller:

```bash
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs init --repo-root .
```

3) Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs verify --repo-root .
```

## Key outputs

- `ops/deploy/**` (environment runbooks + scripts)

## Common commands

```bash
# List deployment targets/environments (controller-defined)
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs list
```
