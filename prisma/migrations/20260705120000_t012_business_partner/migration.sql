-- T-012 Phase 1: 往来单位 (BusinessPartner) + the partnerId dimension on
-- payment_doc / contract.
--
-- Finance-owned, ledger-scoped master data for counterparties — organizations and
-- individuals (customer/supplier/employee/reimbursee…). Documents keep their
-- immutable `counterparty` text snapshot even when linked (history never depends
-- on live partner master). Ledger-scoped (RLS) like contract; no DELETE policy
-- (no physical delete — deactivate via `active`).

-- AlterTable: payment_doc → partner link (nullable; existing rows unaffected).
ALTER TABLE "payment_doc" ADD COLUMN "partner_id" UUID;
CREATE INDEX "payment_doc_ledger_book_id_partner_id_idx" ON "payment_doc"("ledger_book_id", "partner_id");

-- AlterTable: contract → partner link (nullable; existing rows unaffected).
ALTER TABLE "contract" ADD COLUMN "partner_id" UUID;
CREATE INDEX "contract_ledger_book_id_partner_id_idx" ON "contract"("ledger_book_id", "partner_id");

-- CreateTable
CREATE TABLE "business_partner" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "party_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "member_user_id" TEXT,
    "wechat" TEXT NOT NULL DEFAULT '',
    "remark" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "business_partner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_partner_ledger_book_id_active_idx" ON "business_partner"("ledger_book_id", "active");

-- CreateIndex
CREATE INDEX "business_partner_ledger_book_id_name_idx" ON "business_partner"("ledger_book_id", "name");

-- AddForeignKey
ALTER TABLE "business_partner" ADD CONSTRAINT "business_partner_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Row-Level Security: ledger scope (app.current_ledger), like contract ----

ALTER TABLE "business_partner" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_partner_select_scope" ON "business_partner"
  FOR SELECT
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "business_partner_insert_scope" ON "business_partner"
  FOR INSERT
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "business_partner_update_scope" ON "business_partner"
  FOR UPDATE
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
