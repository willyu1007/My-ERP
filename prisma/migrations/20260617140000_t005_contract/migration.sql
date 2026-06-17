-- T-005 MVP: 合同 (Contract) + the contractId dimension on vouchers.
--
-- A thin finance-side aggregate that coordinates the documents of one economic
-- relationship (vouchers / payments link via contractId) and anchors a read-only
-- timeline. It never owns document business state. Ledger-scoped (RLS) like
-- journal_voucher; no DELETE policy (no physical delete — closed is a status).

-- AlterTable: voucher → contract link (nullable; existing rows unaffected).
ALTER TABLE "journal_voucher" ADD COLUMN "contract_id" UUID;
CREATE INDEX "journal_voucher_ledger_book_id_contract_id_idx" ON "journal_voucher"("ledger_book_id", "contract_id");

-- CreateTable
CREATE TABLE "contract" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "counterparty" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "start_date" DATE,
    "end_date" DATE,
    "summary" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_ledger_book_id_code_key" ON "contract"("ledger_book_id", "code");

-- CreateIndex
CREATE INDEX "contract_ledger_book_id_status_idx" ON "contract"("ledger_book_id", "status");

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Row-Level Security: ledger scope (app.current_ledger), like journal_voucher ----

ALTER TABLE "contract" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contract_select_scope" ON "contract"
  FOR SELECT
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "contract_insert_scope" ON "contract"
  FOR INSERT
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "contract_update_scope" ON "contract"
  FOR UPDATE
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
