-- T-006 M3a: period close (期末结账).
--
-- One row per (ledger, period) once closed. 结转损益 posts a voucher and locks the
-- period; 反结账 红冲 it and reopens. Ledger-scoped (like journal_voucher).

-- CreateTable
CREATE TABLE "period_close" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'closed',
    "close_voucher_id" UUID,
    "closed_by" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "reopened_by" TEXT,
    "reopened_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_close_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "period_close_ledger_book_id_period_key" ON "period_close"("ledger_book_id", "period");

-- CreateIndex
CREATE INDEX "period_close_ledger_book_id_status_idx" ON "period_close"("ledger_book_id", "status");

-- AddForeignKey
ALTER TABLE "period_close" ADD CONSTRAINT "period_close_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Row-Level Security: ledger scope (app.current_ledger), like journal_voucher ----

ALTER TABLE "period_close" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "period_close_select_scope" ON "period_close"
  FOR SELECT
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "period_close_insert_scope" ON "period_close"
  FOR INSERT
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "period_close_update_scope" ON "period_close"
  FOR UPDATE
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
