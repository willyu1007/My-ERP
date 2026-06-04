# Convex Backend (LLM-first)

## Purpose

This directory is the authoritative home for Convex schema and backend function source code.

## Rules

- `schema.ts` is the database SSOT in Convex mode.
- Public `query` / `mutation` / `action` functions SHOULD define `args` and `returns`.
- `httpAction` must parse and validate request input explicitly.
- Privileged public functions MUST perform authorization checks.
- `query` is for reads.
- `mutation` is for transactional writes.
- `action` and `httpAction` are for external I/O or HTTP entrypoints.
- `convex/_generated/**` is generated code; do not hand-edit it.

## Commands

```bash
npx convex dev
npx convex codegen
node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .
node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs verify --repo-root . --strict
```
