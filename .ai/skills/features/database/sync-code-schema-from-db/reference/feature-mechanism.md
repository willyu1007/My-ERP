# Database Feature (Optional)

## Conclusions (read first)

- This feature is intended for projects where the **real database is the SSOT** (`db.ssot=database`).
- The repository holds **structured mirrors** under `db/` so the LLM can understand the schema without DB access.
- `db/schema/tables.json` is a **generated snapshot** (normalized-db-schema-v2). Do NOT hand-edit it.
- The canonical LLM context contract is `docs/context/db/schema.json` and is generated via `ctl-db-ssot`.

## What the feature writes (blast radius)

New files/directories (created if missing):

- `db/` (database artifacts root)
  - `db/AGENTS.md` (LLM guidance)
  - `db/schema/tables.json` (generated schema mirror)
  - `db/migrations/` (optional SQL files for humans)
  - `db/config/` (environment metadata; no secrets)
  - `db/samples/` (sample/seed data)
  - `db/handbook/` (DB change proposals, rollout plans)
- `.ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs` (mirror controller)
- `.ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs` (optional migration tracking)

## Install

### Install manually

1. Copy templates from:

   - `.ai/skills/features/database/sync-code-schema-from-db/templates/`

   into the repository root (merge / copy-if-missing).
2. Initialize the mirror skeleton (idempotent):

   ```bash
   node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs init
   ```

Optional (recommended for LLM routing): record the flag in project state:

```bash
node .ai/scripts/ctl-project-state.mjs init
node .ai/scripts/ctl-project-state.mjs set features.database true
```


## Usage

### Mirror management

```bash
# Initialize db mirror structure
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs init

# Import prisma/schema.prisma into the mirror
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs import-prisma

# List tables in the mirror
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs list-tables

# Verify mirror file is parseable
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs verify --strict
```

### Context awareness bridge (recommended)

If the context-awareness feature is enabled, sync the mirror into `docs/context/`:

```bash
node .ai/scripts/ctl-db-ssot.mjs sync-to-context
```

The command updates `docs/context/db/schema.json` and (best effort) runs `ctl-context touch`.

### Migration tracking (optional)

This feature may be used to track DB changes executed by humans:

```bash
# Create an empty SQL file for humans to fill/apply
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs generate-migration --name add-user-roles

# Track applied migrations per environment (manual bookkeeping)
node .ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs list
node .ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs mark-applied --migration 20260101120000_add_user_roles.sql --env staging
```

## AI/LLM guidelines

When working with the feature, AI SHOULD:

1. Read `db/schema/tables.json` for **current state**.
2. Write proposals in `db/handbook/` (desired state, risk notes, rollout plan).
3. Ask humans to apply DDL/migrations.
4. After DB changes: re-run `prisma db pull`, `ctl-db import-prisma`, and `ctl-db-ssot sync-to-context`.

AI MUST NOT:

- directly connect to databases
- run arbitrary SQL
- store credentials
- hand-edit `db/schema/tables.json`

## Rollback / Uninstall

Delete these paths:

- `db/`
- `.ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs`
- `.ai/skills/features/database/sync-code-schema-from-db/scripts/migrate.mjs`
