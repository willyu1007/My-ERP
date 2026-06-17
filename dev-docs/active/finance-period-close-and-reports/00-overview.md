# 00 — Overview: Finance period close and reports (M3)

## Problem statement
M1 delivered the general-ledger core (科目 → 制单 → 审核 → 过账 → 派生账簿 → 期初建账), and T-004 added
capture-first fast-entry. The remaining **accounting close & reporting** MUSTs are not built:
- **期末结账 / 反结账 + 结转损益** (period close) — a cross-cutting MUST and a prerequisite for a correct
  balance sheet (equity / 本年利润).
- **财务报表：资产负债表 / 利润表 / 现金流量表** (DP11, MUST). No report layer exists.
- **现金流量项目 (CashFlowItem) + 打标** — the direct-method cash flow statement cannot be derived from
  account balances alone; it needs cash-flow tagging. The schema already has an unused
  `JournalEntryLine.cashFlowItem` column reserved for this.
- **导出 / 打印归档** (DP30, the reports part) — statements are 会计档案 (10yr / 永久 retention).

This task ("M3") consolidates #3 (reports) and the closely-related leftover accounting work that
reports depend on.

## Status
- State: done
- Closed 2026-06-17 — M3a–M3d shipped + M3e final sweep green (135 tests; 19/19 fresh-DB e2e). Deferred
  follow-ups (non-blocking, logged in `04`): zod contracts on the new DTOs; dedicated `close` / `tag` CASL
  actions (currently `post` / `update`); the `isCashAccountCode` prefix heuristic; voucher import (DP30
  import) and Excel/PDF via a library (today: CSV + browser print) — later phases.
- **M3a (period close) done** (2026-06-16): `PeriodClose` schema + ledger RLS, 结转损益 builder,
  close/reopen service + `/v1/periods` API, period-lock guard; 本年利润 (4103) added to the chart.
  Verified by unit + RLS integration tests + a live e2e (close → 结转 → lock → reopen). See `03`/`04`.
- **M3b (backend) done** (2026-06-16): `CashFlowItem` master + seed + `Account.defaultCashFlowItem`,
  cash-flow tie-out + pre-close worklist + `/v1/cash-flow*` API; readiness gained `untaggedCashFlowCount`.
  Verified by unit tests + a live e2e (seed → tag → worklist → tie-out).
- **M3c (backend) done** (2026-06-16): range-parameterized report read-model (BS/IS/CF) in
  `finance-domain` + `/v1/reports/*` API. BS balances, IS 净利润, CF ties out — live-verified.
- **M3a/M3c-ui done** (2026-06-17): `/finance/reports` (资产负债表/利润表/现金流量表 in tabs with a
  月/季/年/自定义 range picker) and `/finance/period-close` (close-readiness, 结账/反结账, close history).
  api-client + data-source cut over to the real `/v1`. Live-verified end-to-end (browser + `/v1`).
- **M3b-ui done** (2026-06-17): entry-time CF picker in fast-entry (auto-suggest from the chart default,
  on the non-cash lines of 现金凭证) + post-hoc `POST /v1/cash-flow/tag` (journal_entry_line UPDATE RLS,
  closed-period guard, `TAG_CASH_FLOW` audit) surfaced as the pre-close worklist. Live-verified in a browser
  (picker pre-fills; 打标 drops 未打标 1 → 0; tie-out flips to true).
- **M3d done** (2026-06-17): 导出 Excel (combined CSV, UTF-8 BOM) on `/finance/reports` + a bare
  `/print/reports` archival view (three tables stacked, no workbench chrome) → browser 打印 / 另存为 PDF.
  Dependency-free (no xlsx/pdf lib). Live-verified (browser): CSV downloads with all three statements
  correct; print page renders balanced/ tied. Unit test for the CSV builders.
  Next: **M3e** (final verification sweep) → close the bundle.
- Decisions aligned 2026-06-16 (see Confirmed decisions); readiness review in `06`.
- (history) first-draft Decision-Gate bundle. The key design decisions (CF tagging, report
  mapping, period-close coupling) are to be aligned with the user before implementation.

## Goal
Reusing M1's derived-ledger discipline (`computeTrialBalance` / `computeAccountLedger`, integer-cent,
zero float, derive from posted vouchers):
- **Period close**: 结转损益 → 本年利润; period locking + 反结账; close-readiness checks (all vouchers
  posted, balanced).
- **Cash flow tagging**: a `CashFlowItem` master + tagging on cash-involved vouchers + a CF tie-out
  check (tagged flows == net cash change).
- **Statutory reports**: a report **read-model + mapping layer** producing 资产负债表 / 利润表 /
  现金流量表 from the ledger + CF tags.
- **Export / print**: Excel/PDF + print layout for archival.

## Non-goals (proposed — confirm at alignment)
- T-004 capture-pipeline follow-ups (real OCR, object-storage backend, chat inbound) — separate lineage.
- Auxiliary accounting 往来 (BusinessPartner) → T-005; management / per-contract reports → depend on
  #4 (T-005) + M2 cashier. (部门/项目 dimension reporting is a candidate extension — see decisions.)
- Bank reconciliation (v1.1); multi-currency, tax filing, consolidation, indirect-method CF (OUT).
- Voucher import (DP30 import) — candidate, likely a later phase.

## Confirmed decisions (2026-06-16 alignment)
- **D1 CF tag target** — tag the **non-cash (contra) lines** (`JournalEntryLine.cashFlowItem`); a single
  cash line can't carry multiple CF natures, and contra-line tagging splits multi-purpose vouchers
  correctly (industry standard).
- **D2 CF tagging friction** — **auto-suggest + pre-close worklist + tie-out**: an account→CF-item map
  (the posting template sets it) pre-fills, editable; a pre-close "untagged cash flows" worklist; and a
  **hard tie-out** (tagged flows == net change in cash accounts) — the CF analogue of 借贷必平. Does not
  slow entry (preserves T-004 #1).
- **D3 Report mapping** — **hybrid**: ship 小企业准则 statutory templates **code-first** (signed sums +
  netting), with DB custom/override later (matches the platform D2 philosophy).
- **D4 Period-close coupling + reporting periods** — reports run **anytime over flexible periods:
  monthly / quarterly / yearly / custom `[from,to]` range**. BS = closing balances **as-of the range
  end**; IS / CF = 发生额 / tagged flows **within the range**. 本年利润 reflects the persisted 结转损益
  after close; before close it shows a computed "本年利润(未结转)" line.
- **D5 Dimension scope** — **statutory three tables + period close + CF only**. Management reports by
  部门/项目 → deferred (after #4/M2); 往来 → T-005.

## Pointers
- Requirements: `docs/project/overview/requirements.md` (DP11 三表 · DP14 辅助核算 · 期末结账 · DP30 导出)
- M1 derived ledger: `packages/finance-domain/src/ledger.ts` (`computeTrialBalance`/`computeAccountLedger`)
- Reserved column: `JournalEntryLine.cashFlowItem` (+ `aux`) in `prisma/schema.prisma`
- Root constraints: `AGENTS.md`
- Sibling: `dev-docs/active/finance-contract-transaction-lifecycle/` (T-005, management/per-contract reports)
