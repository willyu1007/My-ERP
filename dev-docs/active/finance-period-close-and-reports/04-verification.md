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

## Not yet verified (explicit)
- M3b-ui (editor CF-item picker + tag-posted-line endpoint) and M3c reports (BS/IS/CF) — next.
- A `close` CASL action (currently gated by `post` Voucher).
