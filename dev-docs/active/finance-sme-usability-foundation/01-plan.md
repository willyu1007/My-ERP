# 01 — Plan

## Phases
0. Decision alignment — done 2026-07-05 (D1-D10)
1. BusinessPartner foundation
2. Standard chart v2 and progressive account selection
3. Cashier-to-accountant enrichment
4. Accountant voucher to cashier fund consumption
5. Verification, context sync, and handoff

## Detailed steps

### Phase 0 — Decision alignment (done)
- BusinessPartner roles and individual support. D1 confirmed on 2026-07-05: `partyType + multi-select roles + display-only tags`.
- Optional link to organization membership/user identity. D2 confirmed on 2026-07-05: joined employees are searchable/quick-selectable; non-member individuals are manual entries with explicit confirmation.
- Payment enrichment state and approval position. D3 confirmed on 2026-07-05: cashier simple docs enter accounting enrichment before approval/confirmation, and cashier users do not fill accounting subjects.
- Accountant-created voucher to cashier-consumable flow. D4 confirmed on 2026-07-05: create cashier fund tasks/views linked to voucher lines, without duplicate accounting vouchers.
- Account display preference scope. D5 confirmed on 2026-07-05: ledger default plus personal preference; preferences only affect picker display/ranking.
- Standard chart v2 expansion boundary. D6 confirmed on 2026-07-05: expand common SME second-level accounts as comprehensively as practical; keep counterparties/people in BusinessPartner and auxiliary dimensions.
- Voucher generation timing. D7 confirmed on 2026-07-05: enrichment only updates PaymentDoc; the settlement voucher is generated and posted by the explicit confirm click, as today; enrichment completion never auto-generates.
- Entry-path split. D8 confirmed on 2026-07-05: cashier creation always enters enrichment; accounting-capable roles may fill accounting subjects directly and skip enrichment.
- Partner scope and querying. D9 confirmed on 2026-07-05: BusinessPartner is ledger-scoped v1; payment/contract lists must support partner filters.
- Individual partner entry. D10 confirmed on 2026-07-05: individual partners are entered by the organization; display name lives on the partner record with snapshot semantics; partners are searchable by typed person/company name; individual entry includes an optional WeChat ID contact field.
- Payment UI vocabulary. D11 confirmed on 2026-07-05: cashier-visible action button copy uses business wording (no accounting jargon), and payments list status tabs are simplified/regrouped when the enrichment state lands.

### Phase 1 — BusinessPartner foundation
- Prisma model/migration through the repo-prisma DB SSOT workflow: ledger-scoped `BusinessPartner` with `partyType`, roles, tags, optional member link, optional WeChat ID contact field, active flag; no physical delete (deactivate only).
- Nullable `partnerId` plus counterparty snapshot fields on `PaymentDoc` and `Contract`; existing text-only rows stay readable.
- Repository/service/controller/api-client for partner CRUD/search; search matches person/company names directly; member quick-select search for individuals; explicit confirmation for non-member manual entries.
- Partner filters (`partnerId`) on payment and contract list APIs and web lists (D9).
- Web partner picker/list entry points; org-entered display names (D10).
- Decide the aux-dimension mapping between existing `Account.auxTypes` vocabulary (`customer`/`supplier`) and partner roles during schema design.

### Phase 2 — Standard chart v2 and progressive account selection
- Expand `STANDARD_CHART` to broad common SME second-level coverage (cash/bank, receivables/payables, inventory, fixed assets/depreciation, taxes, payroll/social insurance, loans, owner/shareholder, revenue, cost, period expenses, non-operating).
- Explicit additive import/diff review path for applying v2 to existing ledgers; new ledgers seed v2 directly; no silent mutation.
- Replace hardcoded `isCashAccountCode` (`1001/1002/1012`) with tree/metadata-based cash/bank identification shared by payments and Phase 4 voucher-line detection.
- Rework the account picker to category -> primary account -> leaf/detail progression.
- Ledger-default and personal recent/pinned/hidden display preferences (display/ranking only; hidden accounts stay searchable/selectable).
- Native browser suggestion suppression.
- Existing call-site compatibility: voucher fast-entry, payment forms, ledger filters.

