-- P2: account (会计科目). First LEDGER-scoped business table — RLS by the
-- app.current_ledger GUC (set by withLedgerScope). Full tenant-scoped CRUD with
-- WITH CHECK to block cross-ledger writes. The app additionally validates the
-- ledger book belongs to the caller's org (LedgerScopeGuard) before scoping.

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "parent_code" TEXT,
    "level" INTEGER NOT NULL,
    "is_leaf" BOOLEAN NOT NULL DEFAULT true,
    "aux_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_ledger_book_id_idx" ON "account"("ledger_book_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_ledger_book_id_code_key" ON "account"("ledger_book_id", "code");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: ledger-scoped (app.current_ledger).
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_select_scope" ON "account"
  FOR SELECT USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "account_insert_scope" ON "account"
  FOR INSERT WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "account_update_scope" ON "account"
  FOR UPDATE USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
              WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
