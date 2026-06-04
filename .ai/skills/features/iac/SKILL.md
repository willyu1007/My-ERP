---
name: iac
description: Enable and operate the IaC feature (ops/iac SSOT + context overview) so infrastructure ownership and boundaries stay explicit.
---

# IaC Feature

## Intent

Provide a **tool-selected IaC SSOT** with minimal, vendor-neutral scaffolding:

- `ops/iac/<tool>/` is the IaC SSOT (plan/apply owned by humans/CI).
- `docs/context/iac/overview.json` records the selected tool and SSOT path (no secrets).

## What gets enabled

- `ops/iac/<tool>/` (created when `tool != none`)
- `docs/context/iac/overview.json`

## How to enable

In the blueprint (`init/_work/project-blueprint.json`):

```json
{ "iac": { "tool": "terraform" } }
```

Supported tools: `none | ros | terraform | opentofu`.

Stage C `apply` runs:

```bash
node .ai/skills/features/iac/scripts/ctl-iac.mjs init --tool terraform --repo-root .
```

Optional verify (when Stage C runs with `--verify-features`):

```bash
node .ai/skills/features/iac/scripts/ctl-iac.mjs verify --repo-root .
```

## Verification

```bash
node .ai/skills/features/iac/scripts/ctl-iac.mjs verify --repo-root .
```

## Boundaries

- No provider-specific logic or APIs.
- No automatic `plan/apply` execution.
- No secrets in repo or context outputs.
