# Feature: database

## Conclusions (read first)

- Enables DB schema SSOT workflows based on `db.ssot`
- Provides a human interface tool (query + change drafting): `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs`
- If `db.ssot=database`: materializes a repo-local DB mirror under `db/` and initializes DB tooling
- If `db.ssot=repo-prisma`: keeps `prisma/` as the schema SSOT convention anchor (no `db/` mirror)
- If `db.ssot=convex`: materializes a Convex skeleton, treats `convex/schema.ts` as SSOT, and generates both DB and function contracts

## Requirements

- `db.ssot` must be `repo-prisma`, `database`, or `convex` (not `none`)
- `features.database` must be `true`
- `features.contextAwareness` must be `true` whenever `db.ssot != none`
- `db.ssot=convex` requires `repo.language` to be `typescript`, `javascript`, or `react-native`
- `db.ssot=convex` bootstraps `convex/` by default, or the configured `db.source.path` location when provided; init/sync/verify all follow the same resolved path
- Managed DB contracts use fixed canonical paths in v1 (`docs/context/db/schema.json` and, for Convex, `docs/context/convex/functions.json`)

## How to enable

### Mode: repo-prisma (schema SSOT = `prisma/schema.prisma`)

In `init/_work/project-blueprint.json`:

```json
{
  "db": { "enabled": true, "ssot": "repo-prisma", "kind": "postgres", "environments": ["dev", "staging", "prod"] },
  "features": { "database": true, "contextAwareness": true }
}
```

### Mode: database (schema SSOT = running database)

In `init/_work/project-blueprint.json`:

```json
{
  "db": { "enabled": true, "ssot": "database", "kind": "postgres", "environments": ["dev", "staging", "prod"] },
  "features": { "database": true, "contextAwareness": true }
}
```

### Mode: convex (schema SSOT = `convex/schema.ts`)

In `init/_work/project-blueprint.json`:

```json
{
  "repo": { "layout": "single", "language": "typescript", "packageManager": "pnpm" },
  "capabilities": { "database": { "enabled": true, "kind": "convex" } },
  "db": { "enabled": true, "ssot": "convex", "kind": "convex", "environments": ["dev", "staging", "prod"] },
  "features": { "database": true, "contextAwareness": true }
}
```

## What Stage C `apply` does

When enabled, Stage C:

1) If `db.ssot=database`:

- Copies templates from:
  - `.ai/skills/features/database/sync-code-schema-from-db/templates/`
- Runs:

```bash
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs init --repo-root .
```

2) If `db.ssot=repo-prisma`:

- Ensures the `prisma/` directory exists (convention anchor; non-destructive)

3) If `db.ssot=convex`:

- Uses the Convex feature templates through `ctl-convex.mjs`
- Bootstraps `convex/` by default, or the configured `db.source.path` location when provided
- Runs:

```bash
node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs init --repo-root .
```

4) For every managed DB mode (`repo-prisma` / `database` / `convex`), Stage C then:

- Writes `docs/project/db-ssot.json`
- Updates the root `AGENTS.md` DB-SSOT block
- Refreshes generated contracts through the public entrypoint:

```bash
node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .
```

- Optional verification (when Stage C is run with `--verify-features`) happens **after** contract refresh.
- In Convex mode, that post-refresh verification is strict.

## Key outputs

- `docs/project/db-ssot.json` (SSOT mode selection file)
- `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs` (human interface)
- `db/**` (only when `db.ssot=database`)
- `prisma/**` (only when `db.ssot=repo-prisma`)
- `convex/**` + `docs/context/convex/**` (only when `db.ssot=convex`)

## Common commands

```bash
# Inspect SSOT mode + canonical managed paths
node .ai/scripts/ctl-db-ssot.mjs status

# Refresh generated DB contracts from the active SSOT
node .ai/scripts/ctl-db-ssot.mjs sync-to-context

# Inspect SSOT mode + human-interface input sources
node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs status

# Query tables/columns/enums and write a human doc
node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query users

# Draft a change request (writes a modify doc with a dbops block)
node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify users

# Generate a plan (+ runbook when db.ssot=database)
node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs plan users
```
