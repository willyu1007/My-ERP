# SME Finance Usability Foundation — Roadmap

## Goal
- Make My-ERP's finance module easier for small businesses by adding a unified BusinessPartner master, reducing cashier-side accounting complexity, and redesigning account selection around progressive category/account/detail choices without causing chart-of-accounts explosion.

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline: `docs/project/overview/requirements.md`, `docs/project/overview/domain-glossary.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > requirements docs > existing dev-docs > model inference
- Repository SSOT output: `dev-docs/active/finance-sme-usability-foundation/roadmap.md`
- Mode fallback used: non-Plan default applied: no

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current discussion | Scope, UX direction, target SME simplicity | highest | Covers BusinessPartner individual compatibility, account picker two-step flow, removal of disruptive native suggestions |
| Requirements docs | `docs/project/overview/requirements.md` | BusinessPartner, auxiliary accounting, cashier/voucher journeys | high | Defines BusinessPartner as v1 master data and auxiliary dimension |
| Glossary | `docs/project/overview/domain-glossary.md` | Terminology for BusinessPartner and auxiliary accounting | high | BusinessPartner includes customers, suppliers, employees |
| Current schema/API/UI | `prisma/schema.prisma`, `apps/api/src/payments/`, `apps/web/src/app/(workbench)/finance/_components/account-picker.tsx` | Current implementation boundaries and likely change areas | high | Current `PaymentDoc.counterparty` and `Contract.counterparty` are strings; account picker is a single popover |
| Existing dev-docs | T-003/T-004/T-005/T-007 bundles | Prior decisions and deferred follow-ups | medium | BusinessPartner and FundAccount were deferred from earlier MVP slices |
| Model inference | N/A | Fill gaps only | lowest | Used only for sequencing and risk framing |

## Non-goals
- Do not implement source/code/schema changes in the planning phase.
- Do not connect bank/payment rails or enable automatic disbursement.
- Do not turn every customer/supplier/employee into a chart-of-accounts child account.
- Do not replace the voucher accounting state machine or bypass debit/credit balance checks.
- Do not rebuild My-Chat identity, notification, mobile, or search/recommendation surfaces inside ERP.
- Do not expose amounts, counterparties, bank details, OCR text, or voucher lines in My-Chat metadata.

## Open questions and assumptions
### Aligned decisions
- D1 (2026-07-05): `BusinessPartner` uses `partyType + roles + tags`.
  - `partyType`: `organization | individual`.
  - `roles`: multi-select system roles used for filtering, default suggestions, and accounting/workflow hints; initial vocabulary: `customer`, `supplier`, `employee`, `reimbursee`, `contractor`, `shareholder`, `other`.
  - `tags`: user-defined labels for display/search only; they must not drive critical accounting or workflow decisions.
  - No mandatory primary kind. The same partner can be both customer and supplier, or both employee and reimbursee, without duplicate partner records.
- D2 (2026-07-05): Individual `BusinessPartner` can optionally link to an organization member, but remains an independent finance master record.
  - Joined organization employees can be searched and quick-selected when creating reimbursement/payment partners.
  - Non-member individuals are allowed as manual entries only, and the UI must require explicit confirmation before saving or using them.
  - The member link is for convenience and de-duplication only; payment/voucher/contract history must rely on partner identity plus immutable counterparty snapshots, not on live membership state.
- D3 (2026-07-05): Cashier-created simple payment docs enter accounting enrichment before approval/confirmation, and cashier users do not fill accounting subjects.
  - Cashier entry captures business facts only: direction/type, date, amount, partner/payment object, purpose/remark, attachments, and optional non-accounting settlement information if available.
  - The cashier UI must not expose chart-of-accounts subject fields, including cash/bank account codes or contra account codes.
  - Accountant enrichment completes all accounting facts: cash/bank account subject, contra account subject, auxiliary dimensions, cash-flow item, and posting-template decision.
  - Posting rules may prefill suggestions for the accountant, but accountant confirmation remains the control point before approval/confirmation and voucher effect.
- D4 (2026-07-05): Accountant-created cash/bank vouchers produce cashier-consumable fund tasks/views, not duplicate accounting vouchers.
  - The accounting voucher remains the accounting source of truth.
  - When a voucher contains a cash/bank settlement line that needs cashier action, the system creates a cashier WorkItem and a fund-consumption view linked to the voucher/voucher line.
  - Cashier users consume the task by confirming payment/receipt execution, supplementing attachments or bank-flow references, and updating reconciliation/settlement status.
  - Consuming the cashier task must not create a second voucher or duplicate ledger effect.
- D5 (2026-07-05): Account display preferences use two layers: ledger default plus personal preference.
  - Ledger default controls common/recommended account display for the small-business team and should be maintained by authorized accounting/admin users.
  - Personal preference controls each user's recent accounts, pinned/favorite accounts, and hidden/less-shown accounts.
  - Preferences only change picker display/ranking; they do not deactivate accounts, change account hierarchy, bypass leaf-account validation, or affect posting legality.
  - The picker should still allow searching/selecting valid accounts that are hidden by preference, subject to normal account active/leaf/permission rules.
- D6 (2026-07-05): Standard chart v2 should expand common SME second-level accounts as comprehensively as practical, while keeping counterparties and people out of the account tree.
  - The v2 template should cover common small-business needs broadly across cash/bank, receivables/payables, inventory, fixed assets/depreciation, taxes, payroll/social insurance, loans, owner/shareholder-related accounts, revenue, cost, period expenses, and non-operating items.
  - Do not create per-customer, per-supplier, per-employee, or per-reimbursee account children. Those remain `BusinessPartner` / auxiliary dimensions.
  - Use the D5 ledger-default and personal display preferences plus progressive picking to keep the UI manageable despite a broader template.
  - Existing ledgers should receive any broad chart expansion through an explicit additive import/diff review path, not silent mutation.
- D7 (2026-07-05): Settlement voucher generation stays at payment confirmation; accountant enrichment only completes PaymentDoc accounting fields.
  - Enrichment updates the payment document (cash/bank subject, contra subject, auxiliary dimensions, cash-flow item, posting-template decision) without creating a voucher draft.
  - The settlement voucher is generated and posted at confirm, matching current T-007 behavior, to keep one simple mental model for small teams.
  - Voucher generation is an explicit user action: after enrichment completes, clicking confirm generates and posts the settlement voucher. Enrichment completion itself never auto-generates a voucher.
  - Service guards must prevent a payment doc from entering approval/confirmation until required accounting fields are complete.
- D8 (2026-07-05): Payment entry paths split by role: cashier-created docs always enter accounting enrichment; accounting-capable roles may fill accounting subjects directly.
  - Cashier creation captures business facts only and always lands in the enrichment state.
  - Accountant/admin creation may complete accounting subjects at entry and skip the enrichment state; this preserves the existing direct path and provides transition compatibility.
  - Which roles are accounting-capable follows existing finance permissions, not new hard-coded role names.
- D9 (2026-07-05): `BusinessPartner` is ledger-scoped in v1 (A1 confirmed), and partner becomes a first-class query dimension.
  - Partner master rows follow the existing ledger RLS pattern.
  - Payment and contract list APIs and web lists must support filtering by partner, in addition to free-text search over counterparty snapshots.
- D10 (2026-07-05): Individual partners are entered and maintained by the organization; the display name lives on the partner record.
  - Individual partner records are created by authorized organization finance users; there is no self-service partner creation.
  - Member quick-select prefills the link (userId/email), but the display name is entered by the organization and stored as partner master data with snapshot semantics; no dependency on live Logto profile data.
  - Non-member individuals continue to require explicit confirmation per D2.
  - Partner search matches typed person/company names directly; org-entered individuals must be findable by name.
  - Individual partner entry includes an optional WeChat ID (微信号) contact field. Contact fields are display/search-only PII: ledger-scoped, never driving accounting/workflow logic, never exposed in outbox metadata.
- D11 (2026-07-05): Payment workbench vocabulary is simplified for SME users: action button copy and status tab categories.
  - Action button copy uses business-facing wording for cashier-visible actions instead of accounting jargon (current labels such as 「确认收付并过账」 expose posting concepts to cashier users).
  - The payments list status tabs (currently seven: 待处理/草稿/待审批/待确认/已确认/已作废/全部) must be simplified/regrouped when the enrichment state lands, not grown to eight; group around who acts next rather than raw status values.
  - Exact copy and grouping are decided during Phase 3 UI work; the accounting state machine itself is unchanged by wording.
- Phase 3 implementation refinements (2026-07-06, confirmed during build):
  - D7 scope: FULL enrichment now — the accountant fills cash/bank + contra subjects, the contra line's auxiliary dimensions, and the cash-flow item; all thread into the settlement voucher's contra (non-cash) line at confirm. "Posting-template decision" has no DP28 posting-rule engine to bind to yet, so it resolves to the explicit enrich confirmation; the settlement template is direction-driven.
  - Enrich advances directly to `pending_approval` (opening the approve WorkItem), not back to `draft` — faithful to D3's create→enrich→approval flow and the task-driven hand-off principle.
  - D8 capability is the `post Voucher` CASL right, surfaced to the web via `/v1/me.accountingCapable`; no role-name hardcoding, no CASL matrix change.
  - Confirm-actor tension (the `payment.confirm` WorkItem is queued to cashier but confirm needs post-Voucher rights) is pre-existing and deferred to Phase 4 (D4); Phase 3 only softened the button copy.
  - D11 concrete result: 6 who-acts-next tabs (待办/待补录/待审批/待确认/已完成/全部) and `确认收付并过账` → `确认收付`.

### Open questions (answer before execution)
- None for Phase 0 product alignment. Implementation details such as exact account codes, migration shape, and rollout switches are handled in design/implementation.

### Assumptions (if unanswered)
- A1: `BusinessPartner` is ledger-scoped for v1, matching existing finance tables and RLS. Risk: medium if future org-wide partners are required.
- A2: Historical documents keep counterparty snapshots even when linked to a partner master. Risk: low; needed for audit stability.
- A3: Account picker preferences are display-only; stopping/hiding a visible account is not the same as deactivating the account. Risk: low.
- A4: The first execution slice should build partner master + account selection UX before changing settlement posting behavior. Risk: medium; cashier workflow may still feel heavy until handoff changes land.

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | Payment object naming | User says "付款对象"; requirements say "往来单位" | Use `BusinessPartner` / 往来单位 as the master; label it as payment/receipt object in cashier UI | Requirements + user need; broader model avoids duplicate masters | D1/D2 confirmed |
| C2 | Account hierarchy | User wants一级+二级 selection; hard constraint avoids科目爆炸 | Use account hierarchy for accounting categories/details, and BusinessPartner for customers/suppliers/employees | User-confirmed UX + accounting design | D6 confirmed; exact code list during implementation |
| C3 | Cashier complexity | Current T-007 requires cash and contra account subjects; user wants simple cashier forms | Move all accounting subject completion to accountant enrichment; posting rules can only prefill accountant-reviewed suggestions | Latest user-confirmed SME simplicity | D3 confirmed |
| C5 | Accountant voucher consumed by cashier | User wants accountant-created voucher -> cashier directly consumes; duplicate PaymentDoc could duplicate accounting effect | Create cashier WorkItem/fund-consumption view linked to voucher lines; no second accounting voucher | Accounting source-of-truth and anti-duplication requirement | D4 confirmed |
| C6 | Account display preferences | Need shared SME simplicity and individual usage habits | Use ledger default plus personal preference; preference changes picker ranking/visibility only | User-confirmed UX + accounting safety | D5 confirmed |
| C4 | Account picker hints | Current input can trigger disruptive browser suggestions | Disable native autocomplete/suggestions and keep only ERP-owned suggestions | Latest user-confirmed UI feedback | Implement in picker slice |
| C7 | Standard chart breadth | Minimal template reduces noise; user wants common accounts expanded as fully as possible | Build a broad common SME second-level template, controlled by picker preferences rather than by omitting common accounts | Latest user-confirmed SME usability | D6 confirmed |

## Scope and impact
- Affected areas/modules:
  - Finance master data: BusinessPartner / 往来单位
  - Cashier payments: `PaymentDoc` creation/enrichment/confirmation
  - Voucher fast entry: auxiliary partner dimension and account picker flow
  - Account picker shared UI and display preference model
  - WorkItem task flow between cashier/accountant/supervisor
- External interfaces/APIs:
  - New partner CRUD/search APIs are likely.
  - Existing payment and contract APIs likely gain `partnerId` while preserving text snapshots; their list endpoints gain partner filter parameters (D9).
  - WorkItem title/substatus vocabulary may gain accounting-enrichment tasks.
- Data/storage impact:
  - Prisma migration required for `BusinessPartner` and link columns/snapshots.
  - Account picker preferences likely need ledger-default and personal-preference storage, either as a dedicated table or scoped settings model.
  - Existing rows need nullable fields and backward-compatible string snapshots.
- Backward compatibility:
  - Existing `counterparty` text must remain readable.
  - Existing payment/contract timelines must keep working before and after partner migration.
  - Posted vouchers remain append-only; no historical mutation beyond additive links/snapshots.

## Consistency baseline for dual artifacts (if applicable)
- [x] Goal is semantically aligned with current user discussion
- [x] Boundaries/non-goals are aligned with root hard constraints
- [x] Constraints are aligned with requirements and existing task bundles
- [x] Milestones/phases ordering is aligned with likely implementation dependency
- [x] Acceptance criteria are aligned with SME usability and accounting safety
- Intentional divergences:
  - The roadmap intentionally broadens "付款对象" into `BusinessPartner` because repo requirements define 往来单位 as shared master data.

## Project structure change preview (may be empty)
This section is a **non-binding, early hypothesis** to help humans confirm expected project-structure impact.

### Existing areas likely to change (may be empty)
- Modify:
  - `prisma/`
  - `packages/db/`
  - `packages/platform/`
  - `packages/finance-domain/`
  - `packages/api-client/`
  - `apps/api/src/`
  - `apps/web/src/app/(workbench)/finance/`
  - `apps/web/src/lib/finance/`
  - `docs/context/`
- Delete:
  - (none)
- Move/Rename:
  - (none)

### New additions (landing points) (may be empty)
- New module(s) (preferred):
  - `apps/api/src/business-partners/` or equivalent finance master-data module
- New interface(s)/API(s) (when relevant):
  - `/v1/business-partners`
  - Optional payment enrichment endpoint(s)
- New file(s) (optional):
  - `<TBD>` after alignment

## Phases
1. **Phase 0: Decision alignment** — done 2026-07-05 (D1-D10)
   - Deliverable: accepted decisions for BusinessPartner scope, payment handoff states, and account picker behavior.
   - Acceptance criteria: open questions answered and synced into this bundle.
2. **Phase 1: BusinessPartner foundation**
   - Deliverable: ledger-scoped partner master with individual/company compatibility, search/classification, snapshot-safe links, and partner filters on payment/contract queries.
   - Acceptance criteria: payments/contracts can link to partners and be filtered by partner without breaking existing text-only rows.
3. **Phase 2: Standard chart v2 and progressive account selection**
   - Deliverable: broad SME second-level chart template with an explicit import/diff path for existing ledgers; two-step account picker with category/primary account/detail selection and display preferences; tree/metadata-based cash-account identification; no disruptive native suggestion popover.
   - Acceptance criteria: users can select final postable leaf accounts faster while partner/customer dimensions stay outside the chart hierarchy; existing ledgers only change through reviewed import; cash/bank detection no longer relies on a hardcoded code list.
4. **Phase 3: Cashier-to-accountant enrichment**
   - Deliverable: cashier simple docs without accounting subjects; accounting-enrichment state and `payment.enrich` WorkItem; role-split entry paths per D8; voucher generation unchanged at confirm per D7; SME-friendly action copy and simplified status tabs on payment surfaces per D11.
   - Acceptance criteria: cashier UI has no account-subject fields; un-enriched docs cannot be approved/confirmed; direct entry still works for accounting-capable roles; payment tabs/buttons read as business actions, not accounting jargon.
5. **Phase 4: Accountant voucher to cashier fund consumption**
   - Deliverable: cashier WorkItems/fund-consumption views derived from cash/bank voucher lines; execution/attachment/reconciliation updates without second vouchers.
   - Acceptance criteria: fund tasks trace to voucher/voucher line; no duplicate ledger effect; both chains work through WorkItem without a hard-coded linear pipeline.
6. **Phase 5: Verification, context sync, and closeout**
   - Deliverable: updated docs/context, OpenAPI/api-client, tests, and live smoke evidence.
   - Acceptance criteria: accounting invariants, RLS, SoD, period lock, and metadata-only outbox stay intact; the bundle is handoff-ready.

## Step-by-step plan (phased)
> Keep each step small, verifiable, and reversible.

### Phase 0 — Discovery and decision alignment
- Objective: lock down scope before schema/API work.
- Deliverables:
  - Decision log for partner roles, personal partner linkage, payment enrichment state, voucher-to-cashier consumption, account preference scope, and template v2 boundaries.
  - Updated `01-plan.md` and `02-architecture.md`.
- Verification:
  - User confirms D1-D6 decisions in chat.
  - Governance sync/lint sees the task bundle.
- Rollback:
  - N/A (documentation only).

### Phase 1 — BusinessPartner master
- Objective: replace free-text-only counterparties with queryable, classifiable, snapshot-safe partner records.
- Deliverables:
  - Additive Prisma model/migration for partner master and nullable links, including optional WeChat ID contact field for individuals.
  - Repository/service/controller/API-client support; search matches person/company names directly.
  - Web picker/list entry points for partners.
- Verification:
  - Prisma validate/migrate status in approved DB workflow.
  - RLS integration test for partner isolation.
  - API tests for create/search/update/deactivate.
  - Backward compatibility test for existing text-only payments/contracts.
- Rollback:
  - Disable UI links to partner master; keep nullable columns unused. Migration rollback requires DB approval.

### Phase 2 — Progressive account picker
- Objective: preserve the good first-level classified choice while making detail selection less noisy.
- Deliverables:
  - Shared account picker model for category -> primary account -> leaf/detail.
  - Display preference design for recent/common/hidden accounts.
  - Native autocomplete/suggestion suppression.
  - Payment/voucher/ledger picker call sites updated where appropriate.
- Verification:
  - Component tests or targeted UI smoke for picker flows.
  - Browser check confirms no disruptive native black suggestion popover.
  - Existing voucher fast-entry and ledger controls still select valid leaf accounts.
- Rollback:
  - Keep old picker behind a small component-level fallback until the new picker is verified.

### Phase 3 — Cashier-to-accountant enrichment
- Objective: make cashier forms simple while keeping accounting completion explicit and auditable.
- Deliverables:
  - PaymentDoc state/API changes for accounting enrichment (nullable account-subject fields plus completion guards).
  - Role-split creation paths per D8: cashier -> enrichment state; accounting-capable roles -> direct entry.
  - `payment.enrich` WorkItem for accountants.
  - Web flows for simple cashier entry and accountant enrichment.
  - Settlement voucher generation unchanged: generated and posted by the explicit confirm click per D7.
  - Payment action button copy and status tab regrouping per D11.
- Verification:
  - Service integration tests: cashier simple doc -> accountant enrichment -> approval/confirmation -> voucher.
  - Un-enriched docs are rejected at submit/approve/confirm.
  - SoD and single-person mode tests remain explicit.
  - Period lock rejects invalid transitions.
- Rollback:
  - The D8 direct path is the built-in fallback; cashier simple entry can be hidden without touching enriched data.

### Phase 4 — Accountant voucher to cashier consumption
- Objective: give cashier users an operational fund queue from accountant-created cash/bank vouchers without duplicate accounting.
- Deliverables:
  - Cash/bank line detection on posted vouchers, using the Phase 2 account identification (not a hardcoded code list).
  - Cashier WorkItem plus fund-consumption view linked to the voucher and voucher line.
  - Execution/attachment/bank-flow-reference/reconciliation status updates without second vouchers.
- Verification:
  - Service integration tests: accountant cash/bank voucher -> cashier consume/confirm.
  - No duplicate ledger effect; WorkItem permissions, state flow, and audit trail complete.
- Rollback:
  - Disable fund-task creation; vouchers remain the accounting source of truth.

### Phase 5 — Context, governance, and live smoke
- Objective: make the change durable and recoverable across sessions.
- Deliverables:
  - Refreshed DB context and API context.
  - Updated task docs, verification log, and pitfalls if any.
  - Browser/API smoke evidence.
- Verification:
  - `pnpm typecheck`
  - `pnpm test` or targeted suites agreed during implementation
  - `pnpm lint` / `pnpm lint:css` where UI is touched
  - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context` after schema changes
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - Live `/v1` smoke only after rebuilding workspace packages and against a fresh DB (stale package dist has broken live runs before).
- Rollback:
  - Revert UI route exposure first; DB rollback only through approved migration path.

