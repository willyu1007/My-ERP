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
- State: in-progress
- Decisions aligned 2026-06-17 (MVP-first · free-text counterparty · entry-time linking — see `01-plan`).
  M2 cashier (T-007) is done, so payments join the timeline and `PaymentDoc.contractId` is reserved.
- **C1 done (2026-06-17)**: `Contract` model + migration (ledger RLS) + `JournalVoucher.contractId`
  (+ index) + Contract repos (CRUD, version-guarded update, count) + `listVouchers/PaymentDocsByContractTx`
  (the timeline dimension) + a Contract RLS integration test (isolation, optimistic update, contractId
  linkage). Next: **C2** contract API + thread `contractId` through voucher/payment create.
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
