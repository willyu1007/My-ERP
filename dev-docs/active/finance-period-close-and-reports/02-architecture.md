# 02 — Architecture

## Baseline (reuse)
- Derivation: `packages/finance-domain/src/ledger.ts` — `computeTrialBalance(entries, openings)` and
  `computeAccountLedger(...)`, pure + Decimal, derive opening/period/closing from POSTED voucher lines
  (`PostedLine { accountCode, accountName, debit, credit, voucherId, voucherNo, date, summary }`) +
  `OpeningLine`. Balances are derived, never materialized.
- `Account` (category `asset|liability|equity|cost|profitLoss`, direction, code, isLeaf, parentCode),
  `JournalVoucher` (status `draft|pending|posted|reversed`, date, period `YYYY-MM`, lines),
  `JournalEntryLine` (has **`cashFlowItem String?`** + `aux Json?`, both reserved/unused),
  `OpeningBalance`, `LedgerBook` (openingPeriod, periodStructure `12+1`).
- No `AccountingPeriod`/`PeriodClose`, no `CashFlowItem`, no report layer.

## Layering
```text
apps/web   report views (BS/IS/CF + 月/季/年/custom range picker); CF-item picker on cash vouchers;
           pre-close worklist
apps/api   report controllers (range params); period-close service; CF tie-out
packages/finance-domain
           range-aware derivation (closingAsOf / periodActivity / cfFlows);
           report-mapping templates (BS/IS/CF, signed sums + netting); 结转损益 builder; tie-out
packages/db
           posted-entries query (+ cashFlowItem, date filter); PeriodClose / CashFlowItem repos
prisma     PeriodClose, CashFlowItem, Account.defaultCashFlowItem
```

## Schema additions
- **`PeriodClose`** (ledger-scoped, org+ledger RLS): `id, orgId, ledgerBookId, period (YYYY-MM),
  status (open|closed), closeVoucherId?, closedBy?, closedAt?, reopenedBy?, reopenedAt?`. One row per
  (ledger, period). Absence ⇒ open.
- **`CashFlowItem`** (ledger-scoped): `id, orgId, ledgerBookId, code, name, activity
  (operating|investing|financing), direction (inflow|outflow), sort, active`. Seeded standard set.
- **`Account.defaultCashFlowItem String?`** — the auto-suggest source (D2).
- `JournalEntryLine.cashFlowItem` already exists — the tag store (D1). No change.
- Report-mapping templates are **code-first** (no table) for v1; DB custom is deferred (D3).

## Range-parameterized derivation (D4)
Reports take a range; presets 月/季/年 resolve to a `[from, to]`; custom is arbitrary. Build on the
existing pure functions by **date-filtering posted entries**:
- `closingAsOf(to)` = `computeTrialBalance(entries where date <= to, openings)` → per-account closing
  (debit/credit balance). Used by **BS** (balances as-of range end).
- `periodActivity(from, to)` = net 发生额 per account for `from <= date <= to`. Used by **IS**.
- `cfFlows(from, to)` = in-range non-cash lines carrying `cashFlowItem`, signed by item direction.
  Used by **CF**.
- Opening for a range = balances as-of `from − 1` (= `closingAsOf(from-1)`); test boundary cases.
- v1 filters in-domain (fetch posted entries + filter); SQL date-filter is a later optimization.

## Report-mapping templates (D3 — code-first, signed sums + netting)
```ts
type Side = 'debit' | 'credit' | 'net';          // net = debit − credit (closing) for the account
type Term = { match: string; side: Side; sign: 1 | -1 }; // match = account code or prefix
type ReportLine = { key: string; label: string; terms: Term[]; children?: ReportLine[] };
```
- The crux is **signed sums + netting**, not range summation:
  - BS 应收账款 = `[{1122, net, +1}, {1231, net, -1}]` (净额); 存货 nets 跌价准备; 货币资金 = 1001+1002+1012.
  - IS 营业收入 = credit-net of 6001/6051; 净利润 is computed from the IS lines.
