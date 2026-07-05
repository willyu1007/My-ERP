# 00 — Overview: SME finance usability foundation

## Status
- State: in-progress
- Phase 0 decision alignment complete: D1-D11 confirmed 2026-07-05.
- Phase 1 (BusinessPartner foundation) implemented and verified 2026-07-05: partner master + partnerId links/filters/snapshots + partners web page + PartnerPicker. See `03`/`04`.
- Next step: Phase 2 — standard chart v2 + progressive account picker + tree/metadata-based cash-account identification + chart import/diff for existing ledgers.

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
- [ ] BusinessPartner design supports both companies and individuals, including reimbursement-style individuals.
- [ ] Partner links preserve historical counterparty snapshots.
- [ ] Account selection follows a progressive category/primary/detail model and avoids chart explosion.
- [ ] Customer/supplier/employee distinctions are represented as partner/auxiliary dimensions, not mandatory account children.
- [ ] Cashier simple entry no longer requires accounting contra account selection.
- [ ] Accountant enrichment remains explicit, auditable, and compatible with SoD and period lock.
- [ ] Verification covers RLS, backward compatibility, WorkItem flow, and browser picker behavior.

## Pointers
- Roadmap: `dev-docs/active/finance-sme-usability-foundation/roadmap.md`
- Prior cashier MVP: `dev-docs/active/finance-cashier-payments/`
- Prior contract MVP: `dev-docs/active/finance-contract-transaction-lifecycle/`
- Prior voucher fast-entry: `dev-docs/active/finance-intake-fast-entry/`
- WorkItem kernel: `dev-docs/active/workflow-task-kernel-finance-pipeline/`
- Root constraints: `AGENTS.md`
