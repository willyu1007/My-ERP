# Architecture

## Boundary

`journal_entry_line` remains the normalized accounting line table. It requires an account code and is used for ledger derivation after posting.

`JournalVoucher.draftPayload` stores quick-entry UI draft state for incomplete `draft` vouchers. It is not an accounting source and must not be used for posted ledger/report calculations.

## API Contract

`CreateVoucher` accepts:

- `date`
- optional `summary`
- optional `contractId`
- `lines` with optional account/summary/debit/credit fields
- optional `draftPayload`

For create/update:

- amount strings are validated when present
- account-bearing lines are enriched and persisted as normalized lines
- no-account lines are preserved only in `draftPayload`

For submit:

- existing `voucherBalanceError(voucher.lines)` remains the gate
- DB CHECK still blocks non-draft imbalance

## Data Migration

Add nullable JSONB column:

- model: `JournalVoucher`
- field: `draftPayload Json? @map("draft_payload")`

No destructive data migration is required.
