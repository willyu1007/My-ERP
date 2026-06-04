# Adapter model (why + how)

## Why adapters

Multi-environment + multi-cloud becomes unmanageable if you hardcode provider commands.

Instead:

- Maintain **spec** centrally (contract/values/secret refs/inventory).
- Route at runtime to provider-specific adapters.
- Prefer `docs/project/policy.yaml` (`policy.env.cloud.targets`) for routing; inventory remains a fallback.

## What an adapter must provide

- `plan(desired, deployed) -> diff`
- `apply(desired) -> execution_log`
- `read_deployed() -> deployed_state`
- `verify(desired, deployed) -> pass/fail`
- `rotate(secret_ref) -> rotation_log` (optional)
- `decommission(env) -> log` (optional)

The bundled scripts ship:

- `mockcloud` adapter (offline tests)
- `envfile` adapter (legacy alias: `ecs-envfile`) (copy a prebuilt env file on the deploy machine)
  - `transport: local` (default) or `transport: ssh` for remote hosts
  - remote execution requires `env-cloudctl apply --approve --approve-remote`
