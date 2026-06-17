-- T-007 cashier MVP: 出纳收付款单 (PaymentDoc).
--
-- A 收款/付款 document with a request → approve → confirm → settlement-voucher
-- lifecycle. The system records + approves + posts the entry; it never moves money
-- (no auto-disbursement). Ledger-scoped (RLS) like journal_voucher; no DELETE policy
-- (accounting records are never physically deleted — void is a status).

-- CreateTable
CREATE TABLE "payment_doc" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "no" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "period" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "cash_account_code" TEXT NOT NULL,
    "contra_account_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "settlement_voucher_id" UUID,
    "contract_id" UUID,
    "maker" TEXT NOT NULL,
    "approver" TEXT,
    "confirmer" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_doc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_doc_ledger_book_id_no_key" ON "payment_doc"("ledger_book_id", "no");

-- CreateIndex
CREATE INDEX "payment_doc_ledger_book_id_status_idx" ON "payment_doc"("ledger_book_id", "status");

-- AddForeignKey
ALTER TABLE "payment_doc" ADD CONSTRAINT "payment_doc_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Row-Level Security: ledger scope (app.current_ledger), like journal_voucher ----

ALTER TABLE "payment_doc" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_doc_select_scope" ON "payment_doc"
  FOR SELECT
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "payment_doc_insert_scope" ON "payment_doc"
  FOR INSERT
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "payment_doc_update_scope" ON "payment_doc"
  FOR UPDATE
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
