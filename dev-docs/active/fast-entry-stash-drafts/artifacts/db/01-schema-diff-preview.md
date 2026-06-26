# Schema Diff Preview

Migration file:

- `prisma/migrations/20260626113000_fast_entry_draft_payload/migration.sql`

SQL:

```sql
ALTER TABLE "journal_voucher" ADD COLUMN "draft_payload" JSONB;
```

Destructive changes: none.

Purpose: preserve incomplete quick-entry UI draft state for `draft` vouchers. This payload is not an accounting source.
