---
name: sync-code-schema-from-db
description: Mirror schema changes from a real database (SSOT) into repo artifacts (prisma/schema.prisma + db/schema/tables.json) and refresh LLM context (docs/context/db/schema.json).
---

# Sync Code Schema from DB (DB SSOT)

## Purpose

Treat the **real database** as the schema Single Source of Truth (SSOT) and keep repo-local schema artifacts in sync so developers and LLMs can work without direct DB access.

The `sync-code-schema-from-db` skill is the inverse of `sync-db-schema-from-code`. Use the skill when **DB → code** is the authoritative direction.

## Hard precondition (SSOT mode gate)

Use the skill only when the project DB SSOT is `database`:

- Source of truth: the running database
- Repo contains mirrors:
  - `prisma/schema.prisma` (derived via introspection)
  - `db/schema/tables.json` (derived snapshot for LLMs)

To check the mode, read:

- `docs/project/db-ssot.json`

If the project uses **repo-prisma SSOT**, STOP and use `sync-db-schema-from-code`.

## When to use

Use when:

- the database already exists and is authoritative
- schema changes are applied outside the repo (DBA workflow, managed platform, legacy DB)
- you need to regenerate Prisma schema and repo mirrors after DB changes
- you need the LLM to learn the latest DB shape

Avoid when:

- you want to propose new persisted fields by changing repo schema (use DB handbook + human-first DB change)
- you want migrations to be the authoritative change mechanism (that is repo-prisma mode)

See `./reference/database-ssot-mechanism.md` for the end-to-end pattern (including domain/repository boundaries).

## Inputs

- Target environment (`dev` / `staging` / `prod`) and how to connect (without exposing secrets)
- Whether `prisma/schema.prisma` is already present
- Whether the DB mirror assets are present (`db/schema/tables.json`, `db/handbook/`, etc)

## Outputs (evidence)

Choose one evidence directory (no secrets):

- `dev-docs/active/<task-slug>/artifacts/db/` (recommended)
- `.ai/.tmp/db-sync/<run-id>/`

Evidence files:

- `00-ssot-mode-check.md`
- `01-db-pull-instructions.md`
- `02-import-prisma-log.md`
- `03-context-refresh-log.md`

## Steps

### Phase 0 — Confirm mode and scope

1. Confirm intent is **DB → code**.
2. Confirm DB SSOT mode is `database` (`docs/project/db-ssot.json`).
   - If not, STOP and route to `sync-db-schema-from-code`.
3. Confirm the target environment and dialect.
4. Choose evidence directory.

### Phase A — Pull schema from DB into Prisma (human-run)

5. Provide human-safe instructions (no secrets in chat) to run introspection:

- Typical:
  - `npx prisma db pull`

Record the instructions and the environment assumptions in `01-db-pull-instructions.md`.

### Phase B — Import Prisma schema into repo mirror (LLM-safe)

6. Ensure the DB mirror assets are present (required for the mirror workflow):
   - Required paths:
     - `.ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs`
     - `db/schema/tables.json`
    - If `db/schema/tables.json` is missing, install the mirror skeleton:
      - Copy templates from `.ai/skills/features/database/sync-code-schema-from-db/templates/` into the repo root.
      - Run `node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs init`, then re-run Phase B.
    - If `.ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs` is missing, the database feature skill is not installed in `.ai/skills/`. Restore it (e.g., revert deletion / copy from a fresh template checkout), then re-run Phase B.

7. Import `prisma/schema.prisma` into `db/schema/tables.json`:

- `node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs import-prisma`

Record output in `02-import-prisma-log.md`.

### Phase C — Refresh LLM DB context contract

8. Regenerate `docs/context/db/schema.json`:

- `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`

Record output in `03-context-refresh-log.md`.

### Phase D — Keep developer layers coherent

9. Update repository mappings and domain entities to match the mirrored schema:

- Repositories must return domain entities (not Prisma client types).
- Business layer must remain Prisma-free.

## Verification

- [ ] SSOT mode is `database`
- [ ] Human ran `prisma db pull` against the correct environment
- [ ] `ctl-db import-prisma` updated `db/schema/tables.json`
- [ ] `ctl-db-ssot sync-to-context` updated `docs/context/db/schema.json`
- [ ] Domain/repository mapping updated (no Prisma types in business layer)
- [ ] Public central test suite passes: `node .ai/tests/run.mjs --suite database`

## Boundaries

- MUST NOT treat `prisma/schema.prisma` as SSOT in database mode
- MUST NOT hand-edit `db/schema/tables.json` (generated snapshot)
- MUST NOT request or log credentials
- SHOULD document desired-state proposals in `db/handbook/` before asking humans to change DB
