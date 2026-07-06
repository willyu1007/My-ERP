-- T-012 Phase 4: 货币资金结算/出纳执行 (FundConsumption, D4).
--
-- A cashier-facing EXECUTION view over a cash/bank line of an accountant-posted
-- voucher (spawned by postVoucherReviewTx, one row per cash/bank line). It holds
-- ONLY execution/reconciliation state — no debit/credit, no posting — so consuming
-- it can never create a second voucher or duplicate ledger effect. Ledger-scoped
-- (RLS) like payment_doc; no DELETE policy (reversal → executionStatus 'void').

-- CreateTable
CREATE TABLE "fund_consumption" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "voucher_id" UUID NOT NULL,
    "voucher_line_id" UUID NOT NULL,
    "voucher_no" TEXT NOT NULL DEFAULT '',
    "line_no" INTEGER NOT NULL,
    "account_code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL DEFAULT '',
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "counterparty" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "execution_status" TEXT NOT NULL DEFAULT 'pending',
    "bank_flow_ref" TEXT,
    "reconciliation_status" TEXT NOT NULL DEFAULT 'unreconciled',
    "attachment_id" UUID,
    "work_item_id" UUID,
    "executed_by" TEXT,
    "executed_at" TIMESTAMPTZ(6),
    "reconciled_by" TEXT,
    "reconciled_at" TIMESTAMPTZ(6),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fund_consumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — one consumable per cash line (idempotency guard against double-spawn)
CREATE UNIQUE INDEX "fund_consumption_ledger_book_id_voucher_line_id_key" ON "fund_consumption"("ledger_book_id", "voucher_line_id");

-- CreateIndex
CREATE INDEX "fund_consumption_ledger_book_id_execution_status_idx" ON "fund_consumption"("ledger_book_id", "execution_status");

-- CreateIndex
CREATE INDEX "fund_consumption_voucher_id_idx" ON "fund_consumption"("voucher_id");

-- AddForeignKey
ALTER TABLE "fund_consumption" ADD CONSTRAINT "fund_consumption_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Row-Level Security: ledger scope (app.current_ledger), like payment_doc ----

ALTER TABLE "fund_consumption" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fund_consumption_select_scope" ON "fund_consumption"
  FOR SELECT
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "fund_consumption_insert_scope" ON "fund_consumption"
  FOR INSERT
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "fund_consumption_update_scope" ON "fund_consumption"
  FOR UPDATE
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
