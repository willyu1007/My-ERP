# 03 - Execution log

Commands executed:

```bash
npx prisma migrate status --schema prisma/schema.prisma
```

Outcome:
- Connected to PostgreSQL database `myerp`, schema `public`, at `localhost:5433`.
- Found 10 migrations.
- Reported pending migration: `20260613090000_t003_work_item_kernel`.

```bash
pnpm db:deploy
```

Outcome:
- Applied migration `20260613090000_t003_work_item_kernel`.
- Prisma reported: all migrations have been successfully applied.

```bash
npx prisma migrate status --schema prisma/schema.prisma
```

Outcome:
- Database schema is up to date.
