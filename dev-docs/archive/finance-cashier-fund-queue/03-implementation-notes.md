# 03 — Implementation Notes

## Status
- Current status: `done`
- Last updated: 2026-07-07

## What changed
- **db** (`packages/db/src/index.ts`): `listFundConsumptionsTx` gained `period` (resolved via a journal_voucher id lookup — no schema change, no relation exists), `limit`, and `cursor` (id-cursor + `skip:1`; `id asc` tiebreaker added to the orderBy so paging is deterministic). voucherId+period compose by intersection (early-return empty when disjoint). New `countPendingFundConsumptionsTx`.
- **api** (`fund-consumptions.controller/service`): list accepts `period` (`YYYY-MM` validated) / `limit` (1-100) / `cursor` (uuid validated); new `GET /v1/fund-consumptions/pending-count` — declared BEFORE `:id` so the literal segment isn't captured as an id. Response stays a plain array (workbench cursor convention: next cursor = last row id).
- **openapi/api-client/data-source**: new params + `getFundConsumptionPendingCount`; schema + api-index regenerated.
- **web**:
  - New `lib/finance/fund-display.ts` — shared 资金执行 vocabulary (收款/付款, 确认到账/确认已付, status labels/tones) + `FUND_QUEUE_FETCH_LIMIT` (lives here, NOT in the client module — see pitfall).
  - New `finance/payments/fund-execution-queue.tsx` — the cashier queue section on the 出纳收付 page (`#fund-queue` anchor): 待执行/已执行/全部 sub-tabs, EntityRow rows (voucher-no link, account, direction, date), inline expand = 流水号 + direction-verb confirm + 标记无需 + 查看凭证; per-tab empty copy; cap hint at 100 rows. Rendered below the payments queue, hidden entirely when the ledger has no fund rows.
  - `fund-consumption-panel.tsx` (voucher detail, audit-side view): title → 资金执行, direction verbs, 已与银行对账 checkbox + 对账 display REMOVED (schema fields untouched).
  - `work-item-source.ts`: `workItemDeepLink` gained `workItemType`; `fund.consume` → `/finance/payments#fund-queue`.
  - `work-item-display.ts`: task title 货币资金结算 → 资金执行 (vocabulary alignment).
  - Dashboard: 出纳收付 shortcut shows `N 待确认 · M 待执行` (待执行 suffix only when M>0), via `getFundConsumptionPendingCount` with fetch-unavailable → 0.

## Decisions & tradeoffs
- See 01-plan locked decisions. Additional:
  - Queue fetch strategy: ONE server fetch (`limit: 100`, newest vouchers first) + client-side tab filtering, with an explicit "仅显示最近 100 条" hint at the cap — the API's cursor pagination exists for growth/API consumers, but a small enterprise never hits 100 open cash lines, so the UI stays one-shot simple (no silent cap: the hint keeps it honest).
  - Response stays a bare array (not a `{items, nextCursor}` envelope) to match the work-items convention and avoid breaking the existing voucher-panel consumers.

## Deviations from plan
- None. (The period-filter fallback to createdAt was not needed — the voucher-id lookup is clean.)

## Known issues / follow-ups
- Next slice: 回单拍照上传 (reuse intake object store; camera capture on mobile web) — replaces the free-text 附件编号 on the voucher-detail panel; the queue form deliberately omits it already.
- The workbench bare 确认执行 (no 流水号) stays as the quick path; the queue is the full-fields path.
