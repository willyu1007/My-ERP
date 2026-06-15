# 04 - Post verify

Checks:

```bash
node -e '<Prisma table existence check>'
```

Outcome:
- Confirmed tables exist:
  - `outbox_event`
  - `work_item`
  - `work_item_event`

```bash
node -e '<Prisma migration finished check>'
```

Outcome:
- `_prisma_migrations` contains `20260613090000_t003_work_item_kernel` with `finished_at IS NOT NULL`.

```bash
node .ai/scripts/ctl-db-ssot.mjs sync-to-context
```

Outcome:
- DB context contract refreshed from repo Prisma SSOT.

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict
pnpm typecheck
pnpm test
```

Outcome:
- Context layer verification passed.
- Typecheck passed.
- Tests passed: 20 files, 97 tests.

Application health:
- `curl -sS --max-time 3 http://localhost:8000/health` failed because the local API service was not running on port 8000 at verification time.