- Direction reclassification (应收贷方余额 → 预收 等) is an **advanced** refinement — defer; v1 does
  signed sums + netting.
- Ship 小企业准则 BS/IS templates code-first; CF template maps `CashFlowItem → statement line`.

## Statements

### Balance sheet (资产负债表) — as-of range end
- Asset/liability/equity lines = BS mapping over `closingAsOf(to)`.
- **Equity coupling (D4)**: 未分配利润 = persisted 本年利润(4103) + 利润分配(4104). Before the period is
  closed, 本年利润 hasn't been 结转, so add a computed **本年利润(未结转)** = IS 净利润 YTD; after close
  it is 0 (already in the account). The statement shows which mode it used.
- Integrity: 资产 == 负债 + 所有者权益.

### Income statement (利润表) — within range
- Lines = IS mapping over `periodActivity(from,to)` for 损益类 accounts; 净利润 computed.

### Cash flow statement (现金流量表, direct) — within range
- Lines = `cfFlows(from,to)` grouped by `CashFlowItem` → statement lines (经营/投资/筹资).
- **Tie-out**: Σ tagged flows (inflow − outflow) == net change in cash accounts (1001/1002/1012…) over
  the range = `closingAsOf(to).cash − closingAsOf(from-1).cash`. Surfaced on the report + as a
  close-readiness check.

## CF tagging flow (D1/D2)
- Tag target: **non-cash (contra) lines** of a cash-involved voucher → `JournalEntryLine.cashFlowItem`.
- Auto-suggest: posting template + `Account.defaultCashFlowItem` pre-fill (e.g. 6001 → 销售商品收到的现金),
  editable in the fast-entry / confirm editor (a CF-item picker shown on non-cash lines when the
  voucher touches cash). No mandatory gate at submit/post (preserves T-004 #1).
- Safety net: a **pre-close "untagged cash flows" worklist** + the **tie-out** check. The CF
  statement is only asserted complete when the range ties out.

## Period close (期末结账) state machine
```text
open ──(close: all-posted + balanced + prior closed)──▶ closed     (persists 结转损益 voucher + lock)
closed ──(reopen / 反结账: red-reverse 结转)──▶ open
```
- 结转损益 voucher: for each 损益类 (cost/profitLoss) account with a balance, a line zeroing it into
  本年利润 (4103); net = 净利润. Generated + posted transactionally (reuse the voucher post path; SoD
  exempt as a system close, audited).
- Locking: the voucher service rejects submit/post/update when the target period is `closed`.
- 反结账: 红冲 the 结转 voucher (no physical delete) + set period `open`; audited.

## Boundary rules (inherit)
- Reports/period-close MUST derive from POSTED data; no materialized balance table.
- Money integer-cent / Decimal, zero float; statements rounded to 2dp at the edge only.
- Close/reopen + 结转 are transactional + audited; 会计档案 (statements) are append-only/export-archived.
- org + ledger RLS on `PeriodClose`/`CashFlowItem`; report queries are ledger-scoped.
- No physical delete; corrections via 红冲 / reopen.

## Decision records
- **D1** CF tag on non-cash lines (`JournalEntryLine.cashFlowItem`).
- **D2** auto-suggest (`Account.defaultCashFlowItem` + posting template) + pre-close worklist + tie-out;
  no mandatory entry gate.
- **D3** hybrid mapping: code-first 小企业准则 templates (signed sums + netting); DB custom deferred.
- **D4** range-parameterized reports (月/季/年/custom); BS as-of range-end, IS/CF within range; equity
  本年利润 by close status (computed 未结转 before close, persisted after).
- **D5** statutory three tables + period close + CF only; 部门/项目 management reports deferred; 往来 → T-005.

## Open questions (resolve during M3a/M3c)
- Exact 小企业准则 account codes for 结转 targets (本年利润 4103 / 利润分配 4104) + the seed template.
- Whether the pre-close untagged-cash worklist is a WorkItem (T-003 kernel) or a plain query view.
- Direction-reclassification scope for BS (defer vs include a minimal set).
