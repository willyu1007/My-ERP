---
name: sync-db-schema-from-code
description: Apply schema changes from repo SSOT (prisma/schema.prisma) to a target DB via Prisma migrations, with diff preview + approval gate; then refresh LLM context (docs/context/db/schema.json).
---

# Sync DB Schema from Code (Prisma SSOT)

## Purpose

Treat `prisma/schema.prisma` as the schema Single Source of Truth (SSOT) and safely apply schema changes to a target database with:

- diff preview before any write
- explicit approval gate
- execution logging and post-verification
- **LLM context refresh** via `docs/context/db/schema.json`

This skill is intentionally written for a **development workflow** (developers manage DB changes via Prisma), not a DBA-centric workflow.

## Hard precondition (SSOT mode gate)

This skill MUST be used only when the project DB SSOT is `repo-prisma`:

- Source of truth: `prisma/schema.prisma`
- DB changes propagate via Prisma migrations

If the project uses **database-as-SSOT**, use `sync-code-schema-from-db` instead.

To check the mode, read:

- `docs/project/db-ssot.json`

## When to use

Use when the user asks to:

- add/rename/remove fields or entities in the persistent model
- generate/apply Prisma migrations from repo changes
- deploy schema changes to dev/staging/prod
- resolve drift between `schema.prisma` and the actual DB

Avoid when:

- the desired direction is DB → code (`prisma db pull`) (use `sync-code-schema-from-db`)
- the task is primarily data backfill / transformation (separate workflow)

## Key invariants (developer-facing)

- **Persistence layer** is defined by Prisma models in `prisma/schema.prisma`.
- **Domain layer** must not depend on Prisma types.
- Repositories adapt: Prisma ↔ persistence entities ↔ domain entities.
- LLMs read DB structure from `docs/context/db/schema.json` (generated; do not hand-edit).

See `./reference/prisma-ssot-mechanism.md` for the end-to-end pattern (domain vs persistence vs DTO).

## Inputs

- Target environment: `dev` / `staging` / `prod` (must be explicit)
- DB connection (prefer `DATABASE_URL` via environment; never paste secrets into chat)
- Prisma strategy:
  - default: versioned migrations (`prisma migrate`)
  - `prisma db push` only if explicitly chosen (and justified)

## Outputs (evidence)

Choose one evidence location (no secrets):

- If the task meets `dev-docs/AGENTS.md` Decision Gate (recommended for staging/prod):
  - `dev-docs/active/<task-slug>/artifacts/db/`
- Otherwise (quick local/dev):
  - `.ai/.tmp/db-sync/<run-id>/`

Evidence files:

- `00-connection-check.md`
- `01-schema-diff-preview.md`
- `02-migration-plan.md`
- `03-execution-log.md`
- `04-post-verify.md`

## Steps

### Phase 0 — Confirm mode and scope

1. Confirm intent is **code → DB**.
2. Confirm DB SSOT mode is `repo-prisma` (`docs/project/db-ssot.json`).
   - If not, STOP and route to `sync-code-schema-from-db`.
3. Confirm the target environment and DB dialect.
4. Choose evidence directory.

### Phase A — Update the SSOT (repo)

5. Apply the schema change in `prisma/schema.prisma` (SSOT).
6. Run local validation (read-only against schema):
   - `npx prisma format`
   - `npx prisma validate`

7. Produce a diff preview (no DB writes):
   - Prefer generating a migration *without applying it*:
     - `npx prisma migrate dev --create-only --name <slug>` (dev)
   - For existing migration history, review pending SQL under `prisma/migrations/*/migration.sql`.

8. Write `01-schema-diff-preview.md` and `02-migration-plan.md`:
   - summarize changes
   - flag destructive operations
   - specify rollout + rollback expectations

### Approval checkpoint (mandatory)

9. Ask for explicit user approval before any DB writes, confirming:
   - environment and target DB
   - whether destructive changes are allowed
   - backup/snapshot readiness (or explicit risk acceptance)
   - strategy (migrate default vs push explicit)

### Phase B — Apply to the target DB

10. Execute the chosen strategy and log every command in `03-execution-log.md`:

- **Staging/Prod** (typical):
  - `npx prisma migrate deploy`
- **Dev** (typical):
  - `npx prisma migrate dev`
- **Push** (explicit exception):
  - `npx prisma db push`

### Phase C — Post-verify

11. Verify schema and application health:

- `npx prisma migrate status`
- run unit/integration tests as applicable

Record evidence in `04-post-verify.md`.

### Phase D — Keep developer layers coherent

12. Update repository mappings and domain entities:

- Domain classes MAY contain non-persisted fields (computed/transient), but persistence mappings must stay explicit.
- Repositories must return domain entities (not Prisma client types).

13. Refresh LLM DB context contract:

- `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`

(If context-awareness is enabled, the command also runs `ctl-context touch` best-effort.)

## Verification

- [ ] SSOT mode is `repo-prisma`
- [ ] Diff preview produced before writes
- [ ] Explicit approval gate respected
- [ ] Apply step executed with logs
- [ ] Post-verify evidence captured
- [ ] Domain/repository mapping updated (no Prisma types in business layer)
- [ ] `docs/context/db/schema.json` refreshed via `ctl-db-ssot`
- [ ] Public central test suite passes: `node .ai/tests/run.mjs --suite database`

## Boundaries

- MUST NOT run reverse sync (DB → code) as the primary workflow
- MUST NOT execute DB writes without explicit user approval
- MUST default to versioned migrations (`prisma migrate`)
- MUST NOT log or store credentials
- SHOULD prefer code review of migration SQL for staging/prod changes
