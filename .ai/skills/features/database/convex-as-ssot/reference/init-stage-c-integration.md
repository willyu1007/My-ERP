# Init / Stage C Integration Notes

This file documents the current Convex Stage C integration in the template repository.

## 1. Blueprint schema

Add `convex` to the allowed database workflow choices.

Recommended changes:

- `db.ssot`: add `convex`
- `db.kind`: add `convex`
- validation: `features.database=true` still required when `db.ssot=convex`
- validation: `features.contextAwareness=true` is also required when `db.ssot=convex`
- validation: monorepo layouts are allowed; Stage C follows the configured Convex schema path when `db.source.path` is provided

## 2. Stage C materialization

When `db.ssot=convex`, Stage C should:

1. write `docs/project/db-ssot.json` so the configured Convex schema path is available to the controller
2. run:

```bash
node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs init --repo-root .
```

3. update the root AGENTS DB-SSOT block, and refresh contracts through the public entrypoint:

```bash
node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .
```

4. verify after contract refresh (strict bootstrap verify):

```bash
node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs verify --repo-root . --strict
```

## 3. `docs/project/db-ssot.json`

In Convex mode, the generated config should point at the active Convex schema source (default `convex/schema.ts`) and the function contract.

Example shape:

```json
{
  "db": {
    "ssot": "convex",
    "source": {
      "kind": "convex-schema",
      "path": "convex/schema.ts"
    },
    "contracts": {
      "dbSchema": "docs/context/db/schema.json",
      "convexFunctions": "docs/context/convex/functions.json"
    }
  }
}
```

## 4. Central DB SSOT controller

The repository delegates Convex-specific contract refresh logic from `.ai/scripts/ctl-db-ssot.mjs` into `ctl-convex.mjs`.

This keeps Convex parsing logic inside the Convex skill package while preserving one public refresh entrypoint.

## 5. Human interface and context-awareness

The following components need light adaptation, not replacement:

- `db-human-interface`
- `context-awareness`
- `init/_tools/feature-docs/database.md`
- `init/_tools/feature-docs/context-awareness.md`
