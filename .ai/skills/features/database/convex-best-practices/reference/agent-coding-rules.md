# Agent Coding Rules for Convex

## 1. Read before writing

Before changing any Convex-backed feature, read:

1. `docs/project/db-ssot.json`
2. `docs/context/db/schema.json`
3. `docs/context/convex/functions.json`
4. `convex/schema.ts`
5. the specific `convex/**/*.ts` modules involved

If the contracts are missing or stale, refresh them before making high-risk changes.

## 2. Schema-first for persistence changes

When a change affects stored data, the agent MUST:

1. update `convex/schema.ts`
2. update all affected functions
3. regenerate generated code
4. regenerate both context contracts

Do not start by changing only function logic and leaving schema updates for later.

## 2.5 Supported coding shape for v1 contract extraction

To keep `docs/context/convex/functions.json` and `docs/context/db/schema.json` deterministic in v1:

- keep schema definitions in direct `export default defineSchema({ ... })` form
- keep public/internal functions in direct `export const name = query|mutation|action|httpAction|internal*({ ... })` form
- keep indexes directly chained on `defineTable(...)`

Avoid wrapper constructors, dynamic schema composition, or helper layers that hide the final validator/object literal shape from the lightweight extractor.

## 3. Choose the right function type

- `query`: read-only data access and computed views
- `mutation`: transactional writes
- `action`: external I/O, orchestration, long-running operations, or vector search
- `httpAction`: explicit public HTTP entrypoints or webhooks
- internal functions: server-only composition points

A common anti-pattern is using an action for ordinary reads or writes when a query or mutation would be clearer and safer.

## 4. Validation depends on function type

For every public `query`, `mutation`, or `action`:

- define `args`
- define `returns` when the returned shape matters to callers, docs, or typed integrations
- prefer validator-driven inference over parallel handwritten types

For every `httpAction`:

- parse the incoming `Request`
- validate request input explicitly
- keep HTTP-specific auth/signature checks at the boundary

## 5. Access control is explicit

For any privileged operation:

- read the authenticated identity server-side
- load authorization facts from the database
- check ownership, membership, or role server-side
- reject unauthorized calls early

Never use client-supplied claims alone as the source of truth.

## 6. Index before scale

When a query will scan an unbounded or potentially large set, add an index first. Avoid normalizing a slow query into `docs/context` as though it were an accepted pattern.

## 7. Keep generated code usable

After changing schema or function signatures:

- run `npx convex dev` during normal development, or
- run `npx convex codegen` when you only need generated types

If the repository expects CI typechecking without a live Convex session, keep `convex/_generated/**` committed.

## 8. Keep context contracts current

After changes affecting persistence or function interfaces:

```bash
node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .
node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs verify --repo-root . --strict
```

If other `docs/context/**` artifacts were edited separately:

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch --repo-root .
```
