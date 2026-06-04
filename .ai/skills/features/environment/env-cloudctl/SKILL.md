---
name: env-cloudctl
description: Plan/apply/verify cloud environment config and secret references using env contract + policy/inventory routing; detect drift, rotate secrets, and decommission environments with approval gates. Use for staging/prod deployments and maintenance.
---

# Cloud Environment Control (plan / apply / drift / rotate / decommission)

## Purpose

Manage cloud environment configuration under the `repo-env-contract` SSOT model, with a strict **plan → approval → apply → verify** workflow.

The `env-cloudctl` skill:

- computes desired runtime configuration from:
  - `env/contract.yaml`
  - `env/values/<env>.yaml`
  - `env/secrets/<env>.ref.yaml` (refs only)
  - `docs/project/policy.yaml` (`policy.env.cloud.targets`, preferred)
  - `env/inventory/<env>.yaml` (fallback routing)
- produces a deterministic change plan (diff)
- applies changes only after explicit approval
- detects drift
- rotates secrets (backend-dependent)
- decommissions environments (high risk)

## Hard preconditions

1. Env SSOT mode is `repo-env-contract`.
   - Check: `docs/project/env-ssot.json`
2. The target env has routing:
   - Preferred: `docs/project/policy.yaml` with `policy.env.cloud.targets`
   - Fallback: `env/inventory/<env>.yaml`

If neither is true, STOP.

If `docs/project/policy.yaml` sets `policy.env.cloud.require_target: true`, a matching
`policy.env.cloud.targets` entry is mandatory and inventory fallback is disabled.

If `docs/project/env-ssot.json` or `env/contract.yaml` does not exist (first-time setup), run:

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py init --root .
```

Then customize the contract and inventory before using cloud operations.

## When to use

Use when the user asks to:

- deploy or update configuration for staging/prod
- preview changes (plan/diff) before a release
- check configuration drift
- inject a prebuilt env-file on a deploy machine (cloud host / CI)
- rotate or revoke secrets
- decommission an environment

Avoid when:

- you need to change the contract schema (use `env-contractctl`)
- the issue is only local-machine bootstrap (use `env-localctl`)

## Invariants

- MUST NOT request users to paste secrets into chat.
- MUST NOT materialize secret values in evidence artifacts.
- MUST do a plan/diff before any apply.
- MUST require explicit approval before apply/rotate/decommission.
- MUST treat **Identity/IAM changes as out of scope for automatic apply**.
  - You may generate a runbook or policy diff, but do not apply permissions changes automatically.
- Remote commands (SSH) are allowed only with explicit user action:
  - `apply --approve --approve-remote` (only when `injection.transport=ssh`)
  - `verify --remote --approve-remote` (remote hash checks)

## Inputs

- Contract: `env/contract.yaml`
- Values: `env/values/<env>.yaml`
- Secret refs: `env/secrets/<env>.ref.yaml`
- Policy: `docs/project/policy.yaml` (`policy.env.cloud.targets`, preferred)
- Inventory: `env/inventory/<env>.yaml`
  - Optional when policy targets match
  - If both exist, policy targets take precedence
  - Use `--runtime-target` / `--workload` to select policy targets (`runtime_target`: `local | ecs`; `remote` is an alias for `ecs`)
  - For `envfile` (or legacy `ecs-envfile`), inventory must include `injection.env_file` (see references)
  - For remote injection, set `injection.transport: ssh` and `injection.ssh` (hosts + auth)
    - Host sources may be hand-maintained (`ssh.hosts`) or IaC outputs (`ssh.hosts_file`)

## Outputs (evidence + context)

### Evidence directory

Choose one evidence location (no secrets):

- Recommended:
  - `dev-docs/active/<task-slug>/artifacts/env-cloud/`
- Otherwise:
  - `.ai/.tmp/env-cloud/<run-id>/`

Evidence files (templates available in `./templates/`):

- `00-target-and-scope.md`
- `01-drift-report.md`
- `02-apply-plan.md`
- `03-execution-log.md`
- `04-post-verify.md`
- `05-context-refresh.md`

### Context artifacts (safe for LLM)

- `docs/context/env/effective-cloud-<env>.json` (redacted)

## Steps

### Phase 0 — Confirm scope

1. Confirm target env (must be explicit): `staging` / `prod` / other.
2. Confirm preconditions (SSOT mode + inventory).
3. Choose evidence directory.

### Phase A — Plan (read-only)

4. Produce a deterministic plan (diff):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py plan --root . --env <env> --out <EVIDENCE_DIR>/02-apply-plan.md
```

5. Record `00-target-and-scope.md` and summarize high-risk operations.

### Env-file injection (deploy machine)

If the inventory provider is `envfile` (or legacy `ecs-envfile`), generate the env-file
first with `env-localctl`, then plan/apply with `env-cloudctl`:

```bash
python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py compile \
  --root . \
  --env staging \
  --runtime-target ecs \
  --workload api \
  --env-file ops/deploy/env-files/staging.env \
  --no-context
```

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py plan \
  --root . \
  --env staging \
  --runtime-target ecs \
  --workload api
```

Apply (transport: `local`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py apply \
  --root . \
  --env staging \
  --runtime-target ecs \
  --workload api \
  --approve
```

Apply (transport: `ssh`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py apply \
  --root . \
  --env staging \
  --runtime-target ecs \
  --workload api \
  --approve \
  --approve-remote
```

Optional remote verification (only for `transport: ssh`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py verify \
  --root . \
  --env staging \
  --runtime-target ecs \
  --workload api \
  --remote \
  --approve-remote
```

### Approval checkpoint (mandatory)

6. Ask for explicit user approval before apply, confirming:

- target env
- change summary
- rollback expectations
- whether the change is within an approved maintenance window

### Phase B — Apply (write)

7. Apply the plan (requires `--approve`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py apply --root . --env <env> --approve --out <EVIDENCE_DIR>/03-execution-log.md
```

### Phase C — Verify

8. Verify desired == deployed (read-only):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py verify --root . --env <env> --out <EVIDENCE_DIR>/04-post-verify.md
```

### Phase D — Drift detection

9. Detect drift anytime:

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py drift --root . --env <env> --out <EVIDENCE_DIR>/01-drift-report.md
```

### Phase E — Secret rotation (backend dependent)

10. Rotate a secret (requires `--approve`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py rotate --root . --env <env> --secret <secret_ref_name> --approve --out <EVIDENCE_DIR>/03-execution-log.md
```

### Phase F — Decommission (high risk)

11. Decommission an environment (requires `--approve`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py decommission --root . --env <env> --approve --out <EVIDENCE_DIR>/03-execution-log.md
```

## Verification

- [ ] SSOT mode is `repo-env-contract`
- [ ] Inventory file exists for the env
- [ ] Plan produced and reviewed before apply
- [ ] Explicit approval gate respected
- [ ] Verify passes after apply
- [ ] No secret values in evidence
- [ ] Maintainer cloud lifecycle regression passes when `env-cloudctl` or mockcloud behavior changes: `node .ai/tests/run-maintainer.mjs --suite environment`
- [ ] Shared public environment smoke passes when common contract/local scaffolding changed: `node .ai/tests/run.mjs --suite environment`

## Boundaries

- MUST NOT modify `env/contract.yaml` as part of the `env-cloudctl` workflow.
- MUST NOT apply IAM/Identity changes automatically.
- MUST NOT log secret values.
