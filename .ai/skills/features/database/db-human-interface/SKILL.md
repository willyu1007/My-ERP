---
name: db-human-interface
description: Human-friendly DB structure query + interactive change drafting (Markdown) on top of the normalized DB schema contract (v2). Produces .ai/.tmp/database artifacts and hands off execution to DB SSOT workflows.
---

# Database Docs Feature

## Intent

Provide a **human-friendly DB interaction entry point** for:

1. **Reading**: turn the unified DB schema contract into skimmable Markdown.
2. **Drafting changes**: draft structured change requests as `dbops` inside Markdown, suitable for human review.

The Database Docs feature is designed for **LLM-assisted development**:

- Human describes desired change in natural language.
- LLM updates files.
- Human reviews the file(s) and confirms.

## Trigger policy (strict)

Load and use the `db-human-interface` skill only when the user explicitly asks one of:

- “What is the schema/structure for X?”
- “Which table contains field X?”
- “Show me the columns/indexes/relations for X.”
- “I want to add/modify a DB column/table/index; draft the change.”
- “Generate a DB change runbook.”

If the user is executing schema sync, migrations, or DB pull/push workflows, route to the DB SSOT workflow skills instead.

## Hard boundaries (do not overlap DB SSOT workflow skills)

The Database Docs feature **does not**:

- run Prisma migrations (`migrate dev/deploy`)
- connect to or modify a real database
- finalize SSOT synchronization

The Database Docs feature only produces **human-facing artifacts** and **plans/runbooks**, then hands off to:

- `sync-db-schema-from-code` when `db.ssot = repo-prisma`
- `sync-code-schema-from-db` when `db.ssot = database`
- `convex-as-ssot` + `convex-best-practices` when `db.ssot = convex`

## Canonical inputs (read order)

The controller script reads from these sources:

1. `docs/project/db-ssot.json` (preferred; determines the active DB SSOT mode)
2. `docs/context/db/schema.json` (preferred normalized DB contract)
3. `docs/context/convex/functions.json` (when `db.ssot=convex`)
4. `db/schema/tables.json` (DB mirror; normalized or legacy)
5. `prisma/schema.prisma` (only if the normalized DB contract is missing)

Managed DB workflows in this repository are **contract-first**:

- if `db.ssot != none`, `features.contextAwareness=true` is required
- `docs/context/db/schema.json` is the canonical generated DB contract

SSOT mode is read from:

- `docs/project/db-ssot.json` (preferred)

If missing, the script infers the mode conservatively.

## Outputs (artifacts)

All artifacts are written under `.ai/.tmp/database/` (not intended for git):

- Human reading:
  - `.ai/.tmp/database/structure_query/<object>.md` (default / legacy)
  - `.ai/.tmp/database/structure_query/<object>__concept.md` (when `query ... --view concept`)
  - `.ai/.tmp/database/structure_query/<object>__graph.md` (when `query ... --view graph`)
  - `.ai/.tmp/database/structure_query/<table>__api.md` (when `query <table> --view api`)
  - `.ai/.tmp/database/structure_query/<term>__functions.md` (when `query ... --view functions`)
  - `.ai/.tmp/database/structure_query/<function>__surface.md` (when `query ... --view surface`)
- Interactive change drafting:
  - `.ai/.tmp/database/structure_modify/<object>.md` (table scope)
  - `.ai/.tmp/database/structure_modify/<object>__concept.md` (concept scope)
  - `.ai/.tmp/database/structure_modify/<object>.plan.md`
  - `.ai/.tmp/database/structure_modify/<object>.runbook.md` (only when `db.ssot=database`)

Note: for safety, view/scope-specific files are suffixed (e.g. `__concept`, `__graph`, `__api`) to avoid overwriting other views.

## Controller script

Use the CLI tool:

- `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs <command> ...`

Supported commands:

- `status` — print detected SSOT mode + input sources
- `search <term>` — list best table/column/enum matches; in Convex mode also include function surface matches (stdout)
- `query <object> [--view table|concept|graph|api|functions|surface]` — write a structure doc
  - `--view table` (default): best-match table/enum/column/search
  - `--view concept`: cluster of related tables around a term
  - `--view graph`: Mermaid relationship graph for the concept cluster
  - `--view api`: DTO-oriented view for a single table
  - `--view functions`: list matching Convex functions (Convex mode only)
  - `--view surface`: render one Convex function surface (Convex mode only)
- `modify <object> [--scope table|concept]` — write a change-drafting doc with an editable `dbops` block
  - `--scope table` (default): single-table modify doc
  - `--scope concept`: multi-table concept modify doc (writes `__concept.md`)
- `plan <object>` — read `dbops` and generate a plan (and runbook for DB SSOT)

## Efficient object resolution strategy

When the user asks about “X”, use the following resolution order:

