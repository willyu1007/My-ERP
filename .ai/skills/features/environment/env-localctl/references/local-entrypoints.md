# Local input entry points (minimize cognitive load)

This project uses the repo-env-contract model.

When local configuration is missing, **use these entry points only**:

1. Project-wide non-secret defaults for the environment
   - `env/values/<env>.yaml`
2. Per-developer local overrides (gitignored)
   - `env/values/<env>.local.yaml`
3. Secret references (never values)
   - `env/secrets/<env>.ref.yaml`
4. Local secret material for tests/demos (gitignored)
   - `env/.secrets-store/<env>/<secret_name>`

Rules:

- Secret values must not be committed.
- Evidence artifacts must not contain secret values.
- Policy preflight is driven by `docs/project/policy.yaml` (auth_mode / preflight rules).
