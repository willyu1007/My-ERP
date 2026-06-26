# Post Verify

Because the migration was not applied to a target database, DB post-apply verification was not run.

Completed local checks:

- Prisma schema validation passed.
- Prisma Client generation passed.
- Repository DB context contract refreshed.
- Full workspace typecheck passed.
- Targeted tests were added for draft payload parsing and status-transition payload clearing.

Required after approval and DB apply:

```sh
PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm exec prisma migrate status --schema prisma/schema.prisma
PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm typecheck
```
