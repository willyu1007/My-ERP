-- T-012 Phase 3: cashier-to-accountant enrichment (D3/D7/D8).
--
-- Cashier simple docs enter a `pending_accounting` state with no accounting
-- subjects; the accountant fills cash/bank + contra subjects, the contra line's
-- auxiliary dimensions, and the cash-flow item at enrich. The settlement voucher
-- is still generated + posted only at confirm (D7). Drop-not-null is backward
-- compatible with existing non-null draft rows; the two new columns are nullable.

ALTER TABLE "payment_doc" ALTER COLUMN "cash_account_code" DROP NOT NULL;
ALTER TABLE "payment_doc" ALTER COLUMN "contra_account_code" DROP NOT NULL;
ALTER TABLE "payment_doc" ADD COLUMN "contra_aux" JSONB;
ALTER TABLE "payment_doc" ADD COLUMN "cash_flow_item" TEXT;
