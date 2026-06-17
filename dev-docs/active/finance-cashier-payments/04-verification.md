# 04 — Verification (cashier MVP, T-007)

## Static gate (C4, 2026-06-17)
| Check | Result |
|---|---|
| Prisma validate / migrate (Prisma path) | valid; `payment_doc` migration applies clean |
| Typecheck | pass (all projects) |
| Lint | clean |
| Tests | **36 files / 146 tests** (+ cashier unit ×4, payment-doc RLS ×2, payments service ×4) |
| OpenAPI quality / API index | passed / up-to-date |

## What each phase proved
- **C1** — `buildSettlementEntry` unit (receipt/payment/balance/rejects) + `PaymentDoc` RLS integration
  (ledger isolation, version-guarded update). Migration applies via the Prisma path; 借贷必平 holds at the
  rounding edge.
- **C2** — fresh-DB `/v1` e2e, **9/9**: create→submit→approve→confirm; settlement 记-2026-06-001 posted &
  balanced; maker self-confirm w/o `confirmSinglePerson` → 403; stale version → 409; tasks flow
  my_tasks→handled_by_me. (Found + fixed a stale-voucher response bug — confirm now re-fetches the posted voucher.)
- **C3** — browser walkthrough: created 收-2026-06-001, drove draft→待审批→已审批→已确认 (settlement voucher
  posted, 查看结算凭证 link), and both payment tasks render in 我处理过 with 收付款审批/确认 titles, payment
  enrichment, and the sourceType-aware `/finance/payments` deep link.
- **C4** — `apps/api/src/payments/payments.integration.test`: the real `PaymentsService` against Postgres:
  single-person full lifecycle → posted balanced voucher (借1002/贷1122); maker self-confirm w/o single-person
  rejected; multi-person SoD (maker can't approve/confirm own, another user can); non-cash cash account +
  double-submit rejected.

## Deferred (post-MVP enhancements; non-goals of this slice)
- Approval **thresholds + multi-step** approval policy (DB-configured per T-003 D2).
- **FundAccount** master + bank-account balances (MVP reuses 1001/1002/1012 chart accounts).
- Dedicated **`Payment` CASL subject** (MVP reuses `read/create/approve/post` Voucher actions).
- Draft **edit** endpoint (no `PATCH /payments/:id` in the MVP — void + recreate); bank **reconciliation**.
- **Outbox dispatch worker** (My-Chat delivery) — events are written metadata-only but not yet delivered
  (shared infra; tracked under the kernel/notifications follow-up).
- Generic kernel `complete` dispatch for `payment.*` types (actions live on the payment pages in the MVP).
- **T-005 Contract link** — wired since T-005 C2: `PaymentDoc.contractId` is set on create and surfaced in
  the contract timeline.
