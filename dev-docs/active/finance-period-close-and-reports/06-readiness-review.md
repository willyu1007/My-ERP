# 06 — Implementation readiness review

Date: 2026-06-16

## Readiness summary
T-006 is ready to enter implementation, **schema/domain-first**, starting with **M3a period close**
(the prerequisite for a correct BS equity section), then M3b CF tagging, M3c report read-model + the
three statements, M3d export. Decisions D1–D5 are frozen. The hard parts are CF tie-out and report
mapping correctness — both want a worked 小企业 fixture before the UI.

Baseline is healthy:
- `pnpm typecheck` passed.
- `pnpm test` passed: 115 tests.
- Governance lint passed with the one existing non-blocking T-001 warning.

Do NOT start with: export, management/dimension reports, DB-configured report mapping, or 往来/
BusinessPartner (T-005).

## Findings

### High priority

1. No period-close mechanism exists; locking is cross-cutting.
Evidence: a period is only a string on `JournalVoucher.period`; `LedgerBook` has `openingPeriod` +
`periodStructure '12+1'` but there is no `AccountingPeriod`/`PeriodClose` table.
Required action (M3a): add `PeriodClose` (+ RLS), and a **period-lock guard** in the voucher service —
reject submit/post/update when the target period is `closed` (this touches `vouchers.controller`, and
must still allow the 结转 voucher itself + 反结账). Draft creation (incl. T-004 capture auto-draft) into
a closed period is allowed; only state-advancing actions are blocked.

2. 结转损益 needs 本年利润 (4103) and 损益类 identification — the seed chart may lack them.
Evidence: grepping the chart seed found no `本年利润`/`4103`/`利润分配`/`4104`.
Required action (M3a): verify the 小企业准则 seed template; add 本年利润 (4103) / 利润分配 (4104) if
missing. 损益类 = `Account.category in (cost, profitLoss)` — confirm the close zeroes exactly those.

3. The posted-entries query omits `cashFlowItem` and isn't range-filtered.
Evidence: `getPostedEntriesTx` selects `voucher{no,date}`, debit/credit, date — **no `cashFlowItem`**;
`PostedLine` has no `cashFlowItem`.
Required action (M3b/M3c): extend `getPostedEntriesTx` + `PostedLine` with `cashFlowItem`; the range
derivation date-filters in-domain (`closingAsOf(to)`, `periodActivity(from,to)`, `cfFlows(from,to)`);
opening for a range = balances as-of `from − 1`.

4. CF tie-out + CF derivation need cash-account identification, but no flag distinguishes cash.
Evidence: `Account.category` is `asset` for 库存现金/银行存款 like any other asset; the seed codes
(1001/1002/1012) were not found in `db/index.ts` (chart data may live elsewhere — confirm).
Required action: a cash-account predicate (code prefix convention 1001/1002/1012/其他货币资金) used by
the tie-out (Σ tagged flows == net change in cash accounts) and the CF statement.

5. Report mapping correctness is the main risk — needs a worked fixture.
Impact: signed sums + netting (应收账款 = 1122 − 1231), IS 净利润, and CF tie-out are easy to get subtly
wrong.
Required action (M3c): build a worked 小企业 example fixture (a few periods of posted vouchers + opening
balances) and assert BS balances (资产 == 负债 + 权益), IS 净利润, and CF tie-out as pure-function tests
before wiring any UI.

### Medium priority

6. CF tagging couples to T-004's `<VoucherFastEntry>`.
Note: the voucher API already accepts `cashFlowItem` per line (OpenAPI `CreateVoucher`/`VoucherLine`),
so the write path mostly exists; confirm `parseLines`/`lineCreateData` persist it. The remaining work is
a **conditional CF-item picker** on non-cash lines (shown when the voucher touches a cash account) in
the recently-built fast-entry/confirm editor, pre-filled from `Account.defaultCashFlowItem`.

7. 结转损益 SoD + period-lock interaction.
The close voucher is system-generated and posted into the period being closed. Required action: an
audited system-close path that bypasses maker≠poster SoD (like single-person mode, but for close) and
is exempt from the period lock for that one voucher.

8. Export tooling (M3d) likely needs a new dependency.
No Excel/PDF util is evident. Required action (M3d only): add an export lib (e.g. exceljs / a PDF
renderer) + a print layout; keep it last.

9. Schema + contract regeneration.
`PeriodClose`/`CashFlowItem` go through `sync-db-schema-from-code` + DB-context regen; report endpoints
are contract-first OpenAPI + api-index; run strict context verify (and `ctl-context touch` after
OpenAPI edits — see T-004 pitfalls).

10. Range/opening off-by-one.
Opening for a range = balances as-of `from − 1`; preset 月/季/年 must resolve boundaries correctly.
Required action: boundary-case tests (first day, year boundary, custom range).

## Non-blocking notes
- The pre-close untagged-cash worklist can start as a plain query view; promote to a T-003 WorkItem later.
- BS direction-reclassification (应收贷方余额 → 预收 等) is deferred; v1 = signed sums + netting.
- DB-configured report mapping (D3) and management/dimension reports (D5) are out of this task.
- Statements are 会计档案 — export/print must be archival-suitable (DP30), but functional derivation comes first.

## Recommended implementation stance
Schema/domain-first:
1. M3a — `PeriodClose` schema + RLS, close-readiness checks, 结转损益 builder + post, period lock,
   反结账; verify/extend the chart for 本年利润.
2. M3b — `CashFlowItem` master + seed, `Account.defaultCashFlowItem`, the non-cash-line CF-item picker
   + auto-suggest, the pre-close worklist, and the tie-out check.
3. M3c — extend posted-entries (+cashFlowItem), range-aware derivation, code-first report-mapping
   templates, BS/IS/CF pure functions (tested vs a worked fixture), report API + range-picker views.
4. M3d — export / print.
5. M3e — verification sweep.

Do not start with export, dimension reports, DB-configured mapping, or 往来/BusinessPartner.
