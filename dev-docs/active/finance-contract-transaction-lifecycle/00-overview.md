# 00 — Overview: Finance contract and transaction lifecycle

## Problem statement
My-ERP today is GL-centric: vouchers, ledgers, and (later) cashier documents each stand alone, with
no spine that ties the documents of one economic relationship together over time. The user wants a
**transaction-lifecycle (交易生命周期)** view, organized **contract-first (以合同为主视角)**: a deal
captured as a `Contract` (合同) that anchors its related vouchers, receipts/payments, attachments, and
work items into one timeline, and that doubles as an auxiliary-accounting dimension.

This task was **split from T-004** at the 2026-06-14 top-level alignment (decision β) to keep T-004
focused on voucher fast-entry + capture intake. The contract aggregate is defined here as a
**finance-side business object**, explicitly NOT a sales/order/inventory module (stays in v1 finance
scope).

## Status
- State: done
- Closed 2026-06-18 at **MVP scope** (C1–C4): `Contract` aggregate + `contractId` dimension on
  vouchers/payments + a read-only timeline (以合同为主视角), entry-time linking, simple `draft|active|closed`
  status. Verified by unit + RLS + service integration tests (155 total) + a fresh-DB `/v1` e2e + a browser
  walkthrough — see `04`. Deferred (D2 lifecycle stages, receivable/payable forecast, `BusinessPartner`,
  contract attachments, work-items-in-timeline) are listed in `04`.
- Decisions aligned 2026-06-17 (MVP-first · free-text counterparty · entry-time linking — see `01-plan`).
  M2 cashier (T-007) is done, so payments join the timeline.
- **C1 done (2026-06-17)**: `Contract` model + migration (ledger RLS) + `JournalVoucher.contractId`
  (+ index) + Contract repos + `listVouchers/PaymentDocsByContractTx` (timeline dimension) + RLS test.
  QA: found + fixed a bug — `createReversalVoucherTx` dropped `contractId` (红冲 fell off the timeline).
- **C2 done (2026-06-18)**: contracts service + `/v1/contracts` (CRUD, auto code `HT-{fiscalYear}-{NNN}`,
  version-guarded, audit) + `contractId` threaded through voucher create/edit + payment create; OpenAPI +
  api-client. Live-verified 7/7.
- **C3 done (2026-06-18)**: `buildContractTimeline` (pure, contract anchored first) + `GET
  /v1/contracts/{id}/timeline` + contract list/create + detail+timeline pages + draft→执行中→归档 status
  actions + 合同 picker on the voucher fast-entry & payment form (entry-time linking) + nav. Browser-verified
  (a contract anchors a voucher + payment in one timeline). Next: **C4** — contracts service integration
  test + fresh-DB e2e, then close the T-005 MVP.
- Design is captured here and in `roadmap.md` / `02-architecture.md`; reuses T-004's intake pipeline
  for contract scans (deferred).

## Goal
- A thin, finance-side `Contract` aggregate: entity, optional links from `JournalVoucher.contractId`
  (and later cashier documents), making the contract both an auxiliary-accounting dimension and the
  timeline anchor.
- A read-only **contract timeline** = contract events ∪ linked vouchers ∪ related work items
  (∪ receipts/payments once M2 exists), ordered by time.
- A minimal `BusinessPartner` (deferred out of T-004) so a contract and an extracted counterparty
  have a home.
- A contract lifecycle expressed via the established **D2 model** (code-first workflow topology +
  DB-configured policy) that spawns role work items per stage — never a hard-coded linear pipeline
  (honours DP26).

## Non-goals
- No sales/order/quote/fulfilment/pricing/inventory (would break v1 finance scope).
- No automatic disbursement (DP5).
- Do not write financial detail into My-Chat search/recommendation/forum storage (DP24).
- Do not replace the voucher / payment state machines; the contract coordinates, it does not own
  business state of the documents under it.

## Dependencies
- **T-004** (voucher fast-entry + capture intake): provides the intake pipeline reused for contract
  attachments and the `voucher.contractId` link target.
- **M2 cashier** (`CashAccount` / `Payment` / `Receipt`): the receivable/payable schedule and cash
  forecast become meaningful only once funds documents exist. Until then the timeline shows contract
  events + vouchers + work items.
- **T-003 work-item kernel**: lifecycle stage transitions reuse `WorkItem`/`WorkItemEvent`/outbox.

## High-level acceptance criteria (draft — refine when picked up)
- [ ] A `Contract` can be created (org + ledger scoped) and a `JournalVoucher` linked via
      `contractId`; existing vouchers are unaffected (nullable FK).
- [ ] The contract timeline renders linked vouchers + related work items in time order.
- [ ] `Contract`/`BusinessPartner` reads are org + ledger scoped (RLS); no financial detail crosses
      to My-Chat metadata.
- [ ] Lifecycle stages, when added, are code-first topology + DB policy and spawn role work items
      (no hard-coded pipeline).

## Pointers
- Parent / sibling: `dev-docs/active/finance-intake-fast-entry/` (T-004)
- Work-item kernel: `dev-docs/active/workflow-task-kernel-finance-pipeline/` (T-003)
- Requirements: `docs/project/overview/requirements.md` (辅助核算 DP14; role-workflow DP26)
- Root constraints: `AGENTS.md`
