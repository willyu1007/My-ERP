-- T-004: capture intake pipeline (domain-agnostic).
--
-- Attachment stores a captured original (bytes live in object storage, referenced
-- by storage_key). Intake is the capture state machine; extraction JSON + the
-- attachment are ERP-only financial detail and never reach My-Chat. Both are
-- ledger-scoped (org + ledger). RLS requires the active org AND ledger.

-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "attachment_id" UUID,
    "extraction" JSONB,
    "confidence" DECIMAL(4,3),
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "target_type" TEXT,
    "target_id" UUID,
    "channel_ref" TEXT,
    "created_by" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachment_org_id_idx" ON "attachment"("org_id");

-- CreateIndex
CREATE INDEX "attachment_ledger_book_id_idx" ON "attachment"("ledger_book_id");

-- CreateIndex
CREATE INDEX "intake_org_id_status_idx" ON "intake"("org_id", "status");

-- CreateIndex
CREATE INDEX "intake_ledger_book_id_status_idx" ON "intake"("ledger_book_id", "status");

-- CreateIndex
CREATE INDEX "intake_target_type_target_id_idx" ON "intake"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake" ADD CONSTRAINT "intake_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake" ADD CONSTRAINT "intake_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake" ADD CONSTRAINT "intake_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- Row-Level Security: org + ledger scope are both mandatory (ledger-bound) ----

ALTER TABLE "attachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachment_select_scope" ON "attachment"
  FOR SELECT
  USING (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
  );
CREATE POLICY "attachment_insert_scope" ON "attachment"
  FOR INSERT
  WITH CHECK (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
  );

ALTER TABLE "intake" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intake_select_scope" ON "intake"
  FOR SELECT
  USING (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
  );
CREATE POLICY "intake_insert_scope" ON "intake"
  FOR INSERT
  WITH CHECK (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
  );
CREATE POLICY "intake_update_scope" ON "intake"
  FOR UPDATE
  USING (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
  )
  WITH CHECK (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
  );
