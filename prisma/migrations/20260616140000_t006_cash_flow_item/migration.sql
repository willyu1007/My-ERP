-- T-006 M3b: cash flow items (现金流量项目) for the direct-method CF statement.
--
-- Tagged onto the non-cash lines of cash-involved vouchers
-- (journal_entry_line.cash_flow_item). Ledger-scoped (like account/journal_voucher).

-- AlterTable: auto-suggest source on the chart
ALTER TABLE "account" ADD COLUMN "default_cash_flow_item" TEXT;

-- CreateTable
CREATE TABLE "cash_flow_item" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_item_ledger_book_id_code_key" ON "cash_flow_item"("ledger_book_id", "code");

-- CreateIndex
CREATE INDEX "cash_flow_item_ledger_book_id_idx" ON "cash_flow_item"("ledger_book_id");

-- AddForeignKey
ALTER TABLE "cash_flow_item" ADD CONSTRAINT "cash_flow_item_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Row-Level Security: ledger scope (app.current_ledger), like account ----

ALTER TABLE "cash_flow_item" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cash_flow_item_select_scope" ON "cash_flow_item"
  FOR SELECT
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "cash_flow_item_insert_scope" ON "cash_flow_item"
  FOR INSERT
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "cash_flow_item_update_scope" ON "cash_flow_item"
  FOR UPDATE
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
