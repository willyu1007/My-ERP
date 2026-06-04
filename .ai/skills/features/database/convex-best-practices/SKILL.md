---
name: convex-best-practices
description: Apply Convex-specific coding and review rules when building or reviewing Convex-backed features. Treat convex/schema.ts as DB SSOT, keep public functions validated and authenticated, prefer indexes over query filters, commit generated code, and keep docs/context contracts synchronized.
---
# Convex Best Practices

## Purpose

Use `convex-best-practices` when the project uses Convex for persistence and backend functions, especially when `convex/schema.ts` is the database Single Source of Truth (SSOT).

The skill standardizes how an agent should **write**, **review**, and **refactor** Convex code so the resulting repository stays compatible with:

- `convex/schema.ts` as the schema SSOT
- `docs/context/db/schema.json` as the generated DB contract for LLMs
- `docs/context/convex/functions.json` as the generated Convex function contract
- the repository's `features/database/` skill style, where workflow skills own generated artifacts and human-facing skills own guidance

## When to use

Use `convex-best-practices` when the user asks to:

- add or change Convex tables, fields, indexes, search indexes, or vector indexes
- add or change Convex `query`, `mutation`, `action`, `httpAction`, or internal functions
- review Convex code for correctness, security, maintainability, or performance
- make an agent behave consistently when writing Convex-backed application code
- bring existing Convex code into alignment with the repository's SSOT + context-contract workflow

Use `convex-as-ssot` alongside `convex-best-practices` when the task needs to initialize Convex scaffolding or regenerate the context contracts.

## Required inputs

Read the inputs in the following order when available:

1. `docs/project/db-ssot.json`
2. `docs/context/db/schema.json`
3. `docs/context/convex/functions.json`
4. `convex/schema.ts`
5. `convex/**/*.ts` (excluding `convex/_generated/**`)

## Expected outputs

Depending on the task, the agent should produce some combination of:

- changes to `convex/schema.ts`
- changes to Convex function files under `convex/`
- regenerated `convex/_generated/**`
- regenerated `docs/context/db/schema.json`
- regenerated `docs/context/convex/functions.json`
- concise implementation notes or review findings under `dev-docs/active/**` when the task is large or risky

## Operating loop

Follow the operating loop in order:

1. Confirm the project is using Convex or is being migrated to Convex.
2. Read the current SSOT and context contracts before editing code.
3. Apply schema changes in `convex/schema.ts` first when persistence shape changes.
4. Apply function changes in `convex/**/*.ts`, preserving the correct function type:
   - `query` for reads
   - `mutation` for transactional writes
   - `action` for external I/O, orchestration, or non-database work
   - `httpAction` only for explicit HTTP endpoints or webhooks
   - internal functions for server-only building blocks
5. Ensure public `query` / `mutation` / `action` functions have argument validators and, where practical, return validators.
6. Ensure every `httpAction` parses and validates request input explicitly instead of using normal Convex `args`.
7. Ensure every public function has explicit access-control logic if the capability is not intentionally public.
8. Prefer indexes and explicit query plans over `.filter(...)` on database queries.
9. Run Convex code generation:
   - `npx convex dev` during interactive development, or
   - `npx convex codegen` when only regenerating types
10. Regenerate context contracts:
   - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
11. Verify freshness and drift:
   - `node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs verify --repo-root . --strict`
12. `ctl-db-ssot.mjs sync-to-context` refreshes checksums best-effort. Re-run `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch` only if you also edited other context artifacts manually.
13. Run a self-review using the checklist in `reference/review-checklist.md`.

## Rules

### SSOT and contracts

- `convex/schema.ts` MUST be treated as the persistence SSOT in Convex mode.
- `docs/context/db/schema.json` MUST be treated as a generated artifact.
- `docs/context/convex/functions.json` MUST be treated as a generated artifact.
- Generated contracts MUST NOT be hand-edited unless the workflow is explicitly in a manual recovery state.

### Function selection

- Reads MUST use `query` unless there is a strong reason to use another function type.
- Database writes MUST use `mutation`.
- External API calls, long-running orchestration, or runtime-only integrations MUST use `action` or `httpAction`.
- Internal-only orchestration or privileged steps SHOULD use internal functions.

### Validation and typing

- Public `query`, `mutation`, and `action` functions MUST define `args`.
- Public `query`, `mutation`, and `action` functions SHOULD define `returns` when the result shape is stable and important.
- `httpAction` does not use normal Convex `args` validators.
- `httpAction` MUST parse and validate request input explicitly.
- Internal functions SHOULD define validators when practical, but may omit them in tightly controlled server-only flows.
- The agent SHOULD rely on validator-driven inference instead of duplicating TypeScript types by hand.
- The agent MUST update generated types after schema or function-signature changes.
- The agent MUST keep to parser-safe coding shapes when `docs/context/convex/functions.json` needs to remain complete:
  - `export default defineSchema({ ... })`
  - `export const name = query|mutation|action|httpAction|internal*({ ... })`
  - direct chained index definitions on `defineTable(...)`
- The agent MUST NOT assume v1 contract extraction understands wrapper constructors, dynamic schema composition, or heavily abstracted validator builders.

### Access control

- Public functions that are not intentionally anonymous MUST check identity and authorization explicitly.
- Access control MUST use trusted server-side data such as `ctx.auth.getUserIdentity()` and server-side lookups.
- Client-supplied identifiers such as emails or role flags MUST NOT be trusted by themselves for authorization.

### Query performance

- The agent SHOULD design indexes in `convex/schema.ts` before writing read paths that need them.
- The agent SHOULD prefer `.withIndex(...)`, `.withSearchIndex(...)`, or vector search over query-time `.filter(...)` for scalable access paths.
- The agent MAY use in-memory filtering only when the result set is deliberately bounded and readability clearly benefits.

### Generated code and repository hygiene

- `convex/_generated/**` SHOULD be committed in repositories that typecheck Convex code in CI or without running Convex locally first.
- The agent MUST NOT hand-edit files under `convex/_generated/**`.
- Secrets MUST NOT be written into `docs/context/**`, `dev-docs/**`, or checked-in templates.

## Verification

Run these checks when the repository supports them:

```bash
npx convex codegen
node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .
node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs verify --repo-root . --strict
# Only if other docs/context artifacts were edited manually:
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch --repo-root .
```

Then confirm:

- the schema still parses
- the intended indexes exist
- generated types changed only where expected
- the DB contract reflects the schema change
- the function contract reflects the function change
- public functions remain validated and authorized

## References

- `reference/feature-overview.md`
- `reference/agent-coding-rules.md`
- `reference/review-checklist.md`
- `reference/agent-playbook.md`
- `examples/schema.ts`
- `examples/messages.ts`

## Boundaries

- Do NOT use `convex-best-practices` as the primary workflow for Prisma or database-mirror projects.
- Do NOT bypass `convex/schema.ts` when the task changes persistent data shape.
- Do NOT put third-party network calls inside `query` or `mutation`.
- Do NOT treat `docs/context/db/schema.json` or `docs/context/convex/functions.json` as hand-maintained source files.
