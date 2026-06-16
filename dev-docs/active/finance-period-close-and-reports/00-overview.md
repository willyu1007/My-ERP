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
- State: planned
- This is the first-draft Decision-Gate bundle. Scope + the key design decisions (CF tagging, report
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

## Open decisions (to align)
- **D1 CF tag target** — tag the cash line vs the non-cash (contra) lines.
- **D2 CF tagging friction** — mandatory at entry vs auto-suggest + pre-close worklist vs deferred.
- **D3 Report mapping representation** — code-first statutory templates vs DB-configured vs hybrid.
- **D4 Period-close coupling** — reports require a closed period vs compute "as-if-closed" at report time.
- **D5 Dimension scope** — statutory three tables only, or also management reports by 部门/项目.

## Pointers
- Requirements: `docs/project/overview/requirements.md` (DP11 三表 · DP14 辅助核算 · 期末结账 · DP30 导出)
- M1 derived ledger: `packages/finance-domain/src/ledger.ts` (`computeTrialBalance`/`computeAccountLedger`)
- Reserved column: `JournalEntryLine.cashFlowItem` (+ `aux`) in `prisma/schema.prisma`
- Root constraints: `AGENTS.md`
- Sibling: `dev-docs/active/finance-contract-transaction-lifecycle/` (T-005, management/per-contract reports)
