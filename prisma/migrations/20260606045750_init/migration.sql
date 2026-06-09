-- CreateTable
CREATE TABLE "audit_record" (
    "id" UUID NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "ledger_book_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_record_ledger_book_id_created_at_idx" ON "audit_record"("ledger_book_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_record_entity_type_entity_id_idx" ON "audit_record"("entity_type", "entity_id");
