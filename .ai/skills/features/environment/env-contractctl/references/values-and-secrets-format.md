# env/values and env/secrets reference formats

## env/values/<env>.yaml

- Contains only **non-secret** values.
- Keys must exist in `env/contract.yaml`.
- Must not include any variable marked `secret: true` in contract.

Example:

```yaml
SERVICE_NAME: demo
PORT: 8000
FEATURE_X_ENABLED: true
```

## env/secrets/<env>.ref.yaml

- Contains **secret references only**; no secret values.
- A variable in `env/contract.yaml` with `secret_ref: db_url` requires a matching entry in this file.

Supported structure:

```yaml
version: 1
secrets:
  db_url:
    backend: mock
    ref: "mock://dev/db_url"
    hint: "..."
```

Backends:

- `mock`: for tests and local demos (reads from `env/.secrets-store/<env>/<name>`)
- `env`: read from an environment variable named by `ref: env://VAR_NAME`
- `file`: read from a local file path named by `ref: file:///abs/path` or `ref: file:relative/path`
- `bws`: Bitwarden Secrets Manager via `bws` CLI (requires `BWS_ACCESS_TOKEN` in the shell; do not commit tokens)

`bws` structure (recommended):

```yaml
version: 1
secrets:
  db/password:
    backend: bws
    project_name: "<your-bitwarden-project-name>"
    key: "project/dev/db/password"
```

Optional (policy defaults + scope):

```yaml
version: 1
secrets:
  db/password:
    backend: bws
    scope: project
    key: "db/password"
```

Where `docs/project/policy.yaml` defines:

```yaml
policy:
  env:
    secrets:
      backends:
        bws:
          key_prefix: "project/dev"
          scopes:
            project:
              project_name: "<project-name>"
```

Alternative (compact `ref`):

```yaml
version: 1
secrets:
  db/password:
    backend: bws
    ref: "bws://<PROJECT_ID>?key=project/dev/db/password"
```

Any backend not implemented should fail fast with a clear action request.