1. Exact table match (case-insensitive)
2. Exact enum match
3. Exact column match (cross-table)
4. In Convex mode, exact function match:
   - exact `functionId`
   - exact `exportName` (when unique)
   - exact `modulePath` (when unique)
5. Fuzzy match:
   - substring / token overlap on table names
   - substring / token overlap on column names
   - in Convex mode, substring / token overlap on `functionId`, `exportName`, `modulePath`, `kind`, `visibility`, `auth.kind`, `tablesRead`, and `tablesWritten`

If `X` matches multiple tables via column name:

- Prefer `query X` first (the command produces a cross-table column view)
- Then ask the user which table they mean, and run `query <Table>`

## Display rules for complex / coupled structures

When `query` renders a table, the doc should highlight:

- **Many-to-many**: explicitly identify the join table
- **Soft delete**: `deletedAt` + relevant indexes
- **Multi-tenant**: `tenantId` propagation patterns
- **JSON columns**: treat as DB-opaque; recommend app-layer schema documentation

If a user asks about a concept (e.g. “permissions”) and the concept maps to a cluster:

- Use `query permissions --view concept`
- If they need a diagram: `query permissions --view graph`

If a user asks about a Convex function or which function reads/writes a table:

- Use `query <term> --view functions` to list matches
- Use `query <functionId> --view surface` for the detailed function view
- Keep `modify` / `plan` for schema/table planning, not function editing

## Interactive change drafting protocol

### 1) Human request → generate a modify doc

- Run (single table):
  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify <Table>`

- Run (concept cluster / multi-table draft):
  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify "<term>" --scope concept`

The generated modify file (printed on stdout) contains:

- A **read-only snapshot** section (regenerated)
- A single editable fenced block:

```dbops
{ "ops": [], "notes": "" }
```

Rule: **Only edit the `dbops` block.**

### 2) Edit ops (LLM edits files; human confirms)

Allowed “safe” ops for planning:

- `addColumn`
- `addIndex`
- `addEnum`
- `addTable`

High-risk ops (rename/drop/type changes/non-null backfills) should be represented as `notes` + plan guidance, not as automatic actions.

### 3) Generate plan (+ runbook if DB SSOT)

- Run:
  - `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs plan <object>`

The `plan` command writes (base name derived from the modify doc filename; printed on stdout):

- `<base>.plan.md`
- and, if `db.ssot=database`, `<base>.runbook.md`

Rule: `plan` looks for the corresponding modify doc by `<object>` first, then falls back to `<object>__concept.md`.

### 4) Handoff to DB SSOT workflows

- If `db.ssot=repo-prisma`:
  - Apply changes in `prisma/schema.prisma` (human+LLM, reviewed)
  - Then use `sync-db-schema-from-code` to generate migrations and refresh `docs/context/db/schema.json`

- If `db.ssot=database`:
  - Human executes the runbook against the real DB
  - Then use `sync-code-schema-from-db` to refresh Prisma mirror and the context contract

- If `db.ssot=convex`:
  - Human+LLM apply the approved change in `convex/schema.ts` and related `convex/**/*.ts`
  - Run `npx convex codegen` (or `npx convex dev`)
  - Then run `node .ai/scripts/ctl-db-ssot.mjs sync-to-context` to refresh `docs/context/db/schema.json` and `docs/context/convex/functions.json`
  - Then run `node .ai/skills/features/database/convex-as-ssot/scripts/ctl-convex.mjs verify --repo-root . --strict`
  - Only if other `docs/context/**` artifacts were hand-edited separately, run `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch --repo-root .`

## Safety and review checklist

Before any SSOT change or DB execution:

- Confirm environment (dev/staging/prod)
- Confirm whether changes are destructive
- For non-null additions on existing tables: require a backfill plan
- Ensure the resulting schema contract is refreshed (`ctl-db-ssot sync-to-context`)

## Verification

- [ ] `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs status` prints an SSOT mode and input sources
- [ ] `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <object>` writes a doc under `.ai/.tmp/database/structure_query/`
- [ ] `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <term> --view functions` writes a Convex function list when `db.ssot=convex`
- [ ] `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query <functionId> --view surface` writes a Convex function surface when `db.ssot=convex`
- [ ] `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify <object>` writes a doc under `.ai/.tmp/database/structure_modify/`
- [ ] `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs plan <object>` writes `<base>.plan.md` (and `<base>.runbook.md` when `db.ssot=database`)
- [ ] No secrets are written to repo files or evidence artifacts

## Boundaries

- MUST NOT connect to databases or run SQL
- MUST NOT run Prisma migrations
- MUST NOT hand-edit `db/schema/tables.json` (generated snapshot)
- MUST NOT use `db-human-interface` to plan or edit Convex function source directly
- MUST route actual SSOT synchronization to:
  - `sync-db-schema-from-code` when `db.ssot=repo-prisma`
  - `sync-code-schema-from-db` when `db.ssot=database`
  - `convex-as-ssot` when `db.ssot=convex`
