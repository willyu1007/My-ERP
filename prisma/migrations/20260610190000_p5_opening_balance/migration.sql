-- P5: opening balances (期初余额) + the ledger book's enabled period.

-- AlterTable
ALTER TABLE "ledger_book" ADD COLUMN "opening_period" TEXT;

-- CreateTable
CREATE TABLE "opening_balance" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "account_code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "debit" DECIMAL(18,2),
    "credit" DECIMAL(18,2),

    CONSTRAINT "opening_balance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opening_balance_ledger_book_id_idx" ON "opening_balance"("ledger_book_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_ledger_book_id_account_code_key" ON "opening_balance"("ledger_book_id", "account_code");

-- AddForeignKey
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: ledger-scoped (app.current_ledger). The opening-balance set
-- is replaced wholesale on edit, so SELECT/INSERT/DELETE (no UPDATE).
ALTER TABLE "opening_balance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opening_balance_select_scope" ON "opening_balance"
  FOR SELECT USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "opening_balance_insert_scope" ON "opening_balance"
  FOR INSERT WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "opening_balance_delete_scope" ON "opening_balance"
  FOR DELETE USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
