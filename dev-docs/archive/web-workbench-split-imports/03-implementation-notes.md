# 03 - Implementation Notes

## 2026-06-26 Task package creation
- Created T-011 for the web workbench split-import performance fix.
- Confirmed this is a frontend/package-boundary change only.
- Decided to preserve `@my-erp/ui` root compatibility while removing root imports from `apps/web`.
- Release target is `@willyu1007/web-workbench@0.6.6`; if GitHub Packages credentials are unavailable, verification
  stops at local package checks and records the publish blocker.

## 2026-06-26 Implementation
- Published `@willyu1007/web-workbench@0.6.6` with grouped public entries.
- Added matching grouped entries to `@my-erp/ui`: `contracts`, `primitives`, `shell`, `feedback`, `list`,
  `insight`, `settings`, `hub`, `queue`, and `record`.
- Migrated `apps/web` imports away from the `@my-erp/ui` root entry; the root entry remains only in
  `packages/ui/src/index.ts` for compatibility.
- Added `apps/web/src/app/(workbench)/loading.tsx` as the immediate fallback for first-time workbench route loads.
- Local install note: the Codex runtime's default pnpm 11 intercepted bare nested `pnpm` calls in postinstall. The
  workspace was restored with `corepack pnpm install --ignore-scripts` followed by explicit api-client codegen.

## 2026-06-27 Dependency Reversion Check
- Rechecked after the UI still felt slow and found the local ERP dependency state had reverted to
  `@willyu1007/web-workbench@0.6.5` in `package.json`, `apps/web/package.json`, `packages/ui/package.json`,
  `pnpm-lock.yaml`, and node_modules.
- Restored all three dependency declarations to `^0.6.6`, ran `corepack pnpm install --ignore-scripts`, cleared
  `apps/web/.next`, and rebuilt the web app.
- Verified the regenerated `.next` output no longer references `web-workbench@0.6.5`, the package root barrel, or
  private `dist/components` paths.
- Rebuilt `pnpm-lock.yaml` from the pre-existing lockfile baseline with only the `web-workbench` entries moved from
  `0.6.5` to `0.6.6`; this removed unrelated patch-level dependency drift from the earlier install.
