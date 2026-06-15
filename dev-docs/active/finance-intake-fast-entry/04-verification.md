# 04 — Verification

## 2026-06-15 — S1a + S1b

Commands and outcomes:

| Check | Command | Result |
|---|---|---|
| Codegen | `pnpm --filter @my-erp/api-client codegen` (openapi-typescript 7.13.0) | `src/generated/schema.ts` generated from `docs/context/api/openapi.yaml` |
| api-client typecheck | `pnpm --filter @my-erp/api-client typecheck` | pass |
| api-client build | `pnpm --filter @my-erp/api-client build` | pass; `dist/index.js` + `dist/generated/schema.js` emitted |
| Full typecheck | `pnpm typecheck` | pass (9 projects, incl. `apps/web` consuming the client) |
| Tests | `pnpm test` | pass — 20 files / 97 tests (no regression vs the 2026-06-15 baseline) |
| Governance lint | `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` | pass (existing non-blocking T-001 warning only) |

## 2026-06-15 — S1c (fast-entry grid)

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | pass (incl. `apps/web` with the new grid + server actions) |
| UI governance | `pnpm ui:governance` | pass — validate OK; guard OK, 29 feature files token-only (no inline styles / hex) |
| Tests | `pnpm test` | pass — 20 files / 97 tests (no regression) |
| Runtime smoke | `pnpm --filter @my-erp/web dev` → `GET /finance/daily-accounting` | HTTP 200; SSR HTML contains 快速制单 / 科目 / 借方 / 贷方 / 一键配平 / 保存草稿 / 提交; compiled clean, no errors/warnings in dev log |

## 2026-06-15 — S2 (Intake/Attachment schema + RLS)

| Check | Command | Result |
|---|---|---|
| Prisma validate | `pnpm prisma validate` | schema valid |
| DB context sync | `node .ai/scripts/ctl-db-ssot.mjs sync-to-context` | `docs/context/db/schema.json` updated |
| Context verify | `ctl-context.mjs verify --strict` | passed |
| Typecheck | `pnpm typecheck` | pass (9 projects) |
| Tests | `pnpm test` | pass — **21 files / 102 tests** (+5: `intake-rls.integration.test.ts`) |

`intake-rls` covers: org+ledger isolation, no rows without a scope, WITH CHECK blocks cross-ledger
writes, attachment store + link + ledger isolation, and the version-guarded one-shot draft transition.
The migration applies cleanly to a fresh test DB via the shared `test-pg` harness.

## 2026-06-15 — S3 (contracts + posting-template + seams + CASL)

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | pass (9 projects) |
| Tests | `pnpm test` | pass — **23 files / 108 tests** (+6: `contracts/intake.test.ts`, `finance-domain/posting-template.test.ts`) |

`intake.test` proves the two-schema boundary; `posting-template.test` covers bank-slip inflow/outflow
mapping (bank line inferred, contra left open → `complete=false`) and unmatched/amount-less → null. The
existing `ability.test` still passes with the added `Intake` subject/grants.

## 2026-06-15 — S4 (intake API + seam adapters + outbox)

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | pass (incl. api-client regen from the updated OpenAPI) |
| Tests | `pnpm test` | pass — **25 files / 111 tests** (+3: `mock-extractor`, `intake-outbox`) |
| API index | `ctl-api-index.mjs generate` + `verify` | 33 endpoints; up-to-date |
| OpenAPI quality | `ctl-openapi-quality.mjs verify` | passed |
| Runtime smoke | `pnpm --filter @my-erp/api dev` + curl | Nest starts clean; `/health` 200; `GET`/`POST /v1/intakes` → 401 without a token (route + guard wired) |

## 2026-06-15 — S5 backend (auto-draft pipeline)

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | pass |
| Tests | `pnpm test` | pass — **27 files / 115 tests** (+4: `intakes/draft.test`, `db/intake-draft.integration`) |
| API index / quality | `ctl-api-index.mjs generate` + `ctl-openapi-quality.mjs verify` | regenerated; quality passed |

`draft.test` covers flatten/auto-draft/confidence-routing; `intake-draft.integration` proves the
chain (extracted intake → voucher draft + `voucher.confirm` work item, version-guarded one-shot) under
org+ledger RLS.

## Not yet verified (explicit)
- Interactive keyboard flow + the web confirm/capture surface (S5b) — structural only until a seed exists.
- Live `/v1` end-to-end (capture → extract → auto-draft → confirm/submit) — pending a running API + seed.
- **Live `/v1` read/write round-trip** (data-source cutover against a running API): NOT verified in
  this session. It requires a running `apps/api` + Postgres + seeded org/ledger/membership/accounts
  and an `API_DEV_TOKEN`. The wiring typechecks and the fixture fallback keeps the app green without
  the backend; the live round-trip (list/create/submit a voucher via `/v1`) is the next operator
  check.
- `pnpm ui:governance` — no UI changed in S1a/S1b (data-source layer only); will run with S1c.
