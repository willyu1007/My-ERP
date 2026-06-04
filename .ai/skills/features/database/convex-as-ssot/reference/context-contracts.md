# Context Contracts for Convex Mode

## 1. Database contract

Path:

- `docs/context/db/schema.json`
- the database contract path is fixed in v1; do not relocate the path via `db-ssot.json`

Purpose:

- provide a normalized, LLM-friendly view of the Convex data model
- remain close enough to the repository's existing `normalized-db-schema-v2` shape that downstream readers can adapt with minimal change

Important mapping rules:

- `defineTable({...})` -> table
- validator entries -> columns / fields
- `v.id("otherTable")` -> relation hint
- `.index(...)` -> index
- `.searchIndex(...)` -> search index
- `.vectorIndex(...)` -> vector index
- `_id` and `_creationTime` -> system fields

## 2. Convex function contract

Path:

- `docs/context/convex/functions.json`
- the Convex function contract path is fixed in v1; do not relocate the path via `db-ssot.json`

Purpose:

- expose the callable Convex surface in a compact, machine-readable form
- let future skills and tools answer "which function should I change?" without full repo scanning

Recommended top-level shape:

- `version`
- `updatedAt`
- `source`
- `functions[]`

Recommended function fields:

- `functionId`
- `kind`
- `visibility`
- `file`
- `runtime`
- `argsValidator`
- `returnsValidator`
- `auth`
- `uses`
- `tablesRead`
- `tablesWritten`

## 3. Registry interaction

If `context-awareness` is installed:

- these contracts should be registered under `docs/context/registry.json`
- regenerate them only through `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
- low-level `ctl-convex` refresh subcommands are internal-only and not part of the supported manual workflow
- after regeneration, `ctl-db-ssot` should refresh checksums best-effort via `ctl-context touch`

## 4. Human interface interaction

`db-human-interface` should continue reading the DB contract from `docs/context/db/schema.json`, but the tool should use Convex terminology such as:

- table
- document field
- system field
- index
- search index
- vector index
- `Id<"table">` relation
