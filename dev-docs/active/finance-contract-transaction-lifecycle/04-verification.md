# 04 — Verification (contract MVP, T-005)

## Static gate (C4, 2026-06-18)
| Check | Result |
|---|---|
| Prisma validate / migrate (Prisma path) | valid; `contract` migration applies clean |
| Typecheck | pass (all projects) |
| Lint | clean |
| Tests | **39 files / 155 tests** (+ contract domain ×3, contract RLS ×3, contracts service ×3) |
| OpenAPI quality / API index | passed / up-to-date |

## What each phase proved
- **C1** — `Contract` schema + `JournalVoucher.contractId` (+ index) + repos; RLS integration test
  (ledger isolation, version-guarded update, contractId dimension — linked vouchers/payments found,
  unlinked excluded). **QA found + fixed**: `createReversalVoucherTx` dropped `contractId` (a 红冲 fell off
  the contract timeline) — now inherited, asserted by test.
- **C2** — contracts service + `/v1/contracts` (CRUD, auto code `HT-{fiscalYear}-{NNN}`, version-guarded,
  audit) + `contractId` threaded through voucher create/edit + payment create. Live-verified 7/7.
- **C3** — `buildContractTimeline` (pure; contract anchored first, then docs by date — fixes a back-dated
  doc burying the anchor) + `GET /v1/contracts/{id}/timeline` + contract list/create + detail+timeline
  pages + draft→执行中→归档 status actions + 合同 picker on the voucher fast-entry & payment form. Browser-
  verified: a contract anchored a voucher + a payment in one timeline; 启用合同 flipped draft→执行中.
- **C4** — `apps/api/src/contracts/contracts.integration.test`: the real `ContractsService` against
  Postgres — auto code + draft→active→closed (closed terminal, stale version → conflict), type/amount
  validation, and timeline ordering (contract anchored first, then payment 06-12, voucher 06-15).

## Deferred (post-MVP; non-goals of this slice)
- **D2 lifecycle stages** (code-first topology + DB policy spawning role work items) — MVP uses a simple
  `draft|active|closed` status field.
- **Receivable/payable schedule + cash forecast** (roadmap C5).
- **`BusinessPartner` master** — MVP uses a free-text `counterparty`.
- **Contract attachments** via the T-004 intake pipeline.
- Work items in the timeline (MVP timeline = contract event ∪ vouchers ∪ payments).
- Dedicated **`Contract` CASL subject** (MVP reuses `read/create/update` Voucher actions).
- Post-hoc linking from the contract page (MVP links at entry only).
