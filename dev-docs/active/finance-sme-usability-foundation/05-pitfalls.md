# 05 — Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- Do not turn BusinessPartner into a replacement identity system; it is finance master data.
- Do not model each customer/supplier/employee as a chart-of-accounts child by default.
- Do not make task state the accounting source of truth; WorkItem coordinates, PaymentDoc/Voucher remain source entities.
- Do not remove historical counterparty snapshots when introducing partner links.
- Do not let native browser autocomplete compete with the ERP-owned account picker.
- Do not extend the hardcoded cash-account code list (`isCashAccountCode`, `1001/1002/1012`); Phase 2 replaces it with tree/metadata-based identification and later phases must reuse that rule.
- Do not render partner display names from live Logto profile data; names are org-entered partner master data with snapshot semantics (D10).

## Pitfall log (append-only)

### 2026-07-04 - Planning baseline
- Symptom: N/A.
- Context: Task opened before implementation to preserve discussion and align roadmap decisions.
- What we tried: N/A.
- Why it failed (or current hypothesis): N/A.
- Fix / workaround (if any): N/A.
- Prevention (how to avoid repeating it): Keep this file append-only and add resolved failures during implementation.
- References (paths/commands/log keywords): `dev-docs/active/finance-sme-usability-foundation/roadmap.md`