## Verification and acceptance criteria
- Build/typecheck:
  - `pnpm typecheck`
- Automated tests:
  - Partner RLS/repository tests
  - Payment service integration tests
  - Account picker component or focused UI tests
  - WorkItem action/visibility tests for new task types
- Manual checks:
  - Create individual reimbursement partner and use it in a payment doc.
  - Create company partner and use it in contract/payment flows.
  - Select an account through category -> primary -> detail without duplicate/noisy options.
  - Confirm browser native input suggestions do not appear over the account picker.
  - Drive both cashier-to-accountant and accountant-to-cashier flows in the web app.
- Acceptance criteria:
  - BusinessPartner supports both organizations and individuals.
  - Payments/contracts can be queried and classified by partner.
  - Customer/supplier/employee detail does not explode the chart of accounts.
  - Cashier no longer needs to choose contra accounting accounts in the simple path.
  - Accountant can complete accounting details before voucher effect.
  - My-Chat/outbox remains metadata-only.
  - Posted accounting remains append-only and balanced.

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| Partner model duplicates Logto identity | med | med | Keep `BusinessPartner` finance-owned; optional identity link only | Review schema/API before migration | Remove/ignore optional link |
| Account hierarchy still grows too large | med | high | Use BusinessPartner/auxiliary dimensions for people/entities; keep chart focused on accounting categories | Seed/template review; UX smoke | Revert template expansion |
| Payment flow becomes too many states | med | med | Add only states that map to real role handoff; keep WorkItem for user-facing queues | Service tests and UX walkthrough | Keep old direct confirm path temporarily |
| Historical documents drift when partner names change | med | high | Store counterparty snapshots on documents | Tests updating partner after doc creation | Keep rendering snapshot |
| Native browser suggestions keep appearing | med | low | Suppress autocomplete and verify in browser | Playwright/manual browser check | Use non-text trigger/button plus controlled search input |
| RLS gaps in new master data | low | high | Follow existing ledger-scoped repository/RLS test pattern | RLS integration tests | Do not expose partner UI/API until fixed |

## Optional detailed documentation layout (convention)
The task uses the standard detailed bundle:

```
dev-docs/active/finance-sme-usability-foundation/
  roadmap.md
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

## To-dos
- [x] Confirm BusinessPartner role model and individual/member linkage. (D1/D2; org-entered individuals per D10)
- [x] Confirm payment enrichment state and where approval sits. (D3; voucher timing per D7; role-split paths per D8)
- [x] Confirm account display preference scope. (D5)
- [x] Confirm standard chart v2 expansion boundaries. (D6)
- [x] Confirm whether first implementation slice should start with BusinessPartner or account picker UX. (BusinessPartner first; five implementation phases confirmed 2026-07-05)
