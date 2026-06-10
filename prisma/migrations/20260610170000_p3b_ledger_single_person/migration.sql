-- P3b: single-person mode flag on a ledger book (SoD exception, explicit opt-in).
ALTER TABLE "ledger_book" ADD COLUMN "single_person_mode" BOOLEAN NOT NULL DEFAULT false;
