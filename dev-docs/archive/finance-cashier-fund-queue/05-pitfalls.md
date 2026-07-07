# 05 — Pitfalls (do not repeat)

## Do-not-repeat summary (keep current)
- Inherit ALL T-012 pitfalls (`dev-docs/active/finance-sme-usability-foundation/05-pitfalls.md`), especially: org-scoped work_item/outbox need `withScope`; RLS-sensitive behavior must be tested by driving the real controller under the app role; dev DB has RLS OFF (owner); vitest runs from the repo root.
- Do not turn the fund queue into a 7th who-acts-next tab on the payments page — it is a separate SECTION (different entity, same person).
- Do not resurrect the reconciliation checkbox without a post-execution reconcile action to back it.

## Pitfall log (append-only)

### 2026-07-07 - A constant exported from a 'use client' module poisons server imports
- Symptom: the payments server page crashed with `Attempted to call FUND_QUEUE_FETCH_LIMIT() from the server but FUND_QUEUE_FETCH_LIMIT is on the client` — the poison function was even stringified into the API query (`?limit=function...`), yielding a 400.
- Why: Next.js replaces EVERY export of a `'use client'` module with a client-reference proxy when imported from a server component — plain constants included.
- Fix: move shared constants to a non-client module (`lib/finance/fund-display.ts`) imported by both sides.
- Prevention: never export non-component values from `'use client'` files if a server component might import them.

### 2026-07-07 - Test voucher-no counters collide with count-derived numbering
- Symptom: `createVoucherTx` unique-constraint failure in the T-013 pagination test.
- Why: the reverse endpoint derives its reversal voucher no from `countVouchersInPeriodTx + 1` (plain `记-YYYY-MM-NNN`); a plain incrementing counter in the test file eventually issues the same number.
- Fix: namespace test numbers (`记-2026-06-T001`).
- Prevention: never use a bare sequential counter for voucher nos in tests that also exercise reverse/confirm paths.

### 2026-07-07 - Planning baseline
- Task opened; scope locked with the user (queue placement / no photo upload / drop the checkbox).
