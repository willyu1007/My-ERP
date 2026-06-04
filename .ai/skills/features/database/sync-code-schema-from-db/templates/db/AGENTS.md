# Database Mirror (DB is SSOT) - AI Guidance

## Conclusions (read first)

- The **real database** is the Single Source of Truth (SSOT).
- `db/` holds **repo-local mirrors** so the LLM can understand the schema without DB access.
- `db/schema/tables.json` is a **generated snapshot** (normalized-db-schema-v2).
- AI/LLM MUST NOT treat `db/schema/tables.json` as a hand-edited desired state.

## Where the DB schema comes from

Typical end-to-end flow:

1. Human runs `prisma db pull` against the target DB (updates `prisma/schema.prisma`).
2. Import Prisma schema into the mirror:
   - `node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs import-prisma`
3. Sync the mirror into LLM context (docs/context):
   - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`

## Allowed AI actions

- Read and reference the mirror (`db/schema/tables.json`).
- Draft desired-state changes in `db/handbook/`.
- Generate placeholder migration SQL files for humans (optional).
- Keep `docs/context/db/schema.json` updated by running `ctl-db-ssot` (best effort).

## Forbidden AI actions

- Direct database connections.
- Executing arbitrary SQL.
- Editing `db/schema/tables.json` manually (use `ctl-db import-prisma`).
- Storing credentials anywhere in the repo.
