# Post-Apply Verification

## Context
- Task: `<task>`
- Environment: `<dev|staging|prod>`
- DB type: `<postgres|mysql|sqlite>`

## Schema verification
- Timestamp (UTC): `<YYYY-MM-DDTHH:MM:SSZ>`
- Method: `<prisma status/diff | alembic current | snapshot comparison>`
- Result: `<PASS|FAIL>`
- Evidence:
  - <output snippet / file path to artifact>

## Application verification
- Build/typecheck: `<PASS|FAIL>`
- Automated tests: `<PASS|FAIL>`
- Smoke tests: `<PASS|FAIL>`
- Notes:
  - <...>

## Final result
- Synchronization complete: `<yes|no>`
- Remaining follow-ups:
  - <...>
