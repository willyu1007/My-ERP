-- P3 review: a voucher can be reversed at most once, even under concurrent
-- requests. A unique index on reversal_of makes a second reversal of the same
-- original fail at the DB layer (the app-level reversedBy check only guards the
-- sequential case). Postgres treats NULLs as distinct, so non-reversal vouchers
-- (reversal_of NULL) are unaffected.
CREATE UNIQUE INDEX "journal_voucher_reversal_of_key" ON "journal_voucher"("reversal_of");
