# Migration / Sync Plan

## Context
- Task: `<task>`
- Environment: `<dev|staging|prod>`
- DB type: `<postgres|mysql|sqlite>`

## Strategy selection
- Chosen strategy: `<Prisma migrate (default)|Prisma db push (explicit)|Alembic>`
- Reasoning: `<why this strategy fits>`

## Preconditions
- [ ] Target environment confirmed
- [ ] Backup / snapshot ready (or explicit risk acceptance recorded)
- [ ] DDL permissions confirmed
- [ ] Maintenance window (if needed) planned
- [ ] Diff preview reviewed

## Apply steps (commands)
> Record commands without secrets. Prefer environment variables over inline URLs.

1. `<command 1>`
2. `<command 2>`

## Rollback strategy
- Primary rollback: `<disable feature / revert migration / restore snapshot>`
- Rollback trigger: `<error threshold / validation failure / smoke test failure>`
- Rollback owner: `<who executes rollback>`

## Verification plan
- Schema verification: `<prisma status/diff, alembic current, snapshot comparison>`
- Application verification: `<build/tests/smoke checks>`
- Acceptance criteria: `<what must be true to mark complete>`

## Approval record
- Approved by: `<name>`
- Approved at (UTC): `<YYYY-MM-DDTHH:MM:SSZ>`
- Notes: `<scope confirmation / destructive change acknowledgement>`
