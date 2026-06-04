# Template: Route smoke test matrix

For each endpoint, fill one row.

| Endpoint | Auth | Valid request | Expected | Side effects | Invalid request | Expected |
|---|---|---|---|---|---|---|
| `POST /resource` | Bearer | `{...}` | `201` + `{data: ...}` | inserts `resource` | missing `name` | `400` + validation error |
