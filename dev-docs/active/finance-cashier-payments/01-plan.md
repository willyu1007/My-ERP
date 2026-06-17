# 01 — Plan: cashier MVP slice (T-007)

## Aligned decisions (2026-06-17)
- **Scope** = MVP slice first. **D1** = dedicated `PaymentDoc` entity + state machine. **D4** = reuse cash
  chart accounts (1001/1002) — no `FundAccount` master yet.
- **D2 (MVP default)** = single-step approval via the kernel role queue, code-first; SoD (申请≠审批≠确认)
  with single-person-mode exemption mirroring the voucher flow. Amount thresholds + multi-step + DB policy
  tables deferred.
- **D3 (MVP default)** = a code-first settlement rule per direction (pure builder), not a DB template.
- **D5 (MVP default)** = reserve a nullable `contractId` on PaymentDoc; no T-005 wiring this slice.

## State machine (PaymentDoc.status)
```
draft ──submit──> pending_approval ──approve──> approved ──confirm──> confirmed
  │                     │                          │
  └──void──> void  <────┴──────────────────────────┘   (void allowed pre-confirm)
```
- **submit** (draft→pending_approval): creates a `payment.approve` WorkItem (assignedRole `supervisor`).
- **approve** (pending_approval→approved): SoD — approver ≠ maker (single-person exempt). Completes the
  approve WorkItem; opens a `payment.confirm` WorkItem (assignedRole `cashier`).
- **confirm** (approved→confirmed): the cashier records the money moved → **generate + post the settlement
  voucher** in one tx; stamp `settlementVoucherId`. Completes the confirm WorkItem.
- **void**: any pre-`confirmed` state → `void` (no physical delete; audited).

## Settlement voucher rule (D3, pure — `finance-domain`)
`buildSettlementEntry({direction, amount, cashAccount, contraAccount})` → 2 balanced lines:
- **receipt (收款)**: 借 cash, 贷 contra. (e.g. 收回应收 借1002/贷1122.)
- **payment (付款)**: 借 contra, 贷 cash. (e.g. 付应付 借2202/贷1002.)
Integer-cent, zero float (借贷必平). The voucher posts through the existing state machine, never around it.

## Schema (ledger-scoped, RLS like `journal_voucher`)
`PaymentDoc`: id, ledgerBookId, no (收-/付-YYYY-MM-NNN), direction (receipt|payment), date, period,
counterparty, summary, amount(Decimal 18,2), cashAccountCode, contraAccountCode,
status (draft|pending_approval|approved|confirmed|void), settlementVoucherId?(uuid),
contractId?(uuid, reserved), maker, approver?, confirmer?, createdAt, updatedAt, version. Unique
(ledgerBookId, no). RLS: ledger scope select/insert/update; no delete.

## API (apps/api) — `/v1/payments`
`GET /payments?status&direction`, `POST /payments` (draft), `GET /payments/:id`,
`PATCH /payments/:id` (edit draft), `POST /payments/:id/submit|approve|confirm|void`. Approve/confirm
enforce SoD + period lock; confirm returns the posted settlement voucher.

## Web — `/finance/payments`
List (收/付 + status filters) · create form (direction, counterparty, amount, cash + contra account,
summary) · detail with submit/approve/confirm/void by status. Payment approve/confirm tasks also surface
in 我的工作台 (visibility; the action happens on the payment detail page for the MVP).

## Phases
- **C1 (this turn) — foundation**: `PaymentDoc` model + migration (RLS), `buildSettlementEntry` pure
  builder + unit tests, db repos + a RLS integration test. Verified (prisma validate / typecheck / test).
- **C2 — service + API**: payment service (state machine, SoD, period lock, settlement-voucher gen + post,
  WorkItem create/complete) + controller + OpenAPI + api-client.
- **C3 — web**: payments list / create / detail + actions; nav entry; workbench surfacing.
- **C4 — verify**: fresh-DB e2e (draft→submit→approve→confirm→posted voucher) + browser walkthrough.

## Non-goals (MVP): thresholds/multi-step approval, FundAccount + balances, bank reconciliation, My-Chat
outbox dispatch worker, generic kernel `complete` dispatch for payment types, contract integration.
