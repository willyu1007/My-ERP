# DB Connection Check

## Context
- Task: `<task>`
- Environment: `<dev|staging|prod>`
- DB type: `<postgres|mysql|sqlite>`
- Direction: `code → DB`

## Connection summary (redacted)
- URL (redacted): `<e.g. postgresql://user:***@host:5432/db>`
- Host: `<host>`
- Port: `<port>`
- Database: `<dbname>`
- User: `<user>`
- SSL: `<required|preferred|disabled|unknown>`

## Preflight result
- Timestamp (UTC): `<YYYY-MM-DDTHH:MM:SSZ>`
- Connectivity: `<PASS|FAIL>`
- Server version (if available): `<...>`
- Round-trip latency (if available): `<...>`

## Common failure hints (fill if relevant)
- Auth error: confirm username/password/role and that the role can connect.
- Network timeout: confirm allowlist/VPC/Security Group rules and that the port is reachable.
- Permission error: confirm the role has DDL privileges for migrations.
- Wrong environment: confirm host/dbname match the intended environment.

## Notes
- Do not paste secrets. Keep all credentials out of this document.
