# Secret backend resolution (local)

`env_localctl.py compile` resolves secret variables via secret references.

## Backend: mock

Use for local demos/tests.

- Secret ref example:

```yaml
version: 1
secrets:
  db_url:
    backend: mock
    ref: "mock://dev/db_url"
```

- Provide secret material by creating:

```
env/.secrets-store/dev/db_url
```

The file contents are treated as the secret value.

## Backend: env

Use when the secret is already in the process environment:

- Secret ref example:

```yaml
version: 1
secrets:
  api_key:
    backend: env
    ref: "env://MY_API_KEY"
```

## Backend: file

Use when the secret is stored in a local file (gitignored):

```yaml
version: 1
secrets:
  api_key:
    backend: file
    ref: "file:./.secrets/api_key"
```

## Backend: bws (Bitwarden Secrets Manager)

Use when secret values are stored in Bitwarden Secrets Manager and you want `env_localctl.py compile` to pull them
via the `bws` CLI.

Prerequisites:
- Install `bws` and ensure it is in `PATH`.
- Create a Machine Account + Access Token with **read-only** access to the target Bitwarden Project.
- Export the token in the current shell (do not commit it):
  - PowerShell: `$env:BWS_ACCESS_TOKEN = "<token>"`

Secret ref example (recommended):

```yaml
version: 1
secrets:
  db/password:
    backend: bws
    project_name: "<project-name>"
    key: "project/dev/db/password"
    hint: "Bitwarden Secrets Manager key in <project-name>"
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

Alternative ref example (compact):

```yaml
version: 1
secrets:
  db/password:
    backend: bws
    ref: "bws://<PROJECT_ID>?key=project/dev/db/password"
```

Notes:
- `bws secret list` output includes secret values; `env_localctl.py` MUST NOT print them.
- Do not rely on `bws --output env` for injection when keys contain `/` (non-POSIX); render `.env.local` instead.

## Unsupported backend

If a backend is not implemented, the script fails fast with a clear action request.
