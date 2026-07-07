# 01 — Plan

## Locked decisions (2026-07-07)
- Queue placement: merged into the 出纳收付 page as a second queue section (not a new nav entry) — one cashier home.
- 回单拍照: NOT in this slice; the immediately-following slice reuses the T-004 intake object-store pipeline.
- 已与银行对账 checkbox: removed from the execution panel (no post-execution action supports it; reconciliation belongs to a future bank-flow slice). Schema fields stay.

## Steps
1. Backend: `listFundConsumptionsTx` gains `limit`/`cursor` pagination + `period` filter (derived from the source voucher period — stored voucherNo carries `记-{period}-{seq}`, but filter must use a real column: join/derive via voucherId → journal_voucher.period, or store period? decide in implementation with no schema change → filter via voucher period through a relation query on voucher_id IN (select id from journal_voucher where period=...)); `countPendingFundConsumptionsTx`; controller/service accept the new query params.
2. OpenAPI + api-client + web data-source: new list params + count; regenerate schema + api index.
3. Web:
   - 出纳收付 page: 资金执行 queue section (待执行 default; 已执行/全部 toggle), row = 收款/付款 badge + amount + summary + account + voucher link + date; inline expand = 流水号 + 确认到账/确认已付 + 标记无需; 409 soft-refresh reuse; empty state.
   - Copy: panel title 资金执行; direction labels 收款/付款; per-direction confirm verbs; remove the reconciliation checkbox (panel + queue).
   - Workbench: fund.consume deep-link → /finance/payments#fund-queue (anchor); bare 确认执行 stays.
   - Dashboard: cashier shortcut count includes pending fund tasks.
4. Verify: integration tests (pagination, period filter, count), typecheck/lint/lint:css/test, live /v1 smoke, preview walkthrough (desktop + mobile), bundle docs, governance, commit.

## Risks & mitigations
- Period filter without a schema change requires a relation filter on journal_voucher — keep it an indexed voucherId IN subquery; if it proves awkward, fall back to date-range on createdAt (documented).
- The payments page already has 6 D11 tabs; the fund queue must be a visually separate SECTION, not a 7th tab, to preserve the who-acts-next model.

## Acceptance criteria
- [x] Queue section renders + operates on live data; empty state correct.
- [x] Pagination/filter/count covered by integration tests.
- [x] Copy de-jargoned; checkbox gone; deep-link lands on the queue.
- [x] All gates + live smoke + governance pass.
