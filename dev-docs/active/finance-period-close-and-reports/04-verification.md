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

## Not yet verified (explicit)
- M3b cash-flow tagging + M3c reports (BS/IS/CF) — next phases.
- A `close` CASL action (currently gated by `post` Voucher).
