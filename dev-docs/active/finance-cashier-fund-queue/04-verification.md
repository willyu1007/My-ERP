# 04 — Verification

## Automated checks
- `pnpm -r typecheck` / `pnpm lint` / `pnpm lint:css` / `pnpm test`
- `pnpm vitest run apps/api/src/fund-consumptions/fund-consumptions.integration.test.ts`
- `pnpm --filter @my-erp/api-client codegen` + `node .ai/scripts/ctl-api-index.mjs generate --touch` after OpenAPI edits
- Governance: `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` + `lint --check --project main`

## Manual smoke checks
- Live `/v1`: list with limit/cursor walks pages stably; period filter matches; pending count correct.
- Preview (desktop + mobile): 出纳收付 shows the 资金执行 section; inline confirm with/without 流水号; 标记无需; empty state; workbench deep-link lands on the queue; dashboard count includes pending fund tasks.

## Verification log
- 2026-07-07: bundle created; no code verification yet.
- 2026-07-07 (implementation):
  - `pnpm vitest run apps/api/src/fund-consumptions/fund-consumptions.integration.test.ts` -> 12/12 (new T-013 case: cursor walk with limit has no skips/repeats vs the unpaginated list; bogus period empty; voucherId+period intersection; pending count matches the pending list and drops by 1 after a consume).
  - `pnpm -r typecheck` / `pnpm lint` / `pnpm lint:css` -> passed. `pnpm test` -> 48 files / 206 tests passed.
  - `pnpm --filter @my-erp/api-client codegen` + `ctl-api-index generate --touch` -> API context refreshed (period/limit/cursor params + pending-count route).
  - Live `/v1` smoke (fresh token minted — the old one had expired; web `.env.local` token refreshed too): seeded 收款测试A (1001 inflow 560) + 付款测试B (1002 outflow 780); `pending-count` 2; `limit=1` page + cursor page walk both rows in order; `period=2026-06` -> 2, `period=2031-01` -> 0.
  - Preview walkthrough (dev server, live API):
    - 出纳收付 page renders the 资金执行 section (待执行 2 / 已执行 2 / 全部 5) below the payment queues; rows show 收款/付款 + account + voucher no + date + amount.
    - Clicked 处理 on 收款测试A -> expanded inline form; filled 流水号 BANK-T013-001 -> clicked 确认到账 -> row left 待执行 (2→1), 已执行 2→3; API confirms `bankFlowRef` stored, paired `fund.consume` work item `completed`, pending-count 2→1, reconciliationStatus stays `unreconciled`.
    - Voucher detail (付款测试B): panel title 资金执行, direction 付款, button 确认已付, NO 对账 checkbox/text.
    - 看板: 出纳收付 shortcut `2 待确认 · 1 待执行`; the fund task row sits in the 出纳 bucket (title now 资金执行).
    - Mobile (375px): section + tabs wrap cleanly, 处理 touch-sized, no horizontal overflow. Console: zero errors.
  - Two runtime bugs found & fixed during the walkthrough (see 05-pitfalls): client-module constant poisoning the server import (400 on list), test voucher-no collision.
