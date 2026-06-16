# 03 — Implementation notes

## M3a — Period close (done 2026-06-16)

What changed:
- `packages/platform/src/account.ts`: added **本年利润 (4103)** + **利润分配 (4104)** to `STANDARD_CHART`
  (equity, credit). Required for 结转损益 + the BS equity section.
- `packages/finance-domain/src/period-close.ts`: `buildCloseLossesEntry(rows, profitOfYear?)` — pure
  + Decimal. Zeroes each 损益类 (cost/profitLoss) account on its opposite side; the net (revenue −
  expense) goes to 本年利润 (4103, credit when profit / debit when loss). Returns `{ lines, netProfit }`.
  Empty when there are no P&L balances. `period-close.test.ts` covers profit / loss / flat.
- `prisma`: `PeriodClose` (id, ledgerBookId, period, status open|closed, closeVoucherId, closedBy/At,
  reopenedBy/At). **Ledger-scoped RLS** (like `journal_voucher`, NOT org+ledger) so the period-lock
  guard works under `withLedgerScope`. Migration `20260616120000_t006_period_close`.
- `packages/db`: `PeriodCloseEntity` + repos `getPeriodCloseTx`/`isPeriodClosedTx`/`listPeriodClosesTx`/
  `closePeriodTx` (upsert)/`reopenPeriodTx` (version-free, status flip)/`countUnpostedVouchersInPeriodTx`.
- `apps/api/src/period-close/`: `PeriodCloseService` + controller (`GET /v1/periods`,
  `GET /v1/periods/:period/readiness`, `POST /v1/periods/:period/close`, `POST /:period/reopen`).
  - **close**: readiness (no unposted in period; prior active periods closed; not already closed) →
    build 结转损益 from `closingAsOf(period)` of P&L accounts (filter posted entries by `period <=
    target`, reuse `computeTrialBalance`) → create + **post the 结转 voucher directly** (system close,
    SoD-exempt, audited) → `closePeriodTx` → audit. Returns `netProfit`.
  - **reopen (反结账)**: 红冲 the 结转 voucher (`createReversalVoucherTx`) → `reopenPeriodTx` → audit.
    Requires later periods reopened first.
- **Period-lock guard**: `isPeriodClosedTx(voucher.period)` rejects submit/update/reverse
  (`vouchers.controller`) and post (`postVoucherReviewTx`, the shared post path used by the work-item
  confirm/review complete). Draft creation into a closed period is still allowed.
- OpenAPI `/v1/periods*` + `PeriodClose`/`PeriodCloseReadiness`/`PeriodCloseResult`; api-index + DB
  context regenerated.
- `scripts/dev-seed.mjs`: added 4001/4103/4104 + `singlePersonMode: true` (so the one dev user can
  post own vouchers for demos).

Design notes:
- `period_close` is **ledger-only** RLS so the lock guard works under the voucher controllers'
  `withLedgerScope`/`withScope` (org+ledger would hide rows under ledger-only scope).
- The close voucher posts via `setVoucherStatusTx` (not the post endpoint) → bypasses SoD + the
  period lock (the period is still open during close). Reopen's 红冲 likewise uses db functions.
- Monthly 结转 carries the period's P&L because prior periods' 结转 vouchers zeroed the P&L accounts;
  the readiness "prior periods closed" rule enforces in-order close.

Verification: see `04-verification` — unit + RLS integration tests + a live e2e (close → 结转 → lock →
reopen) all pass.

## M3b (backend) — cash-flow tagging (done 2026-06-16)

What changed:
- `prisma`: `CashFlowItem` (ledger-scoped: code, name, activity operating|investing|financing,
  direction inflow|outflow, sort, active) + `Account.defaultCashFlowItem`. Migration
  `20260616140000_t006_cash_flow_item`. (`JournalEntryLine.cashFlowItem` was already the tag store, and
  the voucher create/update write path already persists it — `parseLines`/`lineCreateData`.)
- `packages/platform/cash-flow.ts`: `STANDARD_CASH_FLOW_ITEMS` (15 小企业准则 items) +
  `DEFAULT_CASH_FLOW_BY_ACCOUNT` (auto-suggest defaults).
- `packages/finance-domain/cash-flow.ts`: `isCashAccountCode` (prefix 1001/1002/1012), **`cashFlowTieOut`**
  (Σ tagged non-cash (credit−debit) == Σ cash (debit−credit) — the CF 借贷必平), `listUntaggedCashFlows`
  (the pre-close worklist). `PostedLine` gained `cashFlowItem`; `getPostedEntriesTx` now returns it.
- `packages/db`: `CashFlowItem` repos (`listCashFlowItemsTx`/`seedCashFlowItemsTx`/
  `setAccountDefaultCashFlowItemTx`); `AccountEntity` gained `defaultCashFlowItem`.
- `apps/api/src/cash-flow/`: `GET /v1/cash-flow-items`, `POST /v1/cash-flow-items/seed-standard` (items +
  chart defaults), `GET /v1/cash-flow/untagged?period`, `GET /v1/cash-flow/tie-out?from&to`. Period-close
  readiness gained `untaggedCashFlowCount` (informational — does not block close, per D2).
- OpenAPI + api-index + DB context regenerated; `Account` schema gained `defaultCashFlowItem`.

Design notes:
- Tag persistence works today via the normal voucher create/update (`cashFlowItem` per line). Tagging at
  draft/confirm time is the primary path; the worklist + tie-out are the safety net.
- `untaggedCashFlowCount` is a warning, not a close blocker (D2 keeps close decoupled from CF completeness).

## M3c (backend) — statutory reports (done 2026-06-16)

What changed (`packages/finance-domain/report.ts`):
- **Range-aware derivation** over POSTED entries (reusing `computeTrialBalance`): `closingAsOf(to)` (BS,
  balances as-of range end), `periodActivity(from,to)` (IS, 发生额 within range), and a date-filtered CF.
- **Report-mapping** (D3, code-first): `evalReport(defs, rows)` with `ReportTerm { prefix, side, sign }`
  (signed sums + netting — prefix match catches sub-accounts; `side` net=debit−credit / credit=credit−debit)
  + `combine` (signed subtotals) + `includesPnl` (BS 未分配利润 absorbs the un-结转 P&L net). Templates:
  `BALANCE_SHEET_TEMPLATE`, `INCOME_STATEMENT_TEMPLATE`.
- **Statements**: `balanceSheet` (+ `balanced` check 资产 == 负债+权益; **D4 equity coupling** — 未分配利润
  = 4103+4104 + Σ P&L net, so it balances whether or not the period is 结转'd), `incomeStatement`
  (+ `netProfit`), `cashFlowStatement` (direct; groups tagged flows by `CashFlowItem` activity + `tied`).
- API: `GET /v1/reports/{balance-sheet?to | income-statement?from&to | cash-flow?from&to}`. The web
  resolves 月/季/年/custom presets to from/to.
- OpenAPI + api-index + context regenerated.

Verification: `report.test.ts` (worked fixture — BS balances, IS 净利润, CF ties out) + a live e2e
(capital + sale + expense → BS balanced 50700, IS 净利润 700, CF net 50700 tied). The CF test caught a
fixture bug (tag on a cash line is ignored — confirms D1).

## Open items / next
- **M3c-ui** — report views: a `/finance/reports` page with a 月/季/年/自定义 range picker rendering the
  three statements (tables). **M3b-ui** (CF-item picker + tag-posted endpoint) remains too.
- **M3d** export (Excel/PDF + print). **M3e** verify.
- Consider a `close` CASL action (close is currently gated by `post` Voucher).
