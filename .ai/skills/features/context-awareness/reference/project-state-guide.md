# Context Awareness - Project State (Reference)

## Why this exists

A small state file is useful as a stable input for:

- initialization scaffolding gates
- CI policy differences by stage (e.g., stricter checks for production)
- context strategy choices (contract vs snapshot)

## Secret handling (MUST)

- Do not store secrets.
- Store only references, for example:
  - environment variable names (`DATABASE_URL`)
  - secret manager key names (if applicable)

## Verification

- `node .ai/scripts/ctl-project-state.mjs verify`
