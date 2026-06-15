# 01 - Schema diff preview

Reviewed migration:
- `prisma/migrations/20260613090000_t003_work_item_kernel/migration.sql`

Summary:
- Creates `work_item`.
- Creates `work_item_event`.
- Creates `outbox_event`.
- Adds indexes for status/ledger/assignee/role/source/dedupe/outbox lookups.
- Adds partial unique index `work_item_active_dedupe_key` for active task dedupe.
- Adds foreign keys.
- Enables RLS on all three new tables.
- Adds org-scope and optional ledger-scope policies.

Destructive operations:
- No table drops.
- No column drops.
- No destructive data rewrite.

Retention note:
- `work_item_event.work_item_id` uses `ON DELETE RESTRICT` to preserve append-only transition history semantics.
