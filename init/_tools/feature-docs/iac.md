# Feature: iac

## Conclusions (read first)

- `ops/iac/<tool>/` is the IaC SSOT (plan/apply owned by humans/CI).
- The tool is selected via `iac.tool` in the blueprint (`none | ros | terraform | opentofu`).
- `docs/context/iac/overview.json` records the tool + SSOT path (no secrets).

## How to enable

In `init/_work/project-blueprint.json`:

```json
{ "iac": { "tool": "terraform" } }
```

Optional (not required) feature flag:

```json
{ "features": { "iac": true } }
```

## What Stage C `apply` does

When enabled, Stage C runs:

```bash
node .ai/skills/features/iac/scripts/ctl-iac.mjs init --tool terraform --repo-root .
```

Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/iac/scripts/ctl-iac.mjs verify --repo-root .
```

## Key outputs

- `ops/iac/<tool>/`
- `docs/context/iac/overview.json`

## Safety notes

- No secrets in repo.
- No automatic `plan/apply` is performed by this feature.
- Keep IaC responsibilities separate from runtime env injection.
