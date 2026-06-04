---
name: env-localctl
description: Bootstrap, diagnose (doctor), and reconcile local dev environment from env contract/values/secret refs; generate .env.local and redacted docs/context/env/effective-*. Use when local env is broken or needs syncing.
---

# Local Environment Control (bootstrap / doctor / reconcile)

## Purpose

Make local development environments **predictable and self-healing** under the `repo-env-contract` SSOT model.

The `env-localctl` skill:

- validates local requirements against the repo contract (`env/contract.yaml`)
- checks that non-secret values and secret references exist for a chosen env
- resolves secrets via approved mechanisms (never via chat)
- generates a local env file (`.env.local` or `.env.<env>.local`)
- produces redacted LLM context (`docs/context/env/effective-<env>.json`)
- applies policy preflight checks from `docs/project/policy.yaml` (auth_mode/preflight rules)

## Hard precondition (SSOT mode gate)

Use the skill only when the project env SSOT mode is `repo-env-contract`.

To check the mode, read:

- `docs/project/env-ssot.json`

If the project is not in the required mode, STOP.

If `docs/project/env-ssot.json` does not exist (first-time setup), run:

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py init --root .
```

Then re-run the local workflow.

## When to use

Use when the user asks to:

- "make my local env work" / "I can't boot the service locally"
- sync local env after contract changes
- diagnose missing env vars or secret access
- regenerate `.env.local` deterministically

Avoid when:

- you need to add/rename/deprecate variables (use `env-contractctl`)
- you need to deploy/rotate secrets for staging/prod (use `env-cloudctl`)

## Invariants

- MUST NOT ask users to paste secrets into chat.
- MUST NOT write secret values into evidence artifacts.
- SHOULD write local secret material only to gitignored files (e.g., `.env.local`).
- SHOULD set `.env.local` permissions to `0600`.

## Inputs

- Contract: `env/contract.yaml`
- Non-secret values: `env/values/<env>.yaml` (+ optional `env/values/<env>.local.yaml` for per-developer overrides)
- Secret references: `env/secrets/<env>.ref.yaml`
- Secret material: resolved via secret backends (e.g., mock file store, environment, or file reference)
- Policy (preflight/auth): `docs/project/policy.yaml` (selects `auth_mode` + `preflight` rules via `env/runtime_target/workload`)
  - `runtime_target` supports `local | ecs` (`remote` is accepted as an alias for `ecs`)

## Outputs (evidence + generated artifacts)

### Evidence directory

Choose one evidence location (no secrets):

- Recommended:
  - `dev-docs/active/<task-slug>/artifacts/env-local/`
- Otherwise:
  - `.ai/.tmp/env-local/<run-id>/`

Evidence files (templates available in `./templates/`):

- `00-prereq-check.md`
- `01-auth-and-secrets-check.md`
- `02-config-compile-report.md`
- `03-connectivity-smoke.md`
- `04-post-fix-summary.md`

### Generated artifacts

- `.env.local` (default for `dev`) or `.env.<env>.local`
- `docs/context/env/effective-<env>.json` (redacted; safe for LLM)

### Deployment-oriented usage (cloud injection)

Use the same controller on a deploy machine to render a target env-file without writing repo-local context:

```bash
python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py compile \
  --root . \
  --env staging \
  --runtime-target ecs \
  --workload api \
  --env-file /etc/<org>/<project>/staging.env \
  --no-context \
  --out <EVIDENCE_DIR>/02-config-compile-report.md
```

## Steps

### Phase 0 — Confirm scope and mode

1. Confirm the user's intent is **local bootstrap/diagnosis**.
2. Confirm env SSOT mode is `repo-env-contract` via `docs/project/env-ssot.json`.
   - If not, STOP.
3. Confirm target env for local run (default: `dev`).
4. Choose evidence directory.

### Phase A — Doctor (diagnose)

5. Run a deterministic local doctor:

```bash
python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py doctor \
  --root . \
  --env dev \
  --runtime-target local \
  --workload api \
  --out <EVIDENCE_DIR>/00-prereq-check.md
```

6. If doctor reports missing **non-secret** values, use the minimal entry point:

- Project-wide non-secret values: `env/values/dev.yaml`
- Per-developer overrides (gitignored): `env/values/dev.local.yaml`

7. If doctor reports missing **secret material**, use the minimal entry points:

- Ensure secret ref exists: `env/secrets/dev.ref.yaml`
- Provide secret material via an approved backend (never via chat)
  - For tests/local demo: create `env/.secrets-store/dev/<secret_name>`

### Phase B — Compile (generate `.env.local`)

8. Compile and write `.env.local` and redacted context:

```bash
python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py compile \
  --root . \
  --env dev \
  --runtime-target local \
  --workload api \
  --out <EVIDENCE_DIR>/02-config-compile-report.md
```

### Phase C — Connectivity smoke (optional)

9. If needed, run a light connectivity check (best-effort; safe; redacted):

```bash
python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py connectivity \
  --root . \
  --env dev \
  --runtime-target local \
  --workload api \
  --out <EVIDENCE_DIR>/03-connectivity-smoke.md
```

### Phase D — Reconcile (idempotent repair)

10. If the local `.env.local` drifted, re-run compile (idempotent). Record `04-post-fix-summary.md`.

## Verification

- [ ] SSOT mode is `repo-env-contract`
- [ ] Doctor passes (no missing required keys)
- [ ] `.env.local` generated and gitignored
- [ ] No secret values written to evidence
- [ ] `docs/context/env/effective-<env>.json` generated (redacted)
- [ ] Public central test suite passes: `node .ai/tests/run.mjs --suite environment`

## Boundaries

- MUST NOT modify `env/contract.yaml` in the `env-localctl` workflow.
- MUST NOT perform cloud-side apply/rotate/decommission.
- MUST NOT print or store secret values in logs/evidence.
