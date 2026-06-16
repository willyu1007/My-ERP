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

## Open items / next
- **M3b** — Cash-flow tagging (`CashFlowItem` master + seed, `Account.defaultCashFlowItem`, the
  non-cash-line CF-item picker + auto-suggest, pre-close worklist, tie-out).
- **M3c** — report read-model + statutory three tables. **M3d** export. **M3e** verify.
- Consider a `close` CASL action (close is currently gated by `post` Voucher).
