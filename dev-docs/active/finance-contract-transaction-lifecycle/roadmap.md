# Roadmap — Finance contract and transaction lifecycle

## Goal
Provide a finance-side `Contract` (合同) aggregate as the transaction-lifecycle spine: the documents
of one economic relationship (vouchers now; receipts/payments later) roll up to a contract that has a
timeline and serves as an auxiliary-accounting dimension. Deliver a contract-first (以合同为主视角)
view without expanding into a sales/order/inventory module.

## Input trace
- User goal #4 (2026-06-14 discussion): manage the transaction lifecycle with the contract as the
  primary lens.
- Top-level decision β (2026-06-14): the contract aggregate is a **finance-side business object**
  (auxiliary dimension + document/work-item timeline), split out of T-004 into this task.
- Repository baseline: no `Contract`/`BusinessPartner` exist; vouchers and ledgers exist; the T-003
  work-item kernel and (pending) T-004 intake pipeline are reusable.

## Scope
In scope (when picked up):
- `Contract` entity + minimal `BusinessPartner`; `JournalVoucher.contractId` nullable link.
- Read-only contract timeline (events ∪ linked vouchers ∪ work items).
- Contract attachments reuse the T-004 intake/`ObjectStore` pipeline.
- A code-first contract lifecycle (D2 model) that spawns role work items per stage.

Out of scope:
- Sales/order/quote/fulfilment/pricing/inventory.
- Automatic disbursement; bank reconciliation.
- Writing financial detail into My-Chat search/recommendation/forum (DP24).
- Receivable/payable schedule + cash forecast **until M2 cashier entities exist** (then it becomes a
  fast follow).

## Core direction
The contract is a coordinating aggregate, not a new business-state owner. Documents under it keep
their own state machines (voucher: draft→pending→posted→reversed; payment later). The contract adds:
1. a **dimension** (`contractId` on vouchers / later cashier docs) for per-contract reporting, and
2. a **timeline** read model, and
3. a **lifecycle** (stages) modeled as a registered workflow.

```text
Contract (合同)
  ├─ dimension:   JournalVoucher.contractId  (+ Payment/Receipt.contractId later)
  ├─ timeline:    contract events ∪ linked vouchers ∪ work items  (∪ funds docs later)
  └─ lifecycle:   draft → signed → in-execution → settling → closed   (D2: code-first topology +
                  DB policy; each transition spawns role work items — not a hard-coded pipeline)
```

This also unlocks management reporting (per-contract P&L, receivable aging, cash forecast) once the
reporting milestone and M2 cashier entities are in place.

## Milestones (draft)
- **C0 — Decision alignment**: confirm entity shapes, lifecycle stages, and the dimension/timeline
  boundary; confirm dependency sequencing with T-004 and M2.
- **C1 — Schema + RLS**: `Contract`, `BusinessPartner`, `JournalVoucher.contractId`; org + ledger
  RLS; regenerate DB context.
- **C2 — Contract API + dimension**: contract CRUD (org + ledger scoped); attach `contractId` from
  the voucher fast-entry editor; contract reads scoped.
- **C3 — Timeline read model + UI**: contract detail + read-only timeline (events ∪ vouchers ∪ work
  items).
- **C4 — Lifecycle (D2)**: code-first stage topology + DB policy; stage transitions spawn role work
  items via the T-003 kernel; metadata-only outbox on stage changes.
- **C5 — Receivable/payable + forecast** (after M2): expected vs actual cash schedule; feeds the
  reporting milestone.

## Verification strategy
- Governance / context / DB-context commands as in the repo standard.
- Tests: contract + partner RLS, `contractId` dimension integrity, timeline ordering, lifecycle
  transition + work-item spawn, outbox-metadata safety.

## Risks
- Scope creep toward a sales/order module → keep it a finance dimension + timeline + lifecycle only;
  no fulfilment/pricing/inventory.
- Timeline drift from source documents → timeline is a read model over authoritative document state,
  never a second copy.
- Premature lifecycle rigidity → D2 model (code-first topology + DB policy), role work items, no
  hard-coded pipeline (DP26).

## Deferred decisions
- Lifecycle stage set per contract type (sales vs purchase vs service).
- Receivable/payable schedule shape (needs M2 cashier entities).
- Whether contracts become a reporting milestone dependency or vice versa.
