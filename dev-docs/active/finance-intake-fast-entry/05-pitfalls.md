# 05 — Pitfalls (resolved lessons)

## do-not-repeat (scan first)
- Rebuild workspace packages before running the API in dev — typecheck/tests use TS source, runtime uses `dist`.
- The dev API connects as the Postgres owner → RLS is bypassed on the dev box; don't verify isolation there.
- RLS bypass + a shared/polluted dev DB collides accounts across ledgers (`enrichLines` picked a non-leaf `1002`); use a fresh DB for live demos.
- After editing `docs/context/api/openapi.yaml` + regenerating api-index, run `ctl-context touch` or strict context verify fails.

## RLS bypass + polluted dev DB → cross-ledger account collision
- Symptom: confirming a capture-drafted voucher failed PATCH with `account 1002 is not a leaf account`,
  even though the seed created `1002` as a leaf in the active ledger.
- Root cause: the shared `myerp` dev DB already held a full 小企业 chart (where `1002 银行存款` has
  sub-accounts → non-leaf) in *another* ledger. Because RLS is bypassed for the DB owner,
  `listAccountsTx` returned accounts from **all** ledgers, and `new Map(byCode)` collided on code
  `1002`, keeping the non-leaf one.
- Fix: run the live demo against a **fresh database** (one ledger → no collision), or connect the dev
  API as a non-owner role so RLS isolates per ledger. The S5b confirm flow passed on a fresh DB.
- Prevention: don't reuse a polluted shared DB for capture demos; the dev-seed assumes a single-ledger DB.

## Stale `dist` makes new exports `undefined` at runtime
- Symptom: live API threw `TypeError: Cannot read properties of undefined (reading 'safeParse')` at
  `parseCapture` — `IntakeKindSchema` (a new `@my-erp/contracts` export) was `undefined`.
- Root cause: workspace packages are consumed via their built `dist` (`main: dist/index.js`), but
  `pnpm typecheck` / vitest read the TS **source**. So a new export passes typecheck/tests yet is
  missing at runtime until the package is rebuilt. Running `pnpm --filter @my-erp/api dev` directly
  skips the package build that `pnpm dev` does first.
- Fix: `pnpm --filter "./packages/*" build` before starting the API (or use `pnpm dev`).
- Prevention: when verifying a running app after editing a workspace package, rebuild packages first.

## RLS is bypassed for the DB owner on the dev box
- The dev `DATABASE_URL` connects as `myerp` (the docker Postgres owner). Tables use `ENABLE ROW
  LEVEL SECURITY` (not `FORCE`), so the owner **bypasses** RLS — cross-ledger rows are visible and
  scope GUCs become advisory. This is fine for a single-tenant dev demo, but do NOT use the dev box
  to verify tenant isolation. RLS is enforced via the non-owner app role and covered by the
  `*-rls.integration.test.ts` suites.

## Context checksums lag after editing the OpenAPI contract
- Editing `docs/context/api/openapi.yaml` and regenerating `api-index` updates those files but not the
  recorded checksums in `docs/context/registry.json`, so `ctl-context.mjs verify --strict` fails with
  "Checksum mismatch for api-openapi / api-index".
- Fix: `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch` (then re-verify).
