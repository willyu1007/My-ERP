# 04 — Verification

## 2026-06-16 — M3a period close

| Check | Command | Result |
|---|---|---|
| Prisma validate | `pnpm prisma validate` | valid |
| Typecheck | `pnpm typecheck` | pass (9 projects) |
| Tests | `pnpm test` | **29 files / 120 tests** (+5: `finance-domain/period-close.test`, `db/period-close.integration`) |
| API index / quality | `ctl-api-index.mjs generate` + `ctl-openapi-quality.mjs verify` | regenerated; passed |
| DB context | `ctl-db-ssot.mjs sync-to-context` + `ctl-context.mjs touch` | updated |

Unit (`buildCloseLossesEntry`): profit → 本年利润 credit; loss → debit; no P&L → empty; balanced.
Integration (`period_close` RLS): close/reopen, ledger isolation, unposted-voucher count.

### Live e2e (real `/v1` + Postgres, fresh `myerp_t006` DB)
Posted a sale (1002/6001 1000) + expense (6601/1002 300), 净利润 700:

| Step | Result |
|---|---|
| `GET /v1/periods/2026-06/readiness` | `canClose=true`, unposted=0, no prior open |
| `POST /v1/periods/2026-06/close` | `status=closed`, `netProfit=700.00`, 结转 voucher created |
| Trial balance after close | **本年利润 (4103) = 700 credit**; **6001 / 6601 zeroed** |
| Period lock — submit into 2026-06 | rejected: *会计期间已结账，请先反结账* |
| `POST /v1/periods/2026-06/reopen` | `status=open`; 4103 back to 0 (结转 红冲'd) |

Proves 结转损益 + period lock + 反结账 end-to-end against a live API.

## 2026-06-16 — M3b (backend) cash-flow tagging

| Check | Result |
|---|---|
| Typecheck | pass (9 projects) |
| Tests | **30 files / 123 tests** (+3: `finance-domain/cash-flow.test` — isCashAccountCode, tie-out, worklist) |
| API index / openapi quality / DB context | regenerated; passed |

### Live e2e (real `/v1`, fresh `myerp_m3b` DB)
| Step | Result |
|---|---|
| `POST /v1/cash-flow-items/seed-standard` | `seeded=15`; account 6001 `defaultCashFlowItem=OP-IN-1` |
| Post tagged sale (6001→OP-IN-1) + untagged sale | both posted |
| `GET /v1/cash-flow/untagged?period=2026-07` | count=1 → 记-2026-07-002 / 6001 / 500 |
| `GET /v1/cash-flow/tie-out` (2026-07) | cashNetChange=1500, taggedFlows=1000, **tied=false** |
| `GET /v1/periods/2026-07/readiness` | `untaggedCashFlowCount=1`, canClose=true (informational) |

Proves the CF item master + seed + auto-suggest defaults + tag persistence + worklist + the tie-out
(CF 借贷必平) end-to-end.

## 2026-06-16 — M3c (backend) statutory reports

| Check | Result |
|---|---|
| Typecheck | pass (9 projects) |
| Tests | **31 files / 126 tests** (+3: `finance-domain/report.test` — BS balances, IS 净利润, CF tie-out) |
| API index / openapi quality / context | regenerated; passed |

### Live e2e (real `/v1`, fresh `myerp_m3c` DB)
Posted capital (50000, FN-IN-1) + sale (1000, OP-IN-1) + expense (300, OP-OUT-4):

| Statement | Result |
|---|---|
| `GET /v1/reports/balance-sheet?to=2026-12-31` | 货币资金 50700 · 实收资本 50000 · 未分配利润 700 · 负债权益总计 50700 · **balanced=true** |
| `GET /v1/reports/income-statement?from&to` | 营业收入 1000 · 销售费用 300 · **净利润 700** |
| `GET /v1/reports/cash-flow?from&to` | 经营 700 · 筹资 50000 · **净增加额 50700 · tied=true** |

The three statements derive correctly, BS balances, and CF ties out — over a date range (月/季/年/custom).

## 2026-06-17 — QA sweep (adversarial)

| Check | Result |
|---|---|
| `prisma migrate status` (fresh DB) | both T-006 migrations apply cleanly |
| Typecheck | pass (9 projects) |
| Lint | clean (fixed `let n` → `const n` in `report.test`) |
| Tests | **31 files / 127 tests** (+1: IS-excludes-结转 regression) |

**HIGH (found + fixed): income statement double-counted the 结转损益 voucher.**
After closing a period, `periodActivity` included the closing voucher's zeroing lines,
so the IS/CF for a closed period showed 营业收入=0 / 净利润=0 (proven live: 2026-03 after
close → 0/0/0 instead of 1000/300/700). Fix: flow statements (IS/CF) take
`excludeVoucherIds`; the reports service computes it from `period_close.closeVoucherId`
**plus that voucher's `reversedBy`** (so the 反结账 reopen window doesn't over-count). BS
(stock, `closingAsOf`) intentionally keeps the closing voucher. Live-verified stable across
closed → reopened → re-closed (IS = 1000/700 in all three). Commit `9fbd2c9`.

