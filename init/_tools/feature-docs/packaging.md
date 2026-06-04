# Feature: packaging

## Conclusions (read first)

- Provides container/artifact packaging infrastructure under `ops/packaging/`
- Adds registry/config docs under `docs/packaging/`
- Designed so AI can propose changes and humans can execute builds safely

## How to enable

In `init/_work/project-blueprint.json`:

```json
{
  "features": {
    "packaging": true
  },
  "packaging": {
    "enabled": true,
    "containerize": true,
    "targets": ["services", "jobs"]
  }
}
```

## What Stage C `apply` does

When enabled, Stage C:

1) Copies templates from:
- `.ai/skills/features/packaging/templates/`

2) Runs the controller:

```bash
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs init --repo-root .
```

3) Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs verify --repo-root .
```

## Key outputs

- `ops/packaging/**` (targets + scripts + handbook)
- `docs/packaging/**` (registry + docs)

## Common commands

```bash
# Add a service packaging target
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs add-service --id api --module apps/backend

# Add a job packaging target
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs add-job --id cron-task

# List packaging targets
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs list
```
