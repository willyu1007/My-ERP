# Agent Playbook: Writing Convex Code Deterministically

## Step 0 — Establish the mode

Confirm that the repository is in Convex mode or is being migrated there.

Read:

- `docs/project/db-ssot.json`
- `convex/schema.ts`

## Step 1 — Build the local mental model

Load the contracts first:

- `docs/context/db/schema.json`
- `docs/context/convex/functions.json`

Use the source files only to resolve details that are not already in the contracts.

## Step 2 — Change the SSOT

If persistence shape changes, modify `convex/schema.ts` first.

Typical examples:

- add a field
- add a relation with `v.id("otherTable")`
- add an index
- add a search index
- add a vector index

## Step 3 — Change behavior

Update or create functions under `convex/`:

- read paths as `query`
- write paths as `mutation`
- external service orchestration as `action`
- webhook/public HTTP entrypoints as `httpAction`

Stay within the parser-safe v1 coding shape:

- `export default defineSchema({ ... })`
- `export const name = query|mutation|action|httpAction|internal*({ ... })`
- direct chained index definitions on `defineTable(...)`

## Step 4 — Make the function safe

For public `query`, `mutation`, and `action` functions:

- add `args`
- add `returns` when appropriate
- add auth checks
- avoid client-trusted authorization

For `httpAction`:

- parse the `Request`
- validate request input explicitly
- add auth/signature checks at the HTTP boundary

## Step 5 — Regenerate typed surfaces

Run:

```bash
npx convex codegen
```

Or use `npx convex dev` if working interactively.

## Step 6 — Refresh contracts

Run:

```bash
node .ai/scripts/ctl-db-ssot.mjs sync-to-context --repo-root .
node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs verify --repo-root . --strict
```

Only if other context artifacts were edited manually:

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch --repo-root .
```

## Step 7 — Self-review

Before finishing, answer:

1. What changed in the schema?
2. What changed in the API surface?
3. Which indexes protect the new read paths?
4. How is authorization enforced?
5. Which generated artifacts changed and why?
