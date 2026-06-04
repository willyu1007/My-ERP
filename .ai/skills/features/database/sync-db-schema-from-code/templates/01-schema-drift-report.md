# Schema Drift / Diff Preview Report

## Context
- Task: `<task>`
- Environment: `<dev|staging|prod>`
- DB type: `<postgres|mysql|sqlite>`

## SSOT
- SSOT type: `<Prisma|SQLAlchemy+Alembic>`
- Source path(s): `<e.g. prisma/schema.prisma or app/models.py>`
- Notes: `<why this is the SSOT>`

## Current DB snapshot (summary)
- Snapshot timestamp (UTC): `<YYYY-MM-DDTHH:MM:SSZ>`
- Tables count: `<...>`
- Notable schemas/namespaces: `<...>`

## Diff preview method
Choose one and record the exact commands used (redacted if they include URLs):
- Prisma migrate (preferred): `<migrate diff / create-only migration>`
- Prisma push preview: `<migrate diff (preview only)>`
- Alembic preview: `<revision --autogenerate>`

## Proposed schema changes (summary)
List the intended changes in a reviewable format.

### Additions
- <table/column/index/...>

### Modifications
- <alter column/type/constraint/...>

### Removals (destructive)
- <drop column/table/...>

## Destructive change assessment
- Destructive changes present: `<yes|no>`
- Data loss risk: `<low|medium|high>`
- Preconditions (backup/snapshot, maintenance window, app compatibility):
  - <...>

## Notes
- For remote/prod changes, prefer reviewing migration SQL in code review before applying.
