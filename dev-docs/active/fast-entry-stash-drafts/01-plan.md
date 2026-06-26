# Plan

## Phase 1 - Contract and Persistence

1. Add a nullable draft payload field to `JournalVoucher`.
2. Expose the draft payload through the voucher API contract.
3. Keep normalized `journal_entry_line` rows for account-bearing lines only.

Acceptance: draft payload is available on voucher reads and does not affect posted ledger derivation.

## Phase 2 - API Validation

1. Relax create/update validation for draft persistence.
2. Preserve strict validation at submit via existing `voucherBalanceError`.
3. Continue validating amount formats and account codes for account-bearing lines.

Acceptance: POST/PATCH can save partial drafts; POST `/submit` still rejects incomplete vouchers.

## Phase 3 - Web Fast Entry

1. Rename action to `暂存`.
2. Split stash eligibility from submit eligibility.
3. Send full form draft payload on stash/update.
4. Restore initial form from draft payload when present.

Acceptance: partial form content survives save and reopen.

## Phase 4 - Verification

1. Run codegen/typecheck.
2. Run targeted browser smoke for button behavior.
3. Record DB migration diff and note that DB apply needs explicit approval.

Acceptance: no type errors, no whitespace diff errors, and migration SQL is reviewed.

## Risks

- Risk: draft payload diverges from normalized lines.
  Mitigation: treat normalized lines as accounting source; draft payload is UI recovery data for `draft` status.
- Risk: incomplete draft accidentally submitted.
  Mitigation: submit path still validates persisted normalized lines with `voucherBalanceError`.
