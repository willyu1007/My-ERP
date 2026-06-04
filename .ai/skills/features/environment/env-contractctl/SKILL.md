---
name: env-contractctl
description: Maintain env contract SSOT (env/contract.yaml), validate env/values + env/secrets refs coverage, and generate env/.env.example + docs/context/env/*. Use when adding/renaming/deprecating config keys.
---

# Environment Contract Control (repo-env-contract SSOT)

## Purpose

Treat `env/contract.yaml` as the **configuration contract** Single Source of Truth (SSOT). Use the `env-contractctl` skill to:

- define/rename/deprecate environment variables (schema)
- validate coverage across environments (`env/values/*`, `env/secrets/*`)
- generate **non-secret** developer artifacts:
  - `env/.env.example`
  - `docs/env.md`
  - `docs/context/env/contract.json` (LLM-readable contract)

The `env-contractctl` skill is designed for **LLM-led development**:

- prefer deterministic scripts for validation and generation
- prefer a strict contract over ad-hoc `.env` tribal knowledge

## Hard precondition (SSOT mode gate)

Use the skill only when the project env SSOT mode is `repo-env-contract`.

To check the mode, read:

- `docs/project/env-ssot.json`

If the project is not in the required mode, STOP and do not apply the workflow.

If the file does not exist (first-time setup), you can scaffold the required structure using:

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py init --root . --out <EVIDENCE_DIR>/00-bootstrap.md
```

The command scaffolds a minimal safe template (no secret values) and will not overwrite existing files unless you pass `--force`.

## When to use

Use when the user asks to:

- add/rename/remove/deprecate an environment variable
- change a variable's type/default/validation rules
- ensure `env/.env.example` and environment docs are accurate
- fix mismatch between code expectations and environment configuration

Avoid when:

- the task is purely “local machine is broken” (use `env-localctl`)
- the task is “deploy / rotate secrets / cloud drift” (use `env-cloudctl`)

## Invariants

- **No secrets in repo contract or values.**
  - Any `secret: true` variable must use a `secret_ref`.
  - Secret values must never appear in:
    - `env/contract.yaml`
    - `env/values/*.yaml`
    - generated `env/.env.example`
    - evidence artifacts
- **Generated files are generated.** Do not hand-edit:
  - `env/.env.example`
  - `docs/env.md`
  - `docs/context/env/contract.json`

## Inputs

- Contract: `env/contract.yaml`
- Non-secret values: `env/values/<env>.yaml`
- Secret references (no values): `env/secrets/<env>.ref.yaml`
- Target env list: derived from existing files (or explicit user request)

## Outputs (evidence + generated artifacts)

### Evidence directory

Choose one evidence location (no secrets):

- Recommended (if your repo uses an explicit worklog gate):
  - `dev-docs/active/<task-slug>/artifacts/env/`
- Otherwise:
  - `.ai/.tmp/env-contract/<run-id>/`

Evidence files (templates available in `./templates/`):

- `00-change-intent.md`
- `01-contract-diff.md`
- `02-compat-migration-plan.md`
- `03-validation-log.md`
- `04-context-refresh.md`

### Generated artifacts

- `env/.env.example`
- `docs/env.md`
- `docs/context/env/contract.json`

## Steps

### Phase 0 — Confirm scope and mode

1. Confirm the user's intent is **contract/schema maintenance**.
2. Confirm env SSOT mode is `repo-env-contract` via `docs/project/env-ssot.json`.
   - If not, STOP.
3. Choose the evidence directory.

### Phase A — Change the contract (SSOT)

4. Update `env/contract.yaml`:
   - add/update/deprecate variables
   - keep descriptions explicit and operational
   - if a variable is secret:
     - set `secret: true`
     - set `secret_ref: <logical_name>`
     - do NOT set a default value
5. Update `env/values/<env>.yaml` only for **non-secret** keys.
6. Update `env/secrets/<env>.ref.yaml` only for **secret refs** (no values).

### Phase B — Validate (read-only)

7. Run validation and save results:

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py validate --root . --out <EVIDENCE_DIR>/03-validation-log.md
```

8. Write `01-contract-diff.md` and `02-compat-migration-plan.md`:
   - highlight breaking changes (rename, type change, requiredness changes)
   - specify migration window and compatibility strategy

### Approval checkpoint (mandatory for breaking changes)

9. If the change is breaking, ask for explicit user approval before proceeding to generation and any downstream rollout.

### Phase C — Generate artifacts

10. Generate `env/.env.example`, `docs/env.md`, and LLM context:

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py generate --root . --out <EVIDENCE_DIR>/04-context-refresh.md
```

### Phase D — Handoff to runtime skills

11. If the user also needs local/cloud alignment:

- Local: route to `env-localctl` (compile/doctor/reconcile)
- Cloud: route to `env-cloudctl` (plan/apply/verify)

## Verification

- [ ] SSOT mode is `repo-env-contract`
- [ ] Contract changes are reflected in values and secret refs
- [ ] No secret values exist in repo files or evidence
- [ ] Validation passes (no missing required keys)
- [ ] `env/.env.example` regenerated
- [ ] `docs/context/env/contract.json` regenerated
- [ ] Public central test suite passes: `node .ai/tests/run.mjs --suite environment`

## Boundaries

- MUST NOT request users to paste secret values into chat.
- MUST NOT store secret values in repo.
- MUST NOT generate cloud-side changes (deploy/rotate) in the `env-contractctl` workflow.
- SHOULD keep the contract stable and backward compatible when possible.
