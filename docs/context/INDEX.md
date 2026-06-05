# Project Context Index (LLM-first)

## Conclusions (read first)

- `docs/context/` is the **stable, curated context layer** for this repository.
- The canonical index of all context artifacts is `docs/context/registry.json`.
- When `docs/context/` exists, AI/LLM SHOULD prefer these artifacts over ad-hoc repository scanning.
- Any change to context artifacts MUST be accompanied by an updated registry checksum:
  - Run `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch`
  - Verify with `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`

## What lives here

Typical artifacts (not exhaustive):

- **LLM routing entrypoint**: `docs/context/AGENTS.md` (progressive loading protocol — start here)
- API contract: `docs/context/api/openapi.yaml`
- API index (LLM summary): `docs/context/api/api-index.json` (generated from openapi.yaml by `ctl-api-index.mjs`)
- Database schema contract: `docs/context/db/schema.json` (generated; do not hand-edit)
- Convex function contract: `docs/context/convex/functions.json` (canonical when Convex is the DB SSOT)
- Business processes: `docs/context/process/*.bpmn`
- Domain glossary: `docs/context/glossary.json` (structured term definitions)
- Architecture principles: `docs/context/architecture-principles.md` (cross-cutting constraints)

All artifacts MUST be registered in `docs/context/registry.json`.

## How to load context (for AI/LLM)

1. Open `docs/context/AGENTS.md` for the full progressive loading protocol.
2. Open `docs/context/registry.json` to discover available artifacts.
3. For API work: read `docs/context/api/api-index.json` first (compact overview of all endpoints).
4. For full endpoint detail: read `docs/context/api/openapi.yaml` (complete schemas).
5. For terminology/concept questions: read `docs/context/glossary.json`.
6. For architecture constraints: read `docs/context/architecture-principles.md`.
7. Select only the artifacts needed for the current task. Open those files by path (do not scan folders).

## Database schema contract

- The DB schema contract is: `docs/context/db/schema.json`.
- Format: `normalized-db-schema-v2` (LLM-optimized; tool-agnostic).
- Do NOT hand-edit the contract.

### How the contract is generated

The generator is SSOT-aware:

- Project DB SSOT configuration: `docs/project/db-ssot.json`
- Generator script: `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`

The generator chooses the source based on SSOT mode:

- `repo-prisma`: reads `prisma/schema.prisma` (SSOT) and emits the contract.
- `database`: reads `db/schema/tables.json` (mirror of real DB) and emits the contract.
- `convex`: delegates to `convex-as-ssot` to emit both the DB contract and the Convex function contract.
- `none`: emits an empty contract.

After generation, `ctl-db-ssot` runs `ctl-context touch` (best effort) to keep checksums consistent.

## Convex function contract

- When `db.ssot=convex`, the repository registers `docs/context/convex/functions.json`.
- That artifact summarizes the public/internal Convex function surface, validators, auth signals, and usage hints.
- Read `docs/context/db/schema.json` first for the data model, then `docs/context/convex/functions.json` for the function surface, before opening `convex/**/*.ts`.

## How to update context (script-only)

Use `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs`:

- Initialize (idempotent):
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs init`
- Register a new artifact:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-artifact --id <id> --type <type> --path <repo-relative-path>`
- Update checksums after edits:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch`
- Verify consistency (for CI):
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`

## Verification

- Registry and artifacts are consistent:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`
