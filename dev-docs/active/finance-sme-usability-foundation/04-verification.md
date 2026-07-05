# 04 — Verification

## Automated checks
- Documentation creation:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Implementation phase checks (to run when code/schema changes start):
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm lint:css` when UI/CSS changes are touched
  - `prisma validate --schema prisma/schema.prisma` or repo script equivalent
  - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context` after schema changes

## Manual smoke checks
- BusinessPartner:
  - Create organization partner and individual reimbursement partner.
  - Quick-select a joined organization employee as an individual partner.
  - Manually enter a non-member individual and verify explicit confirmation is required before save/use.
  - Link partner to payment and contract.
  - Filter payment and contract lists by partner and verify results match linked documents (D9).
  - Verify individual partner creation is org-entered with an org-provided display name; member quick-select only prefills the link (D10).
  - Rename/deactivate partner and verify existing document snapshots remain stable.
- Account picker:
  - Select account through category -> primary -> detail.
  - Verify ledger-default recommended accounts and personal recent/pinned/hidden preferences affect display order/visibility.
  - Verify hidden/less-shown accounts remain searchable/selectable when valid.
  - Verify preferences do not deactivate accounts or bypass leaf-account/posting validation.
  - Verify broad common SME second-level accounts are available through search/progressive selection without overwhelming the first-level category view.
  - Verify customer/supplier/employee choices appear as auxiliary partner fields, not account children.
  - Verify native browser suggestion popover does not appear over the picker.
- Standard chart v2:
  - Verify the v2 template includes common SME second-level accounts across cash/bank, receivable/payable, inventory, fixed assets, taxes, payroll, loans, owner/shareholder, revenue, cost, expenses, and non-operating categories.
  - Verify no per-customer, per-supplier, per-employee, or per-reimbursee accounts are seeded.
  - Verify existing ledgers require explicit import/diff review before receiving chart additions.
- Cashier/accountant flow:
  - Cashier creates simple payment doc without choosing any accounting subjects, including cash/bank and contra account subjects.
  - Accounting-capable role creates a payment doc directly with accounting subjects and skips the enrichment state (D8).
  - Accountant enriches accounting details before approval/confirmation; the settlement voucher is generated and posted only at confirmation (D7).
  - Payment approval/confirmation or voucher generation preserves SoD and period lock.
  - Accountant-created cash/bank voucher produces cashier-consumable work linked to the original voucher line.
  - Cashier consumption records execution evidence/status without creating a second accounting voucher or duplicate ledger effect.

## Rollout / Backout (if applicable)
- Rollout:
  - Additive schema and APIs first.
  - Keep existing text-only payment/contract rendering during transition.
  - Enable new picker and handoff flows after tests and smoke checks.
- Backout:
  - Hide new UI entry points first.
  - Keep nullable partner links unused if needed.
  - Database rollback only through approved migration path.

## Verification log
- 2026-07-04:
  - Task bundle created; no code/schema verification needed yet.
  - Ran `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` -> passed; registered `T-012` and refreshed derived project views. The sync also normalized archived task `T-011` metadata from `done` to `archived`.
  - Ran `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` -> passed with pre-existing warnings on older active/done bundles; no new warning for `finance-sme-usability-foundation`.
- 2026-07-05:
  - D1 alignment recorded: `BusinessPartner` uses `partyType + multi-select roles + display-only tags`; no code/schema verification needed.
  - D2 alignment recorded: individual partners can optionally link to joined organization members; non-member individuals are manual entries with explicit confirmation; no code/schema verification needed.
  - D3 alignment recorded: cashier simple docs enter accountant enrichment before approval/confirmation; cashier users do not fill accounting subjects; no code/schema verification needed.
  - D4 alignment recorded: accountant-created cash/bank vouchers produce linked cashier fund tasks/views, without duplicate accounting vouchers; no code/schema verification needed.
  - D5 alignment recorded: account display preferences use ledger default plus personal preference, and only affect picker display/ranking; no code/schema verification needed.
  - D6 alignment recorded: standard chart v2 should broadly cover common SME second-level accounts while keeping counterparties/people in BusinessPartner and auxiliary dimensions; no code/schema verification needed.
  - Ran `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` -> passed.
  - Ran `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` -> passed with pre-existing warnings on older active/done bundles; no new warning for `finance-sme-usability-foundation`.
  - Re-ran `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` after D3 -> passed.
  - Re-ran `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` after D3 -> passed with the same pre-existing warnings on older active/done bundles; no new warning for `finance-sme-usability-foundation`.
  - Re-ran `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` after D4 -> passed.
  - Re-ran `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` after D4 -> passed with the same pre-existing warnings on older active/done bundles; no new warning for `finance-sme-usability-foundation`.
  - Re-ran `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` after D5 -> passed.
  - Re-ran `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` after D5 -> passed with the same pre-existing warnings on older active/done bundles; no new warning for `finance-sme-usability-foundation`.
  - Re-ran `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` after D6 -> passed.
  - Re-ran `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` after D6 -> passed with the same pre-existing warnings on older active/done bundles; no new warning for `finance-sme-usability-foundation`.
- 2026-07-05 (second alignment round, D7-D10):
  - Code-state review against the repo confirmed: no `BusinessPartner` model exists; `PaymentDoc`/`Contract` counterparty are text-only; `STANDARD_CHART` has ~17 accounts with an idempotent seed endpoint and no import/diff surface; `isCashAccountCode` hardcodes `1001/1002/1012`; `Membership` has no display-name field; WorkItem kernel (`payment.approve`/`payment.confirm`/`voucher.review`) and metadata-only outbox are extension-ready.
  - D7 recorded: settlement voucher stays generated and posted at confirmation; enrichment updates PaymentDoc only.
  - D8 recorded: role-split entry paths — cashier always enters enrichment; accounting-capable roles may enter accounting subjects directly.
  - D9 recorded: BusinessPartner ledger-scoped v1; payment/contract lists gain partner filters.
  - D10 recorded: individual partners are org-entered; display name lives on the partner record with snapshot semantics.
  - Plan restructured into five implementation phases (chart v2 folded into Phase 2; cashier->accountant and accountant->cashier chains split into Phase 3 and Phase 4).
  - Ran `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` -> passed.
  - Ran `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` -> passed; one transient warning about a non-enum `State:` value was introduced and fixed (State line must stay exactly `planned|in-progress|blocked|done`); no remaining warning for `finance-sme-usability-foundation`.