### Phase 3 — Cashier-to-accountant enrichment
- PaymentDoc schema/state changes: nullable account-subject fields at creation; accounting-enrichment state (for example `pending_accounting`) between draft and approval.
- Role-split creation paths per D8: cashier -> business facts only -> enrichment; accounting-capable roles -> direct entry with accounting subjects.
- `payment.enrich` WorkItem assigned to accountants; enrichment completes cash/bank subject, contra subject, auxiliary dimensions, cash-flow item, posting-template decision.
- Service guards: submit/approve/confirm rejected until required accounting fields are complete; SoD, single-person mode, and period lock unchanged.
- Settlement voucher generation unchanged: triggered by the explicit confirm click (D7).
- Web flows: simple cashier entry form (no account fields) and accountant enrichment view.
- Payment surfaces vocabulary per D11: business-facing action button copy (replace jargon such as 「确认收付并过账」 for cashier users) and regrouped/simplified status tabs (currently seven; must not grow to eight with the enrichment state).

### Phase 4 — Accountant voucher to cashier fund consumption
- Detect cash/bank settlement lines on accountant-created posted vouchers using the Phase 2 identification rule.
- Create cashier WorkItems and a fund-consumption view linked to voucher/voucher line.
- Cashier consumption records execution confirmation, attachments, bank-flow references, and reconciliation/settlement status; no second voucher, no duplicate ledger effect.
- WorkItem title/subStatus/action mapping consistent with the kernel and the T-009 `availableActions` rendering pattern.

### Phase 5 — Verification, context sync, and handoff
- `pnpm typecheck`, `pnpm test` (or targeted suites), `pnpm lint`, `pnpm lint:css` for UI/CSS changes.
- `node .ai/scripts/ctl-db-ssot.mjs sync-to-context` after schema changes; refresh API context/api-client.
- Governance: `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` and `lint --check --project main`.
- Live `/v1` smoke only after rebuilding workspace packages and against a fresh DB.
- Keep 00/03/04/05 docs current so the bundle stays handoff-ready.

## Risks & mitigations
- Risk: BusinessPartner becomes a duplicate identity system.
  - Mitigation: keep it finance-owned; use optional identity linkage only for convenience; org-entered display names with snapshot semantics (D10).
- Risk: chart-of-accounts grows uncontrollably.
  - Mitigation: use BusinessPartner and auxiliary dimensions for customers/suppliers/employees.
- Risk: cashier workflow becomes too complex.
  - Mitigation: keep cashier UI simple and move accounting enrichment into accountant WorkItems; accounting-capable roles keep the direct path (D8).
- Risk: changing payment flow breaks existing T-007 behavior.
  - Mitigation: the D8 direct path preserves current behavior for accounting roles; add service integration tests for both paths.
- Risk: hardcoded cash-account list breaks under chart v2 or misses voucher lines in Phase 4.
  - Mitigation: replace with tree/metadata-based identification in Phase 2 and reuse it everywhere.
- Risk: account picker changes regress fast-entry keyboard flow.
  - Mitigation: test voucher fast-entry and ledger controls explicitly.

## Acceptance criteria by phase
- Decision alignment:
  - [x] All open questions in `roadmap.md` are answered or converted into explicit assumptions (D1-D10).
- BusinessPartner (Phase 1 done 2026-07-05):
  - [x] Individual and organization partners can be created, searched, classified, and deactivated.
  - [x] Partners are found by typing a person/company name; individual entry supports an optional WeChat ID.
  - [x] Payment and contract lists can be filtered by partner (`partnerId` param + web filter chip).
  - [x] Existing text-only rows remain readable; snapshots stay stable after partner rename/deactivate.
- Standard chart v2 and account picker:
  - [ ] User can pick a leaf account through progressive selection.
  - [ ] Browser-native suggestion popover no longer appears over the picker.
  - [ ] Broad common SME second-level accounts are available without requiring per-partner account children.
  - [ ] Existing ledgers only receive chart additions through explicit import/diff review.
  - [ ] Cash/bank account identification is tree/metadata-based, not a hardcoded list.
- Cashier-to-accountant enrichment:
  - [ ] Cashier simple doc -> accountant enrichment -> approval/confirmation -> voucher flow works.
  - [ ] Cashier form has no account-subject fields; un-enriched docs cannot be approved/confirmed.
  - [ ] Accounting-capable roles can still enter docs directly with accounting subjects.
  - [ ] Payment action buttons use business wording and the status tabs are simplified per D11.
- Accountant voucher to cashier consumption:
  - [ ] Accountant cash/bank voucher -> cashier consumption flow works and traces to voucher lines.
  - [ ] Consumption never creates a second voucher or duplicate ledger effect.
- Verification:
  - [ ] Typecheck/tests/lint/context/governance checks pass for touched scope.
