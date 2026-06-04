# Migration / Sync Plan (Example)

## Context
- Task: `add-user-profile-table`
- Environment: `staging`
- DB type: `postgres`

## Strategy selection
- Chosen strategy: `Prisma migrate (default)`
- Reasoning: versioned migrations required for repeatable deploys

## Preconditions
- [x] Target environment confirmed (staging)
- [x] Backup / snapshot ready
- [x] DDL permissions confirmed
- [x] Diff preview reviewed (migration SQL)

## Apply steps (commands)
1. Generate migration locally without applying:
   - `npx prisma migrate dev --create-only --name add_user_profile`
2. Review `prisma/migrations/*/migration.sql` in code review
3. Deploy to staging:
   - `npx prisma migrate deploy`

## Rollback strategy
- Primary rollback: restore from snapshot, or deploy a follow-up migration to revert the change
- Rollback trigger: smoke test fails or application errors spike

## Verification plan
- Schema verification: `npx prisma migrate status` and basic smoke query
- Application verification: build + smoke test key flows
- Acceptance criteria: new table exists; app reads/writes profile without errors

## Approval record
- Approved by: `<name>`
- Approved at (UTC): `<timestamp>`
