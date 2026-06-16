# 01 — Plan

Execution is schema/domain-first, then API, then web — mirroring the M1/T-004 cadence (each phase
independently committed + self-reviewed). Decisions D1–D5 are frozen (`00-overview`).

## Phase 0 — Decision freeze (done)
- D1 non-cash-line CF tag · D2 auto-suggest + pre-close worklist + tie-out · D3 hybrid mapping
  (code-first statutory) · D4 anytime reports over 月/季/年/custom range, equity by close status ·
  D5 statutory three tables + close + CF only.

Acceptance:
- [x] `02-architecture.md` reflects the frozen schema, derivation, mapping, CF, and close designs.

## Phase M3a — Period close (期末结账)
Purpose: 结转损益 + period locking; the prerequisite for a correct BS equity section.

Steps:
- Schema (via `sync-db-schema-from-code`): `PeriodClose` (ledgerBookId, period `YYYY-MM`, status
  `open|closed`, closedBy/closedAt, `closeVoucherId`, reopenedBy/reopenedAt). Org+ledger RLS. Seed the
  本年利润 / 利润分配 account codes in the 小企业准则 template (4103/4104) if missing.
- Close-readiness checks (pure + service): every voucher in the period is `posted` (no draft/pending),
  trial balance for the period is balanced, the period is not already closed, prior periods closed.
- 结转损益: generate + post a `结转损益` voucher that zeroes every 损益类 account (category `cost` /
  `profitLoss`) into 本年利润 (4103); the net = 净利润. Transactional (reuse the voucher post path).
- Locking: reject submit/post/update of a voucher whose period is `closed` (guard in the voucher
  service). 反结账: red-reverse (红冲) the 结转 voucher + set period `open`.

Acceptance:
- [ ] Closing a period requires all-posted + balanced; produces a posted 结转损益 voucher; 本年利润 = 净利润.
- [ ] A closed period rejects new posting/edits; 反结账 reverses 结转 and reopens.
- [ ] All money integer-cent/Decimal; close + reopen are transactional + audited; no physical delete.

## Phase M3b — Cash-flow tagging (现金流量项目)
Purpose: make the direct-method CF statement derivable, with low entry friction (D1/D2).

Steps:
- Schema: `CashFlowItem` master (ledger-scoped: code, name, activity `operating|investing|financing`,
  direction `inflow|outflow`, sort, active); seed the 小企业准则 standard set. Add
  `Account.defaultCashFlowItem` (the auto-suggest source).
- Tagging path (D1 — non-cash lines): the fast-entry / confirm editor shows a CF-item picker on the
  **non-cash** lines when the voucher touches a cash account (1001/1002/1012…); the posting template +
  `Account.defaultCashFlowItem` pre-fill the suggestion (D2). Persist to `JournalEntryLine.cashFlowItem`.
- Pre-close worklist: list posted cash-involved vouchers with untagged non-cash lines (a work item /
  query) to clear before close.
- **Tie-out** (the CF 借贷必平): per range, Σ tagged flows (signed by inflow/outflow) == net change in
  cash accounts. A pure check + a report-time assertion + a close-readiness check.

Acceptance:
- [ ] A cash voucher's non-cash lines carry `cashFlowItem`; defaults pre-fill, editable.
- [ ] The pre-close worklist surfaces untagged cash flows; the tie-out check flags mismatches.
- [ ] Tagging never blocks entry (no mandatory gate at submit/post).

## Phase M3c — Report read-model + statutory three tables
Purpose: range-parameterized BS/IS/CF derived from the ledger + CF tags.

Steps:
- Extend the db posted-entries query to include `cashFlowItem`; add a date-filtered variant (or filter
  in-domain for v1, SQL filter as an optimization).
- Range-aware derivation (`packages/finance-domain`): `closingAsOf(to)` (= trial balance over
  `date <= to`), `periodActivity(from,to)`, `cfFlows(from,to)` — all pure, Decimal.
- Report-mapping templates (D3, code-first): `ReportLine { key, label, formula: [{account/prefix, side:
  debit|credit|net, sign}] }` supporting **signed sums + netting** (应收账款 = 1122 − 1231); 小企业准则
  BS/IS/CF templates. CF template maps CashFlowItem → statement lines.
- BS/IS/CF pure functions: BS = mapping over `closingAsOf(to)` + equity coupling (D4); IS = mapping
  over `periodActivity`; CF = `cfFlows` grouped + tie-out.
- API: `GET /v1/reports/{balance-sheet|income-statement|cash-flow}?from&to` (or `period`/preset).
  Contract-first OpenAPI + api-index.
- Web: report views with a 月/季/年/自定义 range picker.

Acceptance:
- [ ] BS balances (资产 = 负债 + 所有者权益) on a worked 小企业 fixture; IS 净利润 matches; CF ties out.
- [ ] Reports run over month/quarter/year/custom range; BS as-of range-end, IS/CF within range.
- [ ] Before close, equity shows 本年利润(未结转) = computed YTD profit; after close, the persisted 结转.

## Phase M3d — Export / print
Purpose: compliant archival output (DP30).

Steps:
- Excel + PDF export of BS/IS/CF (+ trial balance); print layout. Reuse a shared export util if present.

Acceptance:
- [ ] Each statement exports to Excel + PDF and prints with a archival-suitable layout.

## Phase M3e — Verification
- `pnpm typecheck`/`test`; pure-function report tests vs a worked fixture (BS balanced, IS profit, CF
  tie-out); period-close transaction + lock + reopen tests; CF tie-out tests; governance + context +
  DB-context; `pnpm ui:governance` for report views.

## Risks / mitigations
- CF tagging discipline → auto-suggest + worklist + hard tie-out (the CF 借贷必平).
- Mapping correctness (netting/sign/direction reclass) → template tests vs a known worked example;
  start with signed sums + netting, defer advanced 借贷方向重分类.
- Equity coupling ambiguity (D4) → explicit 本年利润(未结转) computed line before close.
- Range/opening off-by-one → opening for a range = balances as-of `from − 1`; test boundary cases.