**Remaining findings (not blocking, logged):**
- **MED** No service-level automated tests — close/reports/cash-flow orchestration is covered
  only by manual live e2e, not CI. Only finance-domain pure fns + db RLS are in CI.
- **MED/LOW** New report/period/CF DTOs have no zod contracts at the boundary (inconsistent
  with the intake/work-item `*.parse()` pattern; only OpenAPI describes them).
- **LOW** `isCashAccountCode` is a 1001/1002/1012 prefix heuristic — can false-match custom
  codes; a precise cash-account flag would be more robust.
- **LOW** `close`/`reopen` gated by the `post` Voucher permission, not a dedicated `close`
  action.
- **LOW (by design)** 结转 voucher is self-posted (maker==checker, SoD-exempt system close,
  audited `CLOSE_PERIOD`).

## 2026-06-17 — service-level tests + M3c-ui / M3b-ui (web)

| Check | Result |
|---|---|
| Typecheck | pass (api + web) |
| Lint | clean |
| Tests | **32 files / 132 tests** (+5: `reports-close.integration` — service orchestration) |
| OpenAPI quality / api-index / db ssot | regenerated; passed (46 endpoints) |

**Service-level tests (closed the biggest QA gap).** `apps/api/src/reports/reports-close.integration.test`
drives the real PeriodCloseService / ReportsService / CashFlowService against a live Postgres: before close
(IS 1000 / BS balanced / CF tied), close (净利润 700), after close (IS still 1000 — regression, BS keeps the
closing voucher, 未分配利润 stays 700), and the reopen→re-close window. Commit `5ef8a35`.

**M3c-ui + M3a-ui (`feat 7111bb5`).** `/finance/reports` — 资产负债表 / 利润表 / 现金流量表 in tabs with a
月/季/年/自定义 range picker (BS as-of range end; IS/CF over [from,to]); `/finance/period-close` —
close-readiness + 结账 / 反结账 + history. Live-verified (browser + `/v1`, 2026-03 closed): 营业收入 1,000 /
净利润 700, BS balanced, CF tied; all four range modes resolve; period-close shows 已结账 + reopen.

**M3b-ui (`feat f596656` + `ac5d461`).** Entry-time CF picker in fast-entry (auto-suggest from the chart
default on the non-cash lines of a 现金凭证) + post-hoc `POST /v1/cash-flow/tag` (journal_entry_line UPDATE
RLS, closed-period guard, `TAG_CASH_FLOW` audit) as the pre-close worklist. Live-verified in a browser: the
picker pre-fills "销售商品…"; 打标 from the worklist drops 未打标 1 → 0; API guards reject cash account /
unknown item / closed period; tie-out flips false→true after tagging.

## Not yet verified (explicit)
- M3d export (Excel/PDF + print) — next.
- A `close` CASL action (currently gated by `post` Voucher); tagging gated by `update` Voucher.
