# 02 - Migration plan

Strategy:
- Use versioned Prisma migration.
- Command: `pnpm db:deploy`
- No `prisma db push`.

Approval:
- User explicitly approved DB execution with: "允许执行DB".

Expected effect:
- Apply pending migration `20260613090000_t003_work_item_kernel`.
- Bring local dev DB schema in sync with repo Prisma SSOT for T-003.

Rollback expectation:
- This local dev apply is additive. If rollback is needed during development, prefer a new corrective migration unless the user explicitly approves local database reset/rebuild.
