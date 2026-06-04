# env/contract.yaml format (repo-env-contract)

## Goals

- Provide a single source of truth for **configuration keys** (not values).
- Support deterministic validation and artifact generation.
- Keep secrets out of the repository.

## Required top-level fields

```yaml
version: 1
variables:
  SOME_KEY:
    type: string
    required: true
    description: "..."
```

## Variable fields

- `type` (required): one of `string`, `int`, `float`, `bool`, `json`, `enum`, `url`
- `required` (optional): boolean (default false)
- `default` (optional): default value for non-secret variables
- `description` (recommended): operational description (single line)
- `example` (optional): example value for `env/.env.example`
- `scopes` (optional): list of env names where this key applies (if omitted: applies to all)
- `secret` (optional): boolean (default false)
- `secret_ref` (required when `secret: true`): logical secret identifier (e.g., `db_url`)
- `deprecated` (optional): boolean
- `replaced_by` (optional): key name

## Secret rules

- If `secret: true`, **do not** set `default`.
- Secret values must not be stored in:
  - `env/contract.yaml`
  - `env/values/*.yaml`
  - `env/.env.example`
