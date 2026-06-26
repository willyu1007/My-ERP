-- Preserve incomplete quick-entry form state for draft vouchers.
-- This JSON payload is UI recovery data only; normalized journal_entry_line rows
-- remain the accounting source for submit/post/report flows.
ALTER TABLE "journal_voucher" ADD COLUMN "draft_payload" JSONB;
