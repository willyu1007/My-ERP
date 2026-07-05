# 02 — Architecture

## Context & current state
- `Account` is ledger-scoped and already supports `parentCode`, `level`, `isLeaf`, and `auxTypes`; only leaf accounts can carry postings.
- `PaymentDoc` is ledger-scoped and currently stores `counterparty`, `cashAccountCode`, and `contraAccountCode` as required creation-time fields.
- `Contract` currently stores a free-text `counterparty`.
- WorkItem is the role-handoff layer; source entities remain business-state source of truth.
- Outbox payloads must stay metadata-only.

## Proposed design

### Components / modules
- BusinessPartner master data:
  - Finance-owned, ledger-scoped v1 master.
  - Supports `partyType=organization|individual`.
  - Supports multi-select roles such as customer, supplier, employee, reimbursee, contractor, shareholder, other.
  - Does not require a primary kind; one partner may carry multiple roles without duplicate records.
  - Supports display/search tags separately from system roles. Tags must not drive critical accounting or workflow decisions.
  - Supports an optional organization-member link for individuals. Joined employees can be searched and quick-selected; non-member individuals are manual entries only and require explicit confirmation before save/use.
  - The member link is not required and must not make finance history depend on live identity or membership state.
  - Individual partners are entered by authorized organization finance users (D10); there is no self-service creation. Membership carries no display name, so the partner display name is entered by the organization and stored on the partner record with snapshot semantics; member quick-select only prefills the link (userId/email).
  - Partner is a first-class query dimension (D9): payment and contract list APIs and web lists support filtering by `partnerId`, alongside free-text search over counterparty snapshots.
- Payment/cashier flow:
  - Cashier simple entry captures business facts only: direction/type, date, amount, partner/payment object, purpose/remark, attachments, and optional non-accounting settlement information if available.
  - Cashier UI must not expose chart-of-accounts subject fields. This includes both cash/bank account codes and contra account codes.
  - Accountant enrichment completes accounting facts: cash/bank account subject, contra account subject, cash-flow item, auxiliary dimensions, and posting-template decision.
  - Suggested posting rules may prefill accountant-facing fields, but accountant confirmation is required before approval/confirmation and voucher effect.
  - Cashier-created docs should flow through an accounting-enrichment state, then approval/confirmation only after required accounting fields are complete.
  - Entry paths split by role (D8): cashier creation always enters the enrichment state; accounting-capable roles (per existing finance permissions) may complete accounting subjects at creation and skip enrichment. This keeps the current direct path alive for accountant-entered docs and provides transition compatibility.
  - Voucher timing (D7): enrichment only updates PaymentDoc accounting fields; the settlement voucher is still generated and posted at confirmation, exactly as today. No voucher drafts are created at enrichment.
  - `PaymentDoc.cashAccountCode` / `contraAccountCode` become nullable at creation for the cashier path; service-level guards block submit/approve/confirm until required accounting fields are complete.
- Accountant voucher to cashier consumption:
  - Accountant-created vouchers remain the accounting source of truth.
  - Cash/bank voucher lines that require cashier action produce cashier WorkItems and fund-consumption views linked back to the voucher and line.
  - Cashier consumption records execution evidence, attachment/bank-flow references, and settlement/reconciliation status.
  - Cashier consumption must not create another accounting voucher or duplicate ledger effect.
- Account picker:
  - Progressive model: category -> primary account -> leaf/detail account.
  - Auxiliary dimensions appear after relevant accounts, not as chart children.
  - Display preferences have two layers: ledger default for team-level recommended/common accounts, and personal preference for recent, pinned/favorite, and hidden/less-shown accounts.
  - Display preferences affect picker ranking/visibility only. They are separate from account active/deactivate state, account hierarchy, leaf-account validation, and posting legality.
  - Hidden/less-shown accounts must remain searchable/selectable when the account is otherwise valid and the user has permission.
