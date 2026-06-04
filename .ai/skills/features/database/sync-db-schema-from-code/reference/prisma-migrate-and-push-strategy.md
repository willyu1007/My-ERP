# Prisma strategy: migrate (default) vs db push (explicit)

The skill defaults to **Prisma migrate** because Prisma migrate provides versioned, reviewable schema changes via migration files.

## Decision rule
- Default: **migrate** (version management)
- Use **db push** only when the user explicitly chooses db push (prototyping, disposable environments, or very small controlled changes).

## Migrate (default)
### Why migrate
- Produces `prisma/migrations/*` as versioned history (auditability, CI/CD friendliness).
- Supports code review of generated SQL.

### How to preview changes (no writes)
Pick one:
- Generate a migration without applying it (local/dev): `migrate dev --create-only`, then review `migration.sql`.
- Use `migrate diff` to produce a SQL preview for review.

### Applying changes
- Local/dev: `migrate dev` (may create/apply migrations).
- Remote/prod: `migrate deploy` to apply committed migrations.

## db push (explicit)
### What it is
- Synchronizes the database schema to match `schema.prisma` without generating migration files.

### Previewing changes
- There is no native `db push --dry-run`.
- Use `migrate diff` as the preview mechanism.
- For risky changes, test on a cloned/staging DB first.

### Applying changes
- Apply with `db push` only after explicit approval and after reviewing the preview.

## Production cautions
- Avoid running `migrate dev` against production databases.
- Prefer reviewing migration SQL in code review.
- Always confirm backup/snapshot readiness for destructive changes.
