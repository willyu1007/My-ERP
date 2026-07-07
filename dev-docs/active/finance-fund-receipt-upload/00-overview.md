# 00 — Overview: 回单拍照上传 (fund receipt upload)

## Status
- State: done
- Scope aligned with the user 2026-07-08 (two decisions locked; see 01-plan); implemented and verified the same day (see 03/04).

## Problem statement
The cashier's fund-execution flow (T-012 Phase 4 / T-013 queue) records that money moved, but the real-world evidence — the bank receipt (回单) — has nowhere to live except a free-text `附件编号` field on the voucher-detail panel. The cashier's actual action is "拍一张银行回单". The object-store + Attachment pipeline (T-004 intake capture) already exists and is reusable; this slice wires it to FundConsumption so the cashier snaps/uploads a receipt as execution evidence, viewable in-app.

## Goal
Let the cashier attach a bank-receipt photo (camera capture on mobile) to a fund-execution line and view it back in-app — at confirm time or after the fact. Small-enterprise target: convenient, clear. Financial evidence stays inside My-ERP (compliance red line).

## Non-goals
- OCR / auto-fill of bankFlowRef/amount from the receipt (real extractor is a future slice; MockExtractor is not wired here).
- Multiple attachments per line (one receipt per fund line in v1).
- Attaching receipts to vouchers/payments (this slice is FundConsumption-only).

## Compliance (hard red line, AGENTS.md §3)
财务明细严禁进入生态的检索/推荐/论坛；严禁直连 My-Chat 数据库。A bank receipt is the most sensitive financial detail. Therefore the upload:
- stores into My-ERP's own object store + Attachment table (never My-Chat);
- does NOT go through the Intake flow (which emits `intake.received` outbox + may trigger extraction/auto-draft);
- emits NO outbox event and no metadata carrying the receipt key/content;
- leaves only an internal audit record.

## Acceptance criteria
- [x] Cashier can upload a bank-receipt image/PDF to a fund line (confirm-time AND on an already-executed line; blocked only when void).
- [x] Upload stores the bytes in the object store + an Attachment row + sets `fund_consumption.attachment_id` (a real Attachment.id), with an audit record and NO outbox event.
- [x] Cashier/accountant can view the receipt in-app (proxy route streams the exact bytes).
- [x] Mobile camera capture works (`capture="environment"`); the free-text 附件编号 field is replaced by the upload control.
- [x] Verification: integration tests (upload sets id + no outbox; void rejected; download bytes round-trip), gates, live /v1 smoke, desktop+mobile preview.

## Pointers
- Engine: `dev-docs/active/finance-sme-usability-foundation/` (T-012 P4), `dev-docs/active/finance-cashier-fund-queue/` (T-013)
- Reused pipeline: T-004 intake capture (object store + Attachment) — `apps/api/src/intakes/`, `packages/platform/src/capture.ts`
- Root constraints: `AGENTS.md`
