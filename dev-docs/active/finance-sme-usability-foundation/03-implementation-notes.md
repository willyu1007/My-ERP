# 03 — Implementation Notes

## Status
- Current status: `in-progress` — Phases 1-3 implemented and verified; Phase 4 (accountant voucher → cashier fund consumption, D4) next.
- Last updated: 2026-07-06

## What changed
- Phase 3 (2026-07-06): cashier-to-accountant enrichment (D3/D7/D8/D11), designed via a fan-out understand+design workflow then implemented + reviewed.
  - Decisions locked with the user: FULL D7 enrichment now (subjects + aux + cash-flow + posting-template); confirm-actor tension deferred to Phase 4.
  - State machine: new `pending_accounting` status + `enrich` transition. Cashier create → `pending_accounting` (null subjects) + opens a `payment.enrich` WorkItem (assignedRole accountant); accountant `enrich()` sets subjects/aux/cash-flow and advances **straight to `pending_approval`** (opening the approve WorkItem) — refinement over the synth's enrich→draft, since D3's flow is create→enrich→approval and the kernel should auto-hand-off. Direct accounting-capable create → `draft` (T-007 unchanged, D8 back-compat).
  - D8 fork via one predicate `isAccountingCapable(identity) = defineAbilityFor(identity).can('post','Voucher')` — moved into `@my-erp/platform` (single source); no CASL matrix change, no hardcoded role strings. The `/payments/:id/enrich` route is gated by `@RequirePermission('post','Voucher')` (coarse) + the service capability check (fine); cashier create rejects smuggled subjects (D3).
  - D7 (voucher timing): `enrich()` NEVER builds a voucher; the settlement voucher is still generated + posted only at confirm. A single `isAccountingComplete` predicate guards submit + confirm against the null-subject hole. "Posting-template decision" has no DP28 engine to bind to, so it resolves to the explicit enrich confirmation; the settlement template itself is direction-driven (借/贷 cash↔contra).
  - FULL D7 enrichment fields: new nullable `PaymentDoc.contraAux` (Json) + `cashFlowItem` (String); `buildSettlementEntry` threads them onto the CONTRA (non-cash) line only; confirm passes them into the voucher line. Partner-typed aux (customer/supplier) prefills from the doc's 往来单位; department/project are free text; cash-flow item auto-suggests from `Account.defaultCashFlowItem`.
  - New `/v1/me` endpoint returns the caller's `accountingCapable` so the web can fork the create surface (the API still enforces the fork).
  - Web: `payment-create-form` forks cashier-simple (hides account fields → 待补录) vs direct; new `payment-enrich-form` (subjects + cash-flow Select + aux-by-auxType); `payments-client` regrouped to 6 who-acts-next tabs (待办/待补录/待审批/待确认/已完成/全部, NOT 8 raw); detail actions `确认收付并过账`→`确认收付`; display maps + home board gained `pending_accounting`/`finance.payment.enrich`.
  - Migration `20260706120000_t012_payment_enrichment` (drop NOT NULL on the two subject columns + add `contra_aux`/`cash_flow_item`), back-compatible with existing non-null rows.

- Phase 1 (2026-07-05): BusinessPartner master implemented end to end.
  - Ledger-scoped `business_partner` table (RLS, no DELETE policy) + nullable `partner_id` on `payment_doc` / `contract` (migration `20260705120000_t012_business_partner`).
  - `packages/db`: `BusinessPartnerEntity` + create/get/list(search q over name/wechat, role/partyType/active filters)/version-guarded update; `partnerId` on payment/contract entities, create inputs, and list filters.
  - `packages/platform`: new `BusinessPartner` CASL subject (viewer read; accountant/cashier/supervisor create+read+update); accountant/cashier also gained `read Membership` for the D2 employee quick-select roster.
  - `apps/api`: `/v1/business-partners` (list/create/get/patch; D2 non-member confirmation guard, member-link validation, audit); payments/contracts create accept `partnerId` (active + in-scope check, counterparty snapshot auto-filled from partner name when blank); list endpoints gain `partnerId` filter.
  - OpenAPI + `packages/api-client`: BusinessPartner schemas/methods, `listMembers`, partner filter params.
  - `apps/web`: `/finance/partners` page (queues 客户/供应商/员工个人/已停用/全部, name/wechat/tag search, create form with member quick-select + D2 confirm checkbox + 微信号, drawer with 停用/启用 and D9 filter links); shared `PartnerPicker` (select-or-free-text) replacing the counterparty text inputs in payment/contract create forms; `?partnerId=` filter + chip on payments/contracts lists; nav entry 往来单位.

