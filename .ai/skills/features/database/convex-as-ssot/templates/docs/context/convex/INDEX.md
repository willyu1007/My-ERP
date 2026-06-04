# Convex Context Index

This directory contains LLM-readable contracts for Convex-specific repository context.

## Files

- `functions.json` — generated summary of exported Convex functions
- `functions.schema.json` — JSON Schema for the generated function contract

## Generation

```bash
node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .
```

`functions.json` is generated. Do not hand-edit it.

`ctl-convex.mjs` keeps low-level implementation commands for init/verify, but direct refresh subcommands are internal-only. Managed repositories should use `ctl-db-ssot.mjs`.
