# 02 — Architecture (2026-06-14 sketch — partly superseded by the MVP)

This captures the contract design produced during the 2026-06-14 discussion and split out of T-004.

> **⚠️ Superseded where it conflicts with `01-plan.md` (MVP, 2026-06-17 decisions).** The MVP shipped
> (C1–C3) deliberately diverges from this sketch: **Contract is ledger-scoped only** (no `orgId` on the
> row), **no `BusinessPartner` entity** — the contract stores a **free-text `counterparty`** — and the
> timeline renders **contract event ∪ vouchers ∪ payments** (work items deferred). The D2 lifecycle stages
> below are also deferred (MVP uses a simple `draft|active|closed` status). Read `01-plan.md` for the
> as-built design; the sections below are the original, broader vision.

## Position in the layering
- `Contract` and `BusinessPartner` are finance-side aggregates owned by the finance module.
- The contract coordinates documents; it does not own their business state. Vouchers (and later
  cashier funds documents) keep their own state machines.
- Lifecycle stage transitions reuse the T-003 work-item kernel and metadata-only outbox.
- Contract attachments reuse the T-004 intake / `ObjectStore` pipeline.

## Entities (minimum data models)

### Contract (合同) — finance-side aggregate (thin first cut)
- `id` uuid; `orgId` uuid (req); `ledgerBookId` uuid (req — ledger-bound).
- `code` string (unique per ledger); `title`.
- `type` string — finance classification only (sales / purchase / service label; NOT an order /
  fulfilment driver).
- `partnerId` uuid nullable (FK → BusinessPartner).
- `amount` numeric(_, 2) nullable; `currency`.
- `status` string — simple field first cut; later replaced/augmented by the D2 lifecycle stage.
- `startDate` / `endDate` nullable.
- `createdBy`; `createdAt` / `updatedAt`.

Link: `JournalVoucher.contractId` nullable FK — makes the contract both an auxiliary-accounting
dimension and the timeline anchor. (Later: `Payment.contractId` / `Receipt.contractId`.)

### BusinessPartner (minimal — deferred out of T-004)
- `id` uuid; `orgId`; `name`; `kind` enum `customer` | `supplier` | `employee` | `other`;
  `createdBy`; `createdAt`. (Full master data — credit terms, tax id, bank info — deferred.)

## Dimension
- `contractId` on vouchers (and later funds documents) is the per-contract reporting key. This is the
  finance-scoped realization of "transaction lifecycle": grouping authoritative documents under one
  contract, not building a new order/fulfilment domain.

## Timeline (read model)
- A contract detail view renders a **timeline** = union of contract events, linked `JournalVoucher`s
  (via `contractId`), and related `WorkItem`s, ordered by time. Read-only first cut.
- Once M2 cashier entities exist, receipts/payments join the timeline; once reporting lands, the
  contract gets per-contract P&L / receivable aging / cash forecast.
- The timeline is a read model over authoritative document state — never a second copy of business
  state.

## Lifecycle (D2 model — not a hard-coded pipeline)
```text
draft → signed → in-execution → settling → closed     (illustrative; stage set varies by type)
```
- Topology is **code-first** (versioned TypeScript workflow definition in the finance module);
  org/ledger policy (who acts, thresholds, SLA, notifications) is **DB-configured** — the same D2
  model T-003 established.
- Each stage transition spawns role work items via the T-003 kernel (`WorkItem`/`WorkItemEvent`),
  with metadata-only outbox on stage changes. No monolithic linear pipeline (honours DP26).
- Contracts of different types (sales/purchase/service) register different stage sets through their
  workflow definitions.

## Boundaries / invariants
- Every `Contract`/`BusinessPartner` row carries `orgId` + `ledgerBookId`; reads are org + ledger
  scoped (RLS).
- No financial detail crosses to My-Chat metadata; outbox stays metadata-only (T-003 envelope).
- The contract never bypasses document-level SoD, balance, or no-silent-delete invariants.
- Stays finance-scoped: no pricing, inventory, fulfilment, or order management.

## Dependencies & sequencing
- After **T-004** (intake pipeline + `voucher.contractId` link target available from fast-entry).
- Receivable/payable + cash forecast wait for **M2 cashier** (`CashAccount`/`Payment`/`Receipt`).
- Lifecycle reuses **T-003** kernel.

## Open questions
- Stage set per contract type; whether a generic stage set with type-specific policy suffices.
- Receivable/payable schedule shape and how it feeds the reporting milestone.
- Whether contract `status` is replaced by, or coexists with, the D2 lifecycle stage.
