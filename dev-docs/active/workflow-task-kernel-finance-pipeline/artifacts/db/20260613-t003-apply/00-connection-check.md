# 00 - Connection check

Date: 2026-06-13

Target:
- Environment: local dev
- Datasource: PostgreSQL
- Database: `myerp`
- Host: `localhost:5433`
- Schema: `public`

Checks:
- `docs/project/db-ssot.json` mode: `repo-prisma`.
- `npx prisma migrate status --schema prisma/schema.prisma` connected successfully and reported one pending migration before apply: `20260613090000_t003_work_item_kernel`.

Secrets:
- No credentials were written to this evidence file.
