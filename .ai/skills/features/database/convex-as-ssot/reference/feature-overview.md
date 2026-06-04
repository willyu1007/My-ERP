# Convex as SSOT

## Purpose

This feature adds a third database workflow alongside the template's existing Prisma-SSOT and database-mirror modes.

In Convex mode:

- `convex/schema.ts` is the schema SSOT
- `convex/**/*.ts` define the backend function surface
- `docs/context/db/schema.json` is the generated DB contract
- `docs/context/convex/functions.json` is the generated function contract
- public contract refresh flows route through `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
- low-level `ctl-convex` refresh subcommands are internal-only and should not be used as manual workflow commands
- Stage C bootstraps the default repo-root scaffold unless `db.source.path` points at a nested Convex schema, in which case init follows that configured path

## Key invariants

- Convex mode is mutually exclusive with `repo-prisma` and `database`.
- Persistence changes originate in the configured Convex schema source (default: `convex/schema.ts`).
- LLM-facing contracts are generated, not hand-maintained.
- Managed contract paths are fixed to the canonical defaults in v1.
- The workflow remains compatible with the repository's feature model: templates + controller scripts + verification.

## Main outcome

A repository can expose Convex structure to both humans and LLMs without requiring direct access to a running deployment.
