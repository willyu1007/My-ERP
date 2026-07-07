# 00 — Overview: cashier fund-execution queue

## Status
- State: done
- Scope aligned with the user 2026-07-07 (three decisions locked; see 01-plan); implemented and verified the same day (see 03/04).

## Problem statement
T-012 Phase 4 delivered the fund-consumption engine (per-cash-line `FundConsumption` rows + `fund.consume` cashier tasks), but the cashier has no first-person surface for it. Today the "queue" exists only through the personal workbench (bare 确认执行, no bank-flow ref) or the voucher detail page (full fields, but an accountant-view entry — the cashier must scroll past 借贷分录 to reach the execution panel). The panel copy is still accounting jargon (货币资金结算 · 出纳执行, 资金流入/流出), and the list API has no pagination or period filter, so the row set grows unboundedly.

## Goal
Give the cashier one clear place to answer "这笔钱收/付了没有？": a fund-execution queue inside the 出纳收付 page, with plain-business copy, inline confirm (optional bank-flow ref), and a list API that scales. Small-enterprise target: easy operation, clear flow — no gold-plating.

## Non-goals (deferred by explicit decision, 2026-07-07)
- 回单拍照上传 (attachment upload via the intake object-store pipeline) — the immediately-following slice.
- Batch confirm; bank-statement reconciliation import; notification delivery (微信/移动) — future slices.
- No schema changes: `reconciliation_status`/`attachment_id` columns stay; only the UI checkbox goes away.

## Acceptance criteria (high level)
- [x] 出纳收付 page shows a 资金执行 queue (待执行 default, 已执行/全部 toggle): direction badge 收款/付款, amount, summary, account, voucher-no link, date; inline expand = 流水号 (optional) + 确认到账/确认已付 + 标记无需; empty state.
- [x] `/v1/fund-consumptions` supports limit/cursor pagination + period filter; a pending count feeds the queue badge and the dashboard cashier shortcut.
- [x] Copy de-jargoned: panel title 资金执行; direction verbs 确认到账/确认已付; 收款/付款 labels; the 已与银行对账 checkbox is removed.
- [x] Workbench fund.consume deep-link lands on the 出纳收付 fund queue (voucher-detail panel remains as the accountant/audit view).
- [x] Verification: integration tests for pagination/filter/count, full gates, live /v1 smoke, desktop+mobile preview walkthrough.

## Pointers
- Engine + invariants: `dev-docs/active/finance-sme-usability-foundation/` (T-012 Phase 4)
- Root constraints: `AGENTS.md`