- Standard chart v2:
  - Seed a broad common SME second-level chart instead of a minimal bank/tax-only expansion.
  - Coverage should include common cash/bank, receivable/payable, inventory, fixed asset/depreciation, tax, payroll/social insurance, loan, owner/shareholder, revenue, cost, period expense, and non-operating categories.
  - Customer, supplier, employee, reimbursee, and other counterparty/person details remain partner/auxiliary dimensions, not account children.
  - Existing ledgers should use explicit additive import/diff review for chart expansion; do not silently mutate live ledgers.
  - Cash/bank account identification must move from the current hardcoded `1001/1002/1012` code list (`isCashAccountCode`) to tree/metadata-based detection, so chart v2 bank/other-monetary subaccounts stay correct and Phase 4 voucher-line detection can reuse the same rule.

### Interfaces & contracts
- API endpoints:
  - Likely new: `GET/POST/PATCH /v1/business-partners`
  - Partner creation/search should support two sources for individual partners: organization-member search for joined employees, and confirmed manual input for non-members.
  - Likely updated: payment and contract create/update/detail schemas include `partnerId` plus counterparty snapshot; list endpoints gain `partnerId` filter parameters (D9).
  - Payment simple-create schema should not require account subject codes from cashier users.
  - Likely new: payment accounting-enrichment action endpoint that sets required account subjects and auxiliary dimensions.
  - Likely new or updated: account preference read/write endpoints for ledger defaults and personal picker preferences.
  - Likely new or updated: chart template import/diff surface for standard chart v2.
- Data models / schemas:
  - `BusinessPartner`
  - Optional member/user link field for individual partners, exact field name TBD during schema design.
  - Nullable `partnerId` on `PaymentDoc` and `Contract`
  - Snapshot text fields on payment/contract documents
  - Payment account-subject fields may need to be nullable until accounting enrichment is complete, with service-level guards preventing approval/confirmation before completion.
  - Account display preference storage for ledger defaults and personal preference overrides, exact table/settings shape TBD during schema design.
  - Standard chart v2 can live in code seed data, but existing-ledger adoption needs an explicit additive migration/import path with auditability.
- Events / jobs:
  - New WorkItem types may be needed:
    - `payment.enrich`
    - `payment.confirm`
    - cashier consumption task for accountant-originated cash/bank voucher lines
  - Outbox events still carry only safe task metadata and deep links.

### Boundaries & dependency rules
- Allowed dependencies:
  - API/service layer may orchestrate repositories and WorkItem creation inside transactions.
  - Repositories return domain entities; business layer must not import Prisma directly.
  - Web components consume data-source/API-client contracts, not Prisma shapes.
- Forbidden dependencies:
  - No business-layer Prisma imports.
  - No direct My-Chat DB access.
  - No financial details in outbox metadata.
  - No physical delete of accounting documents, partner-linked historical documents, or accounting archives.

## Data migration (if applicable)
- Migration steps:
  - Add BusinessPartner table with ledger RLS.
  - Add nullable partner links and snapshot fields where aligned.
  - Backfill optional partner links only when deterministic; otherwise preserve text-only rows.
- Backward compatibility strategy:
  - Existing `counterparty` display continues to work.
  - New UI can show linked partner when present and snapshot otherwise.
  - API response includes both link and snapshot during transition.
- Rollout plan:
  - First expose partner master behind additive APIs/UI.
  - Then update payment/contract entry to use partner picker.
  - Then update accountant enrichment and voucher auxiliary linking.
  - Apply standard chart v2 automatically only for newly created ledgers; existing ledgers require explicit review/import.

## Non-functional considerations
- Security/auth/permissions:
  - Partner rows are finance data and must be ledger-scoped with RLS.
  - Partner PII must be treated as sensitive; individuals may represent employees/reimbursees.
- Performance:
  - Partner and account pickers need search/indexing by normalized name/code/role.
  - Account display preferences should not require loading entire unrelated history.
- Observability:
  - Audit partner creation/update/deactivation and payment enrichment transitions.
  - WorkItem transitions already provide role-handoff history.

## Open questions
- Resolved 2026-07-05 (D9): BusinessPartner is ledger-scoped in v1; partner filtering on payment/contract queries is in scope.
- Resolved 2026-07-05 (D7): accountant enrichment updates PaymentDoc only; the settlement voucher is generated and posted at confirmation, as today.
- Remaining implementation detail: the exact standard chart v2 account-code list is defined during Phase 2 within existing code conventions.
