# 04 - Verification

## Documentation verification

| Check | Command | Expected |
| --- | --- | --- |
| Project governance sync | `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` | Registers T-003 and regenerates derived views |
| Project governance lint | `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` | No blocking errors |
| Status sanity | inspect `.ai/project/main/task-index.md` | T-003 appears with `dev-docs/active/workflow-task-kernel-finance-pipeline` |

## Runs

| Date | Command | Outcome |
| --- | --- | --- |
| 2026-06-12 | `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` | Passed. Registered T-003 and regenerated registry/dashboard/feature-map/task-index. |
| 2026-06-12 | `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` | Passed with one pre-existing warning: T-001 is done but its acceptance criteria heading is not recognized by the lint parser. |
| 2026-06-12 | `python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py doctor --root . --env dev --runtime-target local --workload api --out dev-docs/active/workflow-task-kernel-finance-pipeline/artifacts/env-local/00-prereq-check.md` | Passed with a local-only preflight warning: no cloud credential signals detected. |
| 2026-06-12 | `python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py compile --root . --env dev --runtime-target local --workload api --out dev-docs/active/workflow-task-kernel-finance-pipeline/artifacts/env-local/02-config-compile-report.md` | Passed. Generated `.env.local` and redacted `docs/context/env/effective-dev.json`. |
| 2026-06-12 | `bash .codex/scripts/run-local-dev.sh` | Passed. Applied Prisma migrations, built workspace packages, started API on `http://localhost:8000` and Web on `http://localhost:3200`. |
| 2026-06-12 | `curl -sS http://localhost:8000/health` | Passed. API returned `{"status":"ok","service":"my-erp-api",...}`. |
| 2026-06-12 | `curl -I -sS http://localhost:3200` | Passed. Web returned `HTTP/1.1 200 OK`. |
| 2026-06-13 | `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` | Passed with one existing warning: T-001 is done but its acceptance criteria heading is not recognized by the lint parser. |
| 2026-06-13 | `pnpm typecheck` | Passed. All workspace package/app typechecks completed successfully. |
| 2026-06-13 | `pnpm test` | Passed. 17 test files and 78 tests passed. |
| 2026-06-13 | `npx prisma format --schema prisma/schema.prisma` | Passed. Prisma schema formatted. |
| 2026-06-13 | `npx prisma validate --schema prisma/schema.prisma` | Passed. Prisma schema is valid. |
| 2026-06-13 | `pnpm db:generate` | Passed. Prisma Client generated from the updated repo schema. |
| 2026-06-13 | `node .ai/scripts/ctl-api-index.mjs generate --touch` | Passed. Generated API index with 28 endpoints and touched context registry. |
| 2026-06-13 | `node .ai/scripts/ctl-db-ssot.mjs sync-to-context` | Passed. Refreshed `docs/context/db/schema.json` from `prisma/schema.prisma`; no migration was applied to the current dev DB. |
| 2026-06-13 | `pnpm typecheck` | Passed after implementation. All workspace package/app typechecks completed successfully. |
| 2026-06-13 | `pnpm test` | Passed after implementation. 19 test files and 89 tests passed, including T-003 WorkItem RLS/dedupe/append-only tests. |
| 2026-06-13 | `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` | Passed with one existing warning: T-001 is done but its acceptance criteria heading is not recognized by the lint parser. |
| 2026-06-13 | `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict` | Passed. Context layer verification passed; built-in validator used because Ajv is not installed. |
| 2026-06-13 | `pnpm typecheck` | Passed after implementation review fixes. All workspace package/app typechecks completed successfully. |
| 2026-06-13 | `pnpm test` | Passed after implementation review fixes. 20 test files and 97 tests passed, including new WorkItem visibility/action rule tests. |
| 2026-06-13 | `pnpm db:generate` | Passed after FK/schema adjustments. Prisma Client regenerated from the updated repo schema. |
| 2026-06-13 | `node .ai/scripts/ctl-api-index.mjs generate --touch` | Passed after API pagination/action contract updates. API index remains at 28 endpoints. |
| 2026-06-13 | `node .ai/scripts/ctl-db-ssot.mjs sync-to-context` | Passed after schema adjustment. Refreshed `docs/context/db/schema.json`; no migration was applied to the current dev DB. |
| 2026-06-13 | `pnpm db:deploy` | Passed after user approved DB execution. Applied `20260613090000_t003_work_item_kernel` to local dev PostgreSQL `myerp` at `localhost:5433`. |
| 2026-06-13 | `npx prisma migrate status --schema prisma/schema.prisma` | Passed after DB apply. Database schema is up to date. |
| 2026-06-13 | Prisma table existence check | Passed. Confirmed `work_item`, `work_item_event`, and `outbox_event` exist in local dev DB. |
| 2026-06-13 | Prisma migration finished check | Passed. `_prisma_migrations` has `20260613090000_t003_work_item_kernel` with `finished_at IS NOT NULL`. |
| 2026-06-13 | `curl -sS --max-time 3 http://localhost:8000/health` | Not run successfully because the local API service was not running on port 8000 at verification time. DB apply itself succeeded. |
| 2026-06-13 | `pnpm --filter "./packages/*" build` | Passed before real E2E smoke. Refreshed package dist used by the API dev runtime. |
| 2026-06-13 | `pnpm --filter @my-erp/api dev` | Passed. Started API on `http://localhost:8000`; web port 3200 was already occupied by an existing Next dev process, so the smoke reused only API. |
| 2026-06-13 | `set -a; source .env; set +a; node dev-docs/active/workflow-task-kernel-finance-pipeline/artifacts/e2e/20260613-t003-smoke/run-smoke.mjs` | Passed real E2E smoke against local API and local Postgres. Created org/members, created ledger, seeded accounts, created/submitted balanced voucher, verified WorkItem queue/action negatives, claimed/completed task, posted source voucher, and verified `work_item_event` + metadata-only `outbox_event` persistence. Result: `dev-docs/active/workflow-task-kernel-finance-pipeline/artifacts/e2e/20260613-t003-smoke/result.json`. |
| 2026-06-13 | `pnpm exec prettier --write apps/api/src/work-items/work-items.controller.ts dev-docs/active/workflow-task-kernel-finance-pipeline/artifacts/e2e/20260613-t003-smoke/run-smoke.mjs dev-docs/active/workflow-task-kernel-finance-pipeline/artifacts/e2e/20260613-t003-smoke/result.json` | Passed. Controller unchanged by formatter; artifact files are ignored by repo formatting config. |
| 2026-06-13 | `pnpm typecheck` | Passed after E2E smoke/status-code fix. All workspace package/app typechecks completed successfully. |
| 2026-06-13 | `pnpm test` | Passed after E2E smoke/status-code fix. 20 test files and 97 tests passed. |

## Remaining verification for future slices

Expected checks:
- `pnpm ui:governance` for UI changes
- DB migration application only after explicit approval: `pnpm db:migrate` or `pnpm db:deploy`
- Context verification after context artifact changes: `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`

## Manual smoke checks
- Role queue pages show only actions available to the current role.
- Voucher actions still enforce existing service-layer and DB invariants.
- My-Chat outbound event payload examples contain metadata only.
- ERP core workflow remains usable if notification delivery is unavailable.
