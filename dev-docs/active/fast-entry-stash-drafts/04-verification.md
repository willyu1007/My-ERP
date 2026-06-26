# Verification

Verification will be appended during implementation.

Expected checks:

- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/api-client codegen`
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/web typecheck`
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/api typecheck`
- `git diff --check`
- Browser smoke for `暂存` label and button enabled state.

DB apply is not run without explicit approval.

## 2026-06-26 Runs

- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm exec prisma format --schema prisma/schema.prisma`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm exec prisma validate --schema prisma/schema.prisma`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/api-client codegen`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm db:generate`
  - Result: pass; local Prisma Client regenerated from repo schema.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/api typecheck`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/web typecheck`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm typecheck`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm test`
  - Result: pass; 40 files / 156 tests before hardening, then targeted tests were added.
- `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
  - Result: pass; `docs/context/db/schema.json` refreshed.
- Browser smoke with Playwright + system Chrome
  - Result: blocked; local Chrome headless process was terminated by the OS before page interaction. Static checks passed; manual browser verification still recommended after DB migration is applied.

## 2026-06-26 Hardening Runs

- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/api-client codegen`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/api typecheck`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/db typecheck`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm --filter @my-erp/web typecheck`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm typecheck`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm exec prisma validate --schema prisma/schema.prisma`
  - Result: pass.
- `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm test`
  - Result: pass; 41 files / 160 tests.
- `git diff --check`
  - Result: pass.