- Phase 2 (2026-07-05): standard chart v2 + import/diff, tree-based cash identification, display preferences, progressive picker.
  - `STANDARD_CHART` v2 (92 accounts, table-driven with derived parent/level/isLeaf): the account SET follows the official 《小企业会计准则》 appendix (财会〔2011〕17 号, researched online), the CODES follow the repo's existing convention (assets/liabilities match the official list; equity 4xxx / P&L 6xxx match the report engine + period-close prefixes). Industry-specific accounts (biological assets, 工程施工/机械作业, planned-cost-method materials) intentionally excluded. Common second-level details for 应付职工薪酬 (4), 应交税费 (8), 销售费用 (7), 管理费用 (11), 财务费用 (4).
  - Diff/import engine: `GET /v1/accounts/standard-diff` (preview) + `POST /v1/accounts/import-standard` (explicit additive apply). Only additions plus the leaf→branch flip of ACTIVITY-FREE parents; a posted/opened leaf is never mutated — its template children are reported as conflicts. `seed-standard` reworked: empty ledger = full v2 seed, non-empty ledger = the same safe engine.
  - Report engine: 无形资产 BS line now nets 1702 累计摊销 alongside 1701.
  - Cash identification: `CASH_ACCOUNT_ROOT_CODES` (1001/1002/1012) + tree-prefix ancestor test in finance-domain (web keeps a synced mirror); child codes extend parent codes (API-enforced), so the root-prefix match IS the tree test and new bank/monetary subaccounts are covered automatically.
  - `AccountPreference` table (ledger-scoped RLS; userId '' sentinel = ledger default because Postgres unique treats NULLs as distinct): team `recommended` + personal `pinned`/`hidden`. `GET/PATCH /v1/account-preferences` (personal; read-Account permission) + `PATCH /v1/account-preferences/ledger-default` (update-Account permission). Codes sanitized against the ledger chart at write time.
  - AccountPicker progressive rework (grouped variant): browse mode = 常用 chips (pinned → recommended → device recents) + 分类 → 主科目(带 › 下钻) → 明细 columns; hidden accounts drop out of browse with an "已少展示 n 项" note but stay searchable (tagged 已隐藏); ★ pin toggle persists via server action with optimistic state; recents in localStorage (per device — cheap, no per-click API chatter); native autocomplete/autocorrect/spellcheck suppressed. Compact variant unchanged. Call sites now pass the active subtree (branches included) — only active leaves are selectable.
  - 科目设置 page: explicit chart-v2 import review card (diff counts + expandable addition list + 导入 button); card disappears once the ledger is up to date.

- Review fixes (2026-07-05): an 8-angle recall-biased code review over Phases 1+2 surfaced 10 verified findings (no correctness-blocking bugs); all fixed.
  - Defense in depth: `getAccountPreferenceTx` now requires `ledgerBookId` and reads via the composite unique key (RLS alone was the only guard; the dev owner connection bypasses RLS).
  - Picker robustness: level-1 ancestor derivation walks `parentCode` instead of `code.slice(0, 4)` (falls back to the prefix only when branch rows are absent).
  - API visibility: `seed-standard` now returns `{ seeded, convertedParents, conflicts }` — skipped posted-leaf conflicts are no longer audit-log-only.
  - Copy drift: the cash-account error message is assembled from `CASH_ACCOUNT_ROOT_CODES`.
  - Reuse: new `usePickerPopover` hook (positioning/placement/outside-click) shared by account/partner/contract pickers; `picker.module.css` shared by partner+contract pickers (was a byte-identical copy); `queue-page.module.css` shared chrome (navActions/filterChip/entryPanel/queueScope) for payments/contracts/partners clients; `classifyActionFailure` shared by four actions files.
  - Efficiency: preferences PATCH loads the chart once and reuses a `mergedPreferences` helper; `assertMember` uses a targeted `getMembershipByUserTx`; the picker keyboard index is a memoized code→index Map (was per-option findIndex).
  - Conventions: the chart-import card's inline style moved to `accounts.module.css`.
  - Deliberately NOT changed (review candidates refuted): browse-mode replacing the flat grouped layout (roadmap-intended), `''` sentinel for the ledger-default preference row and localStorage recents (documented tradeoffs), ★/☆ pin glyphs (dingbats, not emoji — brand rule targets emoji).

