# Feature: environment

## Conclusions (read first)

- Treats `env/contract.yaml` as env var contract SSOT (no secrets in repo)
- Scaffolds `env/values/*` and `env/secrets/*.ref.yaml` (secret refs only)
- Writes the SSOT gate file: `docs/project/env-ssot.json`
- Scaffolds the policy SSOT skeleton: `docs/project/policy.yaml`
- Can generate non-secret artifacts: `env/.env.example`, `docs/env.md`, `docs/context/env/contract.json`

## How to enable

In `init/_work/project-blueprint.json`:

```json
{
  "features": { "environment": true }
}
```

## What Stage C `apply` does

When enabled, Stage C runs:

Note (Windows): prefer `py -3` (Python Launcher). The pipeline will also try `python3`, then `python`.

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py init --root .
```

Optional verification + generation (when Stage C is run with `--verify-features`):

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py validate --root .
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py generate --root .
```

## Key outputs

- `docs/project/env-ssot.json`
- `docs/project/policy.yaml`
- `env/contract.yaml`
- `env/values/*.yaml` (non-secret values)
- `env/secrets/*.ref.yaml` (secret refs only; no values)
- `env/inventory/*.yaml` (optional fallback routing; policy targets preferred)
- Generated (non-secret) artifacts when `generate` runs:
  - `env/.env.example`
  - `docs/env.md`
  - `docs/context/env/contract.json`

## Safety notes

- Do NOT store secret values in `env/values/*.yaml` or `env/contract.yaml`.
- Use `env/secrets/*.ref.yaml` to reference secrets managed outside the repo.
- `docs/project/policy.yaml` (`policy.env.cloud.targets`) is the preferred routing SSOT for cloud injection.
- `env/inventory/*.yaml` remains as a fallback scaffold; in production, prefer IaC outputs as the SSOT for resource inventory.
- If `policy.env.cloud.require_target: true`, inventory fallback is disabled and a matching policy target is required.
- When `env-cloudctl` runs remote commands (e.g., `injection.transport=ssh`), it requires an explicit `--approve-remote` flag.
