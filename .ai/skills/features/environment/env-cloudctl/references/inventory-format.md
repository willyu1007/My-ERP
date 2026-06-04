# env/inventory/<env>.yaml format

## Goals

- Provide a single place to declare "where" an environment lives.
- Enable adapter routing (provider/runtime) at execution time.
- Keep inventory optional when policy-based targets are configured.

## Policy-driven targets (preferred)

If `docs/project/policy.yaml` contains `policy.env.cloud.targets`, `env-cloudctl`
uses policy routing first. Inventory remains a fallback when no target matches.

Minimal policy example (envfile + SSH):

```yaml
version: 1
policy:
  env:
    cloud:
      require_target: false
      defaults:
        provider: envfile
        env_file_source: ops/deploy/env-files/{env}.env
        env_file_name: "{env}.env"
        transport: local
      targets:
        - id: staging-ssh
          match:
            env: staging
            workload: api
          set:
            runtime: remote
            deploy_dir: "<deploy_dir>"
            transport: ssh
            ssh:
              hosts: ["host-1.example"]
              user: deploy
```

Notes:

- `match.runtime_target` and `match.workload` use `env-cloudctl --runtime-target/--workload`.
- `runtime_target` (policy matching) vs `runtime` (inventory deployment location):
  - `runtime_target` in policy rules: `local | ecs` — determines which policy rules apply (local dev vs ECS cloud).
  - `runtime` in inventory: `local | remote | mock` — describes where the env file is deployed (local machine vs SSH remote).
- `provider: ssh` is accepted as an alias for `provider: envfile` + `transport: ssh`.
- `policy.env.cloud.require_target: true` disables inventory fallback (policy-only routing).

## Minimal required fields

```yaml
version: 1
env: staging
provider: mockcloud
runtime: mock
```

## envfile adapter (legacy: ecs-envfile)

Use this adapter when you inject a **prebuilt env file** on a deploy machine
(e.g., cloud host, CI runner) rather than letting the runtime fetch secrets.

### Local transport (copy on deploy machine)

```yaml
version: 1
env: staging
provider: envfile
runtime: remote
injection:
  env_file: ops/deploy/env-files/staging.env
  target: "<deploy_dir>/staging.env"
  transport: local
  mode: copy
  write:
    chmod: "600"
```

### SSH transport (generic, vendor-neutral)

Use this when the deploy machine can reach the target hosts via SSH.

```yaml
version: 1
env: staging
provider: envfile
runtime: remote
injection:
  env_file: ops/deploy/env-files/staging.env
  target: "<deploy_dir>/staging.env"
  transport: ssh
  mode: copy
  write:
    sudo: true
    chmod: "600"
    remote_tmp_dir: "/tmp"
  ssh:
    # Prefer IaC outputs over committing hostnames:
    hosts_file: ops/iac/handbook/outputs/hosts.txt
    # Or hand-maintained hosts list:
    # hosts: ["host-1.example", "host-2.example"]
    #
    # Connection settings (prefer ~/.ssh/config; do not commit private keys):
    user: deploy
    port: 22
    options:
      - "-o"
      - "StrictHostKeyChecking=accept-new"
    # Optional hooks (MUST NOT print secret values):
    pre_commands:
      - "systemctl is-active <service-name>"
    post_commands:
      - "systemctl restart <service-name>"
```

Note: `env-cloudctl apply` must be called with `--approve --approve-remote` when `transport: ssh`.

Fields (envfile):

- `injection.env_file` (required): source env-file path (relative to repo root or absolute).
- `injection.target`:
  - required for `transport: ssh` (absolute remote path; must start with `/`)
  - recommended for `transport: local` (destination path on the deploy machine)
- `injection.transport` (optional): `local` (default) or `ssh`.
- `injection.mode` (optional): `copy` (default) or `noop` (plan-only).

Fields (write):

- `injection.write.sudo` (optional): use `sudo -n` for remote install (default: `false`).
- `injection.write.chmod` (optional): chmod mode for the env-file (default: `"600"`).
- `injection.write.remote_tmp_dir` (optional): remote temp dir for `transport: ssh` (default: `"/tmp"`).

Fields (ssh):

- `injection.ssh.hosts` / `injection.ssh.hosts_file`: one of them is required.
- `injection.ssh.pre_commands` / `injection.ssh.post_commands`: optional lists of shell snippets.
- `hosts_file` supports JSON/YAML (`[...]` or `{hosts:[...]}`) or plain text (one host per line; `#` comments allowed).

## Recommended fields

- `account` / `project` / `subscription`
- `region`
- `cluster` / `namespace`
- `...` (provider-specific)
