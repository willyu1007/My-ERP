-- P3: journal_voucher + journal_entry_line (记账凭证). Ledger-scoped.

-- CreateTable
CREATE TABLE "journal_voucher" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT NOT NULL,
    "total_debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "maker" TEXT NOT NULL,
    "checker" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_of" UUID,
    "reversed_by" UUID,
    "attachments" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_line" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "account_code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "debit" DECIMAL(18,2),
    "credit" DECIMAL(18,2),
    "aux" JSONB,
    "cash_flow_item" TEXT,

    CONSTRAINT "journal_entry_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_voucher_ledger_book_id_status_idx" ON "journal_voucher"("ledger_book_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "journal_voucher_ledger_book_id_no_key" ON "journal_voucher"("ledger_book_id", "no");

-- CreateIndex
CREATE INDEX "journal_entry_line_voucher_id_idx" ON "journal_entry_line"("voucher_id");

-- CreateIndex
CREATE INDEX "journal_entry_line_ledger_book_id_idx" ON "journal_entry_line"("ledger_book_id");

-- AddForeignKey
ALTER TABLE "journal_voucher" ADD CONSTRAINT "journal_voucher_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_line" ADD CONSTRAINT "journal_entry_line_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "journal_voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DB backstop for 借贷必平: a non-draft voucher must have equal debit/credit totals.
ALTER TABLE "journal_voucher"
  ADD CONSTRAINT "journal_voucher_balanced_when_not_draft"
  CHECK ("status" = 'draft' OR "total_debit" = "total_credit");

-- Row-Level Security: ledger-scoped (app.current_ledger). Vouchers are never
-- physically deleted (no DELETE policy) — corrections go through reversal (红冲).
-- Lines allow DELETE so a DRAFT voucher's lines can be replaced on edit (the
-- service restricts that to draft status); lines are replaced, not updated.
ALTER TABLE "journal_voucher" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journal_voucher_select_scope" ON "journal_voucher"
  FOR SELECT USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "journal_voucher_insert_scope" ON "journal_voucher"
  FOR INSERT WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "journal_voucher_update_scope" ON "journal_voucher"
  FOR UPDATE USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
              WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);

ALTER TABLE "journal_entry_line" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journal_entry_line_select_scope" ON "journal_entry_line"
  FOR SELECT USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "journal_entry_line_insert_scope" ON "journal_entry_line"
  FOR INSERT WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "journal_entry_line_delete_scope" ON "journal_entry_line"
  FOR DELETE USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
