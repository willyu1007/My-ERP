# Implementation Notes

## Decisions

- Use a JSON draft payload rather than forcing incomplete UI rows into `journal_entry_line`.
- Keep normalized lines for any row with a selected account so totals and submit validation still operate on persisted accounting lines.
- Use `暂存` as the user-facing label.

## Open Issues

- Applying the Prisma migration to any target DB requires explicit user approval per `sync-db-schema-from-code`.

## 2026-06-26 Implementation

- Added `JournalVoucher.draftPayload` as nullable JSON for quick-entry UI draft recovery.
- Relaxed voucher create/update parsing so draft persistence accepts optional summary and partial lines.
- Kept normalized lines account-bearing; no-account rows live only in `draftPayload`.
- Renamed the quick-entry button to `暂存`.
- Split frontend eligibility:
  - `暂存`: any meaningful content + valid amount formats.
  - `提交`: complete summary + submit-ready lines + 借贷必平.
- Draft detail reopening now prefers `draftPayload` when present.
- Follow-up hardening cleared `draftPayload` during draft→pending transition and added server-side v1 payload sanitization.
