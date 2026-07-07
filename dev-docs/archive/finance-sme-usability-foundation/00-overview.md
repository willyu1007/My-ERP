# 00 — Overview: SME finance usability foundation

## Status
- State: archived
- Phase 0 decision alignment complete: D1-D11 confirmed 2026-07-05.
- Phase 1 (BusinessPartner foundation) implemented and verified 2026-07-05: partner master + partnerId links/filters/snapshots + partners web page + PartnerPicker. See `03`/`04`.
- Phase 2 (standard chart v2 + progressive picker) implemented and verified 2026-07-05: 92-account v2 template (official 小企业会计准则 set, repo code convention), explicit diff/import for existing ledgers, tree-based cash identification, D5 display preferences, progressive 分类→主科目→明细 picker with 常用/收藏/隐藏.
- Phase 3 (cashier-to-accountant enrichment) implemented and verified 2026-07-06: `pending_accounting` state + `payment.enrich` WorkItem; D8 role fork via the `isAccountingCapable` (post-Voucher) predicate + `/v1/me`; FULL D7 enrichment (subjects + contra-line auxiliary dimensions + cash-flow item threaded into the settlement voucher, generated only at confirm); D11 6 who-acts-next tabs + de-jargoned copy. See `03`/`04`.
- Phase 4 (accountant voucher → cashier fund consumption, D4) implemented and verified 2026-07-06: per-cash-line `FundConsumption` row (zero ledger columns) + `fund.consume` cashier WorkItem spawned on `postVoucherReviewTx`; consume records execution (bank-flow ref / attachment / reconciliation) via REST (`/v1/fund-consumptions`) or the workbench `act` path — **never posting a second voucher**; settlement vouchers excluded; reversal voids rows + cancels open tasks; `payment.confirm` realigned to the cashier (`consume`/`FundConsumption` gate, maker≠confirmer SoD preserved); inline `FundConsumptionPanel` on the voucher detail. See `03`/`04`.
- All planned phases (0–4) complete; Phase 5 verification folded into each phase. Bundle is handoff-ready.

## Problem statement
Current My-ERP finance foundations are correct but still expose too much accounting structure to small-business users. Cashier payment entry requires selecting accounting contra accounts, counterparties are plain strings instead of queryable master data, and the shared account picker shows many flat/repeated options with disruptive native input suggestions in some browsers.

Earlier MVP slices intentionally deferred `BusinessPartner`, full fund-account modeling, configurable posting rules, and richer cashier/accountant handoff. This task records the next cross-cutting usability slice so we can align decisions before implementation.

## Goal
Make daily SME finance work easier without weakening accounting safety: support individuals and organizations as BusinessPartners, keep the chart of accounts focused, provide progressive account selection, and let cashier/accountant handoffs carry accounting completion through WorkItems.

## Non-goals
- No code/schema/config changes until the roadmap decisions are aligned.
- No bank/payment gateway integration and no automatic disbursement.
- No physical delete of finance records or accounting archives.
- No direct My-Chat DB access and no financial detail in My-Chat metadata/search/recommendation/forum surfaces.
- No attempt to implement sales/procurement/inventory domains under this finance slice.
- No broad redesign of the entire workbench shell unless needed by the account picker integration.

## Context
- `Account` already supports multi-level hierarchy and leaf-only posting.
- `PaymentDoc.counterparty` and `Contract.counterparty` are currently free-text strings.
- Requirements define 往来单位 / BusinessPartner as v1 master data and auxiliary accounting dimension.
- The current payment create UI asks cashier users to choose both cash account and contra account.
- The current account picker is a single popover grouped by category, but it still flattens detail choices and can trigger browser-native suggestion UI.

## Acceptance criteria (high level)
- [x] The task has aligned decisions for BusinessPartner scope, payment handoff, and account picker UX (D1-D10, 2026-07-05).
- [x] BusinessPartner design supports both companies and individuals, including reimbursement-style individuals (Phase 1).
- [x] Partner links preserve historical counterparty snapshots (Phase 1).
- [x] Account selection follows a progressive category/primary/detail model and avoids chart explosion (Phase 2).
- [x] Customer/supplier/employee distinctions are represented as partner/auxiliary dimensions, not mandatory account children (Phase 1/2).
- [x] Cashier simple entry no longer requires accounting contra account selection (Phase 3).
- [x] Accountant enrichment remains explicit, auditable, and compatible with SoD and period lock (Phase 3).
- [x] Cashier fund consumption records execution without a second voucher or duplicate ledger effect (Phase 4).
- [x] Verification covers RLS, backward compatibility, WorkItem flow, and browser picker behavior (integration + live `/v1` smoke across phases).

## Pointers
- Roadmap: `dev-docs/active/finance-sme-usability-foundation/roadmap.md`
- Prior cashier MVP: `dev-docs/active/finance-cashier-payments/`
- Prior contract MVP: `dev-docs/active/finance-contract-transaction-lifecycle/`
- Prior voucher fast-entry: `dev-docs/active/finance-intake-fast-entry/`
- WorkItem kernel: `dev-docs/active/workflow-task-kernel-finance-pipeline/`
- Root constraints: `AGENTS.md`
