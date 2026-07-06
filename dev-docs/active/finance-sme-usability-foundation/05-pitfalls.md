# 05 — Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- Do not turn BusinessPartner into a replacement identity system; it is finance master data.
- Do not model each customer/supplier/employee as a chart-of-accounts child by default.
- Do not make task state the accounting source of truth; WorkItem coordinates, PaymentDoc/Voucher remain source entities.
- Do not remove historical counterparty snapshots when introducing partner links.
- Do not let native browser autocomplete compete with the ERP-owned account picker.
- Do not extend the hardcoded cash-account code list (`isCashAccountCode`, `1001/1002/1012`); Phase 2 replaces it with tree/metadata-based identification and later phases must reuse that rule.
- Do not render partner display names from live Logto profile data; names are org-entered partner master data with snapshot semantics (D10).
- Do not give `FundConsumption` any ledger columns, and do not let the consume path create a voucher — the "no duplicate ledger effect" invariant is STRUCTURAL (the row has zero ledger columns, so it physically cannot post). Keep consume touching only `fund_consumption` + WorkItem + outbox + audit.
- Do not spawn fund tasks for settlement vouchers. They post directly via `PaymentsService.confirm` (`setVoucherStatusTx('posted')`), never through `postVoucherReviewTx` (which requires status `pending`), so they never reach the spawn hook — plus the `isSettlementVoucherTx` guard is a second net. Route new voucher-post paths through `postVoucherReviewTx` OR replicate both guards.

## Pitfall log (append-only)

### 2026-07-06 - The org-scope trap RECURRED in vouchers reverse() — a documented pitfall repeated
- Symptom: adversarial review of the Phase 4 commit found (3 independent angles, CONFIRMED) that `reverse()` voided the fund rows but never canceled the paired `fund.consume` WorkItems on a real (RLS-enforced) run.
- Context: T-012 Phase 4; the same org-vs-ledger scope trap already recorded below (2026-07-06 WorkItem is org-scoped).
- Why: `vouchers.controller.ts` `reverse()` wrapped its whole body in `withLedgerScope(ledgerBookId)` (sets only `app.current_ledger`). The new fund cleanup calls `cancelActiveWorkItemsForSourceTx` + `appendWorkItemOutboxEventTx`, which hit the ORG-scoped `work_item`/`outbox_event` tables. With `app.current_org` unset, the RLS `org_id = current_org` clause is never true, so `findMany` returned [] and the cancel loop no-oped — silently, no error. `voidFundConsumptionsForVoucherTx` succeeded because `fund_consumption` is ledger-scoped.
- Why it slipped through: (1) the integration test exercised the db helpers directly under `withScope(ORG, LB)` (both GUCs set), masking the controller's ledger-only path; (2) the dev DB connects as the table owner, so RLS is OFF in the live smoke — a scope bug is invisible there. Neither verification layer touched the production `withLedgerScope` controller path under the app role.
- Fix: `withScope(identity.orgId, ledgerBookId, ...)` in `reverse()` (`identity` is already a route param); added a regression test that drives the REAL `VouchersController().reverse(...)` under the app role (RLS on) and asserts the task flips to `canceled`.
- Prevention: any handler that touches `work_item`/`outbox`/`membership` MUST use `withScope`/`withOrgScope`, even if its "primary" entity is ledger-scoped. When a test needs to prove RLS-sensitive behavior, drive the real controller/service under the app role — do NOT call the db helpers under a hand-set `withScope(ORG, LB)`, which sets both GUCs and hides scope bugs. Live smoke on the dev DB cannot catch RLS scope bugs (owner bypasses RLS).
- References: `apps/api/src/vouchers/vouchers.controller.ts` reverse(); `apps/api/src/fund-consumptions/fund-consumptions.integration.test.ts` (reverse CONTROLLER path test).

### 2026-07-06 - WorkItem action route is /actions/:actionKey (path param), not /act
- Symptom: live smoke got `Cannot POST /v1/work-items/:id/act` (404) trying to complete a `fund.consume` task via the workbench path.
- Context: T-012 Phase 4 live `/v1` smoke.
- Why: the work-items controller exposes `@Post(':id/actions/:actionKey')` — the action is a URL path segment and the body is just `{expectedVersion}`; there is no `/act` route and the action is not a body field.
- Fix: `POST /v1/work-items/{id}/actions/complete` with body `{"expectedVersion":N}`.
- Prevention: check the controller route shape before scripting a work-item action; the REST `POST /v1/fund-consumptions/:id/consume` path is the direct alternative.
- References: `apps/api/src/work-items/work-items.controller.ts`.

### 2026-07-06 - WorkItem is org-scoped; assert it under withScope, not withLedgerScope
- Symptom: a payments integration test asserting a `payment.enrich` WorkItem got `undefined` — `listWorkItemsTx` returned nothing under RLS.
- Context: T-012 Phase 3 service test, run as the app role (RLS enforced).
- Why: `work_item` is ORG-scoped (RLS by `app.current_org`). The query ran inside `withLedgerScope` (sets only `app.current_ledger`), so the RLS `app.current_org` GUC was empty → zero rows.
- Fix: query work items inside `withScope(orgId, ledgerBookId, ...)` (sets both GUCs). Ledger-scoped rows (payment_doc, journal_voucher) are fine under `withLedgerScope`.
- Prevention: match the scope helper to the table's RLS axis — org-scoped (work_item/outbox/membership) → `withScope`/`withOrgScope`; ledger-scoped → `withLedgerScope`.
- References: `apps/api/src/payments/payments.integration.test.ts`.


### 2026-07-05 - dev API connects as the table owner, so RLS is OFF in dev
- Symptom: `/v1/accounts` returned rows from TWO ledgers (duplicate codes with conflicting isLeaf), which surfaced visibly once the progressive picker rendered the whole chart.
- Context: T-012 Phase 2 browser verification against the long-lived dev DB.
- Why: the dev `DATABASE_URL` user owns the tables and Postgres owners bypass RLS (documented in `scripts/dev-seed.mjs`); a leftover ledger from an old e2e session leaked into every unscoped-looking list. Production/test paths use the app role where RLS is enforced (covered by integration tests).
- Fix / workaround: reset the dev DB (drop schema + `pnpm db:deploy` + `pnpm dev:seed`) before browser walkthroughs.
- Prevention: treat cross-ledger rows in dev UI as stale-dev-data first, not as an RLS bug; keep using a fresh DB for live verification (see also the stale-dist rule).
- References: `scripts/dev-seed.mjs` header comment; T-012 04-verification 2026-07-05 Phase 2 log.

### 2026-07-05 - vitest filter must run from the repo root
- Symptom: `pnpm --filter @my-erp/db test -- --run <file>` and running vitest from `packages/db` both exit with "No test files found".
- Context: T-012 Phase 1, running the new business-partner integration test.
- Why: the vitest config lives at the repo root with include pattern `{apps,packages}/**/*.{test,spec}.ts`; from a package directory the relative pattern matches nothing.
- Fix / workaround: run `pnpm vitest run <repo-relative-path>` from the repo root.
- Prevention: always launch targeted vitest runs from the root with repo-relative paths.
- References: `vitest.config.ts`

### 2026-07-04 - Planning baseline
- Symptom: N/A.
- Context: Task opened before implementation to preserve discussion and align roadmap decisions.
- What we tried: N/A.
- Why it failed (or current hypothesis): N/A.
- Fix / workaround (if any): N/A.
- Prevention (how to avoid repeating it): Keep this file append-only and add resolved failures during implementation.
- References (paths/commands/log keywords): `dev-docs/active/finance-sme-usability-foundation/roadmap.md`
