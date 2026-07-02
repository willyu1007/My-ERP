# 04 - Verification

## Planned checks
| Check | Result |
|---|---|
| Template typecheck | pass |
| Template build | pass |
| Template subpath ESM import smoke | pass |
| Publish or local pack release check | published `@willyu1007/web-workbench@0.6.6` |
| `@my-erp/ui` typecheck | pass |
| `@my-erp/web` typecheck | pass |
| `pnpm lint` | pass |
| `@my-erp/web` build | pass |
| Root `@my-erp/ui` app-import scan | pass |
| Bundle/chunk regression inspection | pass; ledger client route chunk is 1178 bytes and does not contain settings/queue/record/hub/app-shell/sidebar matches |
| Browser route smoke | pass |

## Results
- 2026-06-26: Verification plan created before implementation.
- 2026-06-26: `corepack pnpm --dir /Volumes/DataDisk/Project/My-Workflow-Base/templates/web-workbench typecheck`
  passed.
- 2026-06-26: `corepack pnpm --dir /Volumes/DataDisk/Project/My-Workflow-Base/templates/web-workbench build`
  passed after making the package build script single-layer.
- 2026-06-26: Node ESM import smoke passed for `primitives`, `shell`, `feedback`, `list`, `insight`, `settings`,
  `hub`, `queue`, `record`, and `contracts`.
- 2026-06-26: Published `@willyu1007/web-workbench@0.6.6` to GitHub Packages.
- 2026-06-26: `corepack pnpm --filter @my-erp/ui typecheck`, `corepack pnpm --filter @my-erp/web typecheck`,
  `corepack pnpm lint`, and `corepack pnpm --filter @my-erp/web build` passed.
- 2026-06-26: Root app import scan found no `from '@my-erp/ui'` usage under `apps` or `packages`; only the legacy
  compatibility barrel remains at `packages/ui/src/index.ts`.
- 2026-06-26: Latest production ledger client route chunk:
  `apps/web/.next/static/chunks/app/(workbench)/finance/ledger/page-a4a0152cc164d411.js`, 1178 bytes, with no
  matches for `settings|queue|record|hub|app-shell|sidebar|SettingsFrame|Queue|Record|Hub|AppShell|Sidebar`.
- 2026-06-26: Cleaned `apps/web/.next`, started a temporary dev server on `http://localhost:3211`, and used
  headless Chrome to switch via sidebar links:
  `/finance/reports` 1114ms, `/finance/payments` 875ms, `/finance/daily-accounting` 381ms, and
  `/finance/ledger` 104ms. All reached `.wb-scene`; captured browser console had no import errors.
- 2026-06-26: Re-ran `corepack pnpm --filter @my-erp/web build` after the dev smoke so `.next` ends as a production
  build artifact; the ledger chunk inspection remained clean.
- 2026-06-26: `git diff --check` passed for My-ERP and My-Workflow-Base.
- 2026-06-27: Follow-up check found the ERP workspace had reverted to `@willyu1007/web-workbench@0.6.5`. Restored
  all dependency declarations to `^0.6.6`, ran `corepack pnpm install --ignore-scripts`, cleared `apps/web/.next`,
  and rebuilt with `corepack pnpm --filter @my-erp/web build`.
- 2026-06-27: Post-fix scans passed: no `web-workbench@0.6.5`, no `@willyu1007/web-workbench/dist/index.js`, and
  no root `from '@my-erp/ui'` app imports in generated chunks/source scans.
- 2026-06-27: Clean production route chunks after rebuild: ledger 1693 bytes, payments 25306 bytes, contracts 5981
  bytes, period-close 9562 bytes.
- 2026-06-27: `corepack pnpm --filter @my-erp/ui typecheck` and `corepack pnpm --filter @my-erp/web typecheck`
  passed after restoring `0.6.6`.
- 2026-06-27: Rebuilt `pnpm-lock.yaml` to keep only the `0.6.5` -> `0.6.6` workbench delta, then verified with
  `corepack pnpm install --frozen-lockfile --ignore-scripts`, `corepack pnpm --filter @my-erp/ui typecheck`,
  `corepack pnpm --filter @my-erp/web typecheck`, `corepack pnpm lint`, and a clean
  `corepack pnpm --filter @my-erp/web build`.
