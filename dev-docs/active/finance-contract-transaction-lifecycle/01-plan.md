# 01 — Plan: contract/transaction-lifecycle MVP slice (T-005)

## Aligned decisions (2026-06-17)
- **Scope = MVP** (roadmap C1–C3): `Contract` aggregate + `contractId` dimension on vouchers/payments +
  a read-only **timeline**. **Defer** the D2 lifecycle stages (roadmap C4) and receivable/payable +
  cash forecast (roadmap C5). Contract uses a **simple `status` field** (draft / active / closed).
- **Partner = free-text** `counterparty` on the contract (like `PaymentDoc`); **no `BusinessPartner`
  entity** this slice (往来 master is a later need).
- **Linking = entry-time**: a 合同 picker on the voucher fast-entry + the payment create form, so
  documents are linked as they are created and the timeline fills naturally.

Unblocked by T-007 (cashier done): `PaymentDoc.contractId` is already reserved, so payments join the
timeline in the MVP.

## Schema (ledger-scoped, RLS like `payment_doc`)
`Contract`: id, ledgerBookId, code (`HT-{fiscalYear}-{NNN}`, unique per ledger), title, type
(sales|purchase|service|other — a finance label, **not** an order/fulfilment driver), counterparty
(text), amount (Decimal 18,2, nullable), currency (default CNY), status (draft|active|closed),
startDate?/endDate?, summary?, createdBy, createdAt, updatedAt, version. Unique (ledgerBookId, code).
RLS: ledger scope select/insert/update; no delete.

Link columns (nullable, no business-state ownership): **`JournalVoucher.contractId`** (new) +
`PaymentDoc.contractId` (already exists). Both nullable — existing rows unaffected.

## Timeline (read model — C3)
`buildContractTimeline(events, vouchers, payments, workItems)` (pure, `finance-domain`): merge the
contract's linked `JournalVoucher`s + `PaymentDoc`s + related `WorkItem`s (+ contract created/updated
events) into one time-ordered list. A read model over authoritative document state — never a copy.

## API / web
- `/v1/contracts` (list/create/get/update) + `GET /v1/contracts/{id}/timeline`. `contractId` flows in
  via voucher create + payment create.
- Web: `/finance/contracts` (list + create), `/finance/contracts/[id]` (detail + timeline). 合同 picker
  added to the voucher fast-entry + payment form. Nav: 合同 under 工作流 (or 查询).

## Phases
- **C1 (this turn) — schema + repos**: `Contract` model + migration (RLS) + `JournalVoucher.contractId`
  + Contract repos (create/get/list/update version-guarded/count) + voucher/payment `contractId`
  setters + a Contract RLS integration test. Verified (prisma validate / typecheck / test).
- **C2 — contract API + dimension**: contracts service + `/v1/contracts` CRUD; thread `contractId`
  through voucher + payment create; OpenAPI + api-client.
- **C3 — timeline + web**: `buildContractTimeline` (+ unit test) + `/v1/contracts/{id}/timeline`;
  contract list/detail+timeline pages; 合同 picker on the two create forms; nav.
- **C4 — verify**: contracts service integration test (CRUD + dimension + timeline ordering) +
  fresh-DB e2e + browser walkthrough.

## Non-goals (MVP)
D2 lifecycle stages + role work items per stage; receivable/payable schedule + cash forecast;
`BusinessPartner` master; sales/order/inventory/fulfilment; auto-disbursement; My-Chat financial detail.
