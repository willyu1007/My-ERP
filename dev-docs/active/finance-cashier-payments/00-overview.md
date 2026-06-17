# 00 — Overview: Finance cashier & payments (出纳 收付款)

## Problem statement
M1 gives the general ledger; T-003 gives a task kernel with the voucher review/post workflow; T-006 gives
period close + reports. The missing finance pillar is the **cashier (出纳) layer**: 收付款 documents with a
**request → approve → confirm → auto-generate settlement voucher → post** flow. Today a payment is just a
hand-keyed voucher — there is no payment request, no amount-threshold / multi-step approval, no fund/bank
account tracking, and no link from "we agreed to pay" to "we posted the entry".

This is **R3 of T-003** (cashier + approval extension), spun out as its own task at the 2026-06-17 split so
T-003 closes on the kernel + voucher slice. It reuses the WorkItem kernel (R3 exit criterion: a payment
workflow coexists with the voucher workflow on the same kernel) and, where relevant, links to the T-005
Contract aggregate.

## Status
- State: planned
- Created 2026-06-17 from T-003 R3. Decisions to be aligned with the user before implementation (this repo's
  decision-gate pattern), because the cashier touches money movement and hits hard constraints.

## Goal
A cashier funds workflow on the task kernel:
- **收款单 / 付款单 (PaymentDoc)** draft (counterparty, amount, fund account, purpose, optional contract link).
- **审批 (approval)**: SoD + amount thresholds + optional multi-step, expressed via the kernel's role queues
  and (per T-003 D2) a mixed code-first topology + DB-configured policy.
- **确认收付 (confirm)**: a human records that the money actually moved.
- **结算凭证自动生成**: confirm generates the settlement voucher (借/贷 银行存款/库存现金 ↔ 往来/费用) and posts
  it through the existing voucher state machine — never around it.

## Hard constraints (non-negotiable; from `AGENTS.md` / project blueprint)
- **NO auto-disbursement and NO payment-rail / bank-API integration.** The module *records*, *approves*, and
  *generates the accounting entry*; the actual transfer is performed by a human in their own bank. The system
  must never move money.
- SoD (申请 ≠ 审批 ≠ 出纳确认) enforced in the service layer + DB; no physical delete of records; audit every
  transition; ledger scope + RLS.
- My-Chat outbox stays **metadata-only** (no amounts / counterparty / bank detail) — same envelope as T-003 D4.

## Non-goals
- Bank reconciliation (银行对账) — v1.1.
- Real bank / payment-gateway integration; payroll; multi-currency; tax filing.
- Replacing the voucher state machine or ledger derivation.

## Open decisions (to align before implementation — Step 2)
- **D1 — PaymentDoc shape**: a dedicated `PaymentDoc` entity + its own small state machine
  (draft → pending_approval → approved → confirmed → posted/void), with the voucher generated at confirm —
  vs. modeling payments as a voucher subtype. (Lean: dedicated entity; vouchers stay pure accounting.)
- **D2 — Approval policy**: amount thresholds + step count — code-first defaults vs. DB-configured policy rows
  (per T-003 D2 mixed model). Where do single-person-mode exemptions apply?
- **D3 — Settlement voucher generation**: a posting-template per payment direction/purpose (reuse T-004's
  template seam?) that maps PaymentDoc → balanced voucher lines.
- **D4 — Fund/bank account model**: a `FundAccount` master (bank/cash) tied to chart accounts (1001/1002),
  or just reuse the cash chart accounts directly.
- **D5 — Contract link**: a PaymentDoc optionally references a T-005 `Contract`; settlement flows into the
  contract timeline. (Soft dependency on T-005.)

## Pointers
- Kernel: `dev-docs/active/workflow-task-kernel-finance-pipeline/` (R3 was scoped here).
- Voucher workflow adapter to reuse: `apps/api/src/work-items/voucher-workflow.ts`.
- Posting-template seam: T-004 `dev-docs/active/finance-intake-fast-entry/`.
- Contract aggregate: `dev-docs/active/finance-contract-transaction-lifecycle/` (T-005).
- Root constraints: `AGENTS.md`.
