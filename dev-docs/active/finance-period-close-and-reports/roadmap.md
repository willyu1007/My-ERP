# Roadmap — Finance period close and reports (M3)

## Goal
Deliver the accounting close & reporting layer: period close (结转损益 + locking), cash-flow tagging,
the statutory three statements (BS/IS/CF) via a report read-model + mapping layer, and compliant
export — reusing M1's "derive from posted vouchers, integer-cent, zero float" discipline.

## Input trace
- User goal #3 (reports) + "其他遗留的工作" (leftover accounting MUSTs that reports depend on).
- Repository baseline: M1 GL core + derived ledger (`computeTrialBalance`/`computeAccountLedger`); T-004
  capture pipeline. No period close, no report layer, `cashFlowItem` column reserved but unused.
- Requirements: DP11 (BS/IS/CF, direct-method CF) · 期末结账 (MUST) · DP14 辅助核算 · DP30 导出/打印.

## Core direction
The report layer is a **range-parameterized read model over the authoritative ledger**, not a second
source of truth. Reports take a date range (presets 月/季/年 + custom `[from,to]`):
- **BS** = closing balances **as-of the range end** (report-line ↔ account mapping; signed sums +
  netting, e.g. 应收账款 = 1122 − 1231).
- **IS** = 发生额 **within the range** (by mapping).
- **CF** (direct) = sum of `cashFlowItem`-tagged amounts (on the non-cash lines) **within the range**,
  grouped to statement lines; guarded by a **tie-out** (tagged flows == net change in cash accounts
  over the range).
- **Period close** persists a 结转损益 voucher (损益类 → 本年利润) and locks the period; 反结账 reopens.
  Before close, BS equity shows a computed "本年利润(未结转)"; after close, the persisted 结转.

Range-aware derivation: filter posted vouchers by date (opening for a range = balances as-of
`from − 1`). Same invariants as M1: integer-cent, zero float, derive from posted data, append-only.

## Confirmed decisions (2026-06-16) — see `00-overview` for detail
- **D1** tag the **non-cash (contra) lines**.
- **D2** **auto-suggest** (account→CF-item map via posting template) + **pre-close worklist** +
  **hard tie-out**.
- **D3** **hybrid**: code-first 小企业准则 templates (signed sums + netting); DB custom later.
- **D4** reports run **anytime over 月/季/年/自定义区间**; 本年利润 by close status.
- **D5** **statutory three tables + close + CF only**; 部门/项目 management reports deferred; 往来 → T-005.

## Milestones (proposed; refine after alignment)
- **M3a — Period close**: AccountingPeriod state + close-readiness checks + 结转损益 voucher + locking +
  反结账. Reuses the voucher/ledger transaction discipline.
- **M3b — Cash-flow tagging**: `CashFlowItem` master (seeded standard set) + tagging path (per D1/D2) +
  the CF tie-out check.
- **M3c — Report read-model + statutory three tables**: **range-parameterized** derivation
  (月/季/年/custom `[from,to]`; BS as-of range-end, IS/CF within range) + the report-mapping layer
  (per D3: signed sums + netting) + BS/IS/CF pure functions over the derived ledger + CF tags +
  report views with a period/range picker.
- **M3d — Export / print**: Excel/PDF + print layout for archival (DP30).

## Dependencies
- M1 derived ledger (present). Period close is internal. CF needs the tagging discipline (M3b before
  M3c CF). Management/per-contract reports depend on T-005 (#4) + M2 cashier — out of this task.

## Risks
- CF tagging is the hard part: without discipline, CF can't tie out. Mitigation: auto-suggest + a
  pre-close worklist + a hard tie-out check (the CF analogue of 借贷必平).
- Report mapping correctness (netting, sign, direction) — mitigate with template tests against known
  fixtures (a worked小企业 example), integer-cent.
- Period-close equity coupling — decide D4 up front so BS equity is unambiguous.
- Scope creep into management/dimension reporting — keep statutory core separate (D5).

## Verification strategy
- Governance + context + DB-context commands as standard; `pnpm typecheck`/`test`.
- Pure-function report tests against a worked fixture (BS balances, IS profit, CF ties out); period-
  close transaction + lock tests; CF tie-out tests; `pnpm ui:governance` for report views.

## Deferred / out
- T-004 capture follow-ups (OCR/storage/chat); 往来/BusinessPartner (T-005); bank rec (v1.1);
  multi-currency/tax/consolidation/indirect CF (OUT); voucher import (candidate, later).