## Files/modules touched (high level)
- `prisma/schema.prisma` + `prisma/migrations/20260705120000_t012_business_partner/`
- `packages/db` (repo + 2 new integration test files), `packages/platform` (ability), `packages/api-client`
- `apps/api/src/business-partners/` (new), `apps/api/src/payments/`, `apps/api/src/contracts/`, `app.module.ts`
- `apps/web`: `lib/finance/{data-source,partner-display}.ts`, `finance/partners/` (new), `finance/_components/partner-picker.*`, payments/contracts pages + forms, `components/workbench-shell.tsx`
- `docs/context/api/openapi.yaml` (+ generated index), `docs/context/db/schema.json` (synced)
- `dev-docs/active/finance-sme-usability-foundation/`

## Decisions & tradeoffs
- Decision: Treat "付款对象" as the cashier label for the broader `BusinessPartner` / 往来单位 master.
  - Rationale: Requirements define 往来单位 as shared master data and auxiliary accounting dimension.
  - Alternatives considered: Create a separate `PaymentTarget`; rejected because it would duplicate contract/voucher partner needs.
- Decision: BusinessPartner must support individuals.
  - Rationale: Reimbursements and employee/person payments are common small-business flows.
  - Alternatives considered: Only support company customers/suppliers first; rejected as too narrow.
- Decision: BusinessPartner uses `partyType + multi-select roles + display-only tags`; no mandatory primary kind. Confirmed 2026-07-05.
  - Rationale: Small-business counterparties often span roles, such as a company that is both customer and supplier, or a person who is both employee and reimbursee. Multi-select roles avoid duplicate partner records.
  - Alternatives considered: One primary kind plus tags; rejected because tags would either become hidden business logic or force duplicate records.
- Decision: Individual BusinessPartner can optionally link to an organization member, while non-member individuals remain confirmed manual entries. Confirmed 2026-07-05.
  - Rationale: Joined employees should be fast to find for reimbursement flows, but finance records must also support external or temporary individuals without turning BusinessPartner into the identity system.
  - Alternatives considered: Require every individual to be an organization member; rejected because reimbursements and payments can involve non-members. Keep only free-text individuals; rejected because joined employees need de-duplication and fast selection.
- Decision: Cashier-created simple payment docs go to accountant enrichment before approval/confirmation, and cashier users do not fill accounting subjects. Confirmed 2026-07-05.
  - Rationale: Small-business cashier entry should capture business facts, not require accounting knowledge. Approval and confirmation should see accountant-reviewed accounting fields before any voucher effect.
  - Alternatives considered: Let cashier choose cash/contra account subjects; rejected because it preserves the current complexity. Let posting rules silently assign subjects; rejected because accountant confirmation must remain the control point.
- Decision: Accountant-created cash/bank vouchers create cashier-consumable fund tasks/views linked to voucher lines, without duplicate accounting vouchers. Confirmed 2026-07-05.
  - Rationale: This gives cashier users a unified operational queue while keeping the accountant's voucher as the accounting source of truth.
  - Alternatives considered: Generate a new `PaymentDoc` that posts a second voucher; rejected because it risks duplicated accounting effect. Keep only the voucher with no cashier task; rejected because it loses the cashier operational workflow.
- Decision: Account display preferences use ledger default plus personal preference, and only affect picker display/ranking. Confirmed 2026-07-05.
  - Rationale: Small teams need a sane shared default, while individual users still benefit from recent, pinned, and less-shown choices based on their own habits.
  - Alternatives considered: Ledger-only preferences; rejected because it ignores individual workflows. Personal-only preferences; rejected because it loses the small-business team default. Treat hidden preferences as account deactivation; rejected because visibility preference must not affect accounting validity.
- Decision: Standard chart v2 should expand common SME second-level accounts as comprehensively as practical, while keeping counterparties and people out of the account tree. Confirmed 2026-07-05.
  - Rationale: Small businesses still need common accounting buckets available; the picker and preference layers should manage visual noise instead of omitting useful accounts.
  - Alternatives considered: Bank-only expansion or a narrow tax/expense expansion; rejected because it would keep common daily accounting cases under-modeled. Per-partner subaccounts; rejected because BusinessPartner and auxiliary dimensions handle those details.
- Decision: Avoid chart explosion by keeping customers/suppliers/employees in partner/auxiliary dimensions instead of account children.
  - Rationale: Maintains usable account selection and cleaner reporting.
  - Alternatives considered: Create per-partner subaccounts under receivable/payable; rejected for SME usability.
- Decision: Account picker should remain classified at the first level but become progressive for detail selection.
  - Rationale: User likes the current classified top-level experience but wants fewer repeated/noisy choices.
