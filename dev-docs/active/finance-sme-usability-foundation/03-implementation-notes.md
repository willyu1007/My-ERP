# 03 — Implementation Notes

## Status
- Current status: `planned`
- Last updated: 2026-07-05

## What changed
- Created this task bundle to record the SME usability discussion before implementation.
- No application/source/config files have been changed.

## Files/modules touched (high level)
- Documentation only:
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

## Deviations from plan
- None yet.

## Known issues / follow-ups
- Define the exact standard chart v2 account-code list during implementation.
- Design explicit import/diff review for applying standard chart v2 additions to existing ledgers.

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