- Decision: Settlement voucher generation stays at payment confirmation; enrichment only completes PaymentDoc accounting fields. Confirmed 2026-07-05 (D7).
  - Rationale: One simple mental model for small teams and minimal change to the existing state machine, period lock, and SoD checks.
  - Alternatives considered: Generate a voucher draft at enrichment; rejected because it introduces draft/document divergence risk without user value for the SME target.
- Decision: Payment entry paths split by role: cashier creation always enters enrichment; accounting-capable roles may fill accounting subjects directly. Confirmed 2026-07-05 (D8).
  - Rationale: Small businesses often have accounting-capable users entering payments directly; forcing everyone through enrichment adds steps without safety gains. The direct path also provides transition compatibility with T-007 behavior.
  - Alternatives considered: One mandatory enrichment path for all creators; rejected as heavier for accountant-entered docs. Removing the direct path outright; rejected because the roadmap requires transition compatibility.
- Decision: BusinessPartner is ledger-scoped v1 and partner becomes a query dimension on payment/contract lists. Confirmed 2026-07-05 (D9).
  - Rationale: Matches the existing finance RLS pattern; filtering documents by partner is a core SME need for 往来 review.
  - Alternatives considered: Org-scoped partner master; deferred until cross-ledger sharing is actually needed (A1 risk noted in roadmap).
- Decision: Individual partners are entered by the organization; display name lives on the partner record. Confirmed 2026-07-05 (D10).
  - Rationale: `Membership` has no name field and ERP must not depend on live Logto profile data; partner master should own its display name with snapshot semantics. No self-service partner creation, consistent with invite-only membership.
  - Alternatives considered: Pull display names from Logto at render time; rejected because it creates a live identity dependency and unstable audit/history rendering.
  - Refinement (2026-07-05): partner search matches typed person/company names directly, and individual entry includes an optional WeChat ID (微信号) contact field. Contact fields are display/search-only PII: ledger-scoped, never driving accounting/workflow logic, never in outbox metadata.
- Decision: D7 refinement — voucher generation is the explicit confirm click after enrichment completes; enrichment completion never auto-generates. Confirmed 2026-07-05.
  - Rationale: keeps a human control point between "accounting facts are complete" and "ledger effect happens", matching the current confirm semantics.
- Decision: Payment workbench vocabulary is simplified: business-facing action button copy and regrouped status tabs. Confirmed 2026-07-05 (D11).
  - Rationale: current labels (such as 「确认收付并过账」) expose accounting jargon to cashier users, and the payments list already has seven status tabs; adding the enrichment state without regrouping would make the queue harder to read, defeating the SME-simplicity goal.
  - Alternatives considered: Keep raw status tabs and only add an eighth for enrichment; rejected as more noise. Rename statuses in the state machine itself; rejected — wording is a display concern and the accounting state machine stays unchanged.

- Decision: `partnerId` is a plain UUID column (indexed with ledgerBookId), not a Prisma FK relation. Implemented 2026-07-05.
  - Rationale: matches the house pattern (`contractId` on vouchers/payments); RLS already guarantees same-ledger visibility and the service validates existence/active in-scope at write time.
- Decision: PartnerPicker supports select-or-free-text. Implemented 2026-07-05.
  - Rationale: legacy text-only counterparties must keep working (backward compatibility); typing detaches the link, selecting fills the snapshot from the master. Native autocomplete is suppressed on the picker input.
- Decision: accountant/cashier gained `read Membership` in CASL. Implemented 2026-07-05.
  - Rationale: D2 employee quick-select needs the org roster; previously only supervisor/admin could list members, which would 403 the partner create form for finance roles.

## Deviations from plan
- None yet.

## Known issues / follow-ups
- ~~Define the exact standard chart v2 account-code list during implementation.~~ Done 2026-07-05 (92 accounts; see Phase 2 notes).
- ~~Design explicit import/diff review for applying standard chart v2 additions to existing ledgers.~~ Done 2026-07-05 (`standard-diff`/`import-standard` + 科目设置 review card).
- Ledger-default recommended list is API-complete (`PATCH /v1/account-preferences/ledger-default`, permission-gated) but has no settings UI yet — small follow-up.
- Pre-existing report gap (not introduced here): 生产成本 5001 / 制造费用 5101 balances have no BS 在产品 mapping (the line exists without terms). Worth fixing when reports are next touched.
- Aux-dimension vocabulary still `customer/supplier/department/project`; a unified `partner` dimension (wired to BusinessPartner) is a Phase 3/4 concern.

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
