-- T-003: platform work-item kernel + metadata-only outbox.
--
-- WorkItem is current queue state. WorkItemEvent is append-only transition
-- history. OutboxEvent is a metadata-only notification envelope; detailed
-- finance context stays in ERP and is fetched after authorization.

-- CreateTable
CREATE TABLE "work_item" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "ledger_book_id" UUID,
    "module_key" TEXT NOT NULL,
    "workflow_key" TEXT NOT NULL,
    "workflow_version" TEXT NOT NULL,
    "work_item_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sub_status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assigned_role" TEXT NOT NULL,
    "assignee_user_id" TEXT,
    "claimed_at" TIMESTAMPTZ(6),
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "canceled_at" TIMESTAMPTZ(6),
    "created_by" TEXT NOT NULL,
    "completed_by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title_key" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_event" (
    "id" UUID NOT NULL,
    "work_item_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "ledger_book_id" UUID,
    "event_type" TEXT NOT NULL,
    "action_key" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "actor_id" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "ledger_book_id" UUID,
    "work_item_id" UUID,
    "event_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "dispatched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_item_org_id_status_idx" ON "work_item"("org_id", "status");

-- CreateIndex
CREATE INDEX "work_item_ledger_book_id_status_idx" ON "work_item"("ledger_book_id", "status");

-- CreateIndex
CREATE INDEX "work_item_assignee_user_id_status_idx" ON "work_item"("assignee_user_id", "status");

-- CreateIndex
CREATE INDEX "work_item_assigned_role_status_idx" ON "work_item"("assigned_role", "status");

-- CreateIndex
CREATE INDEX "work_item_source_type_source_id_idx" ON "work_item"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "work_item_dedupe_key_idx" ON "work_item"("dedupe_key");

-- Active-task dedupe: completed/canceled work can remain for history, but only
-- one active item for the same dedupe key may exist.
CREATE UNIQUE INDEX "work_item_active_dedupe_key"
  ON "work_item"("dedupe_key")
  WHERE "status" IN ('open', 'claimed', 'waiting', 'returned');

-- CreateIndex
CREATE INDEX "work_item_event_work_item_id_created_at_idx" ON "work_item_event"("work_item_id", "created_at");

-- CreateIndex
CREATE INDEX "work_item_event_org_id_created_at_idx" ON "work_item_event"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "work_item_event_ledger_book_id_created_at_idx" ON "work_item_event"("ledger_book_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_event_org_id_status_created_at_idx" ON "outbox_event"("org_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_event_ledger_book_id_status_created_at_idx" ON "outbox_event"("ledger_book_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_event_work_item_id_idx" ON "outbox_event"("work_item_id");

-- AddForeignKey
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_event" ADD CONSTRAINT "work_item_event_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_event" ADD CONSTRAINT "work_item_event_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_event" ADD CONSTRAINT "work_item_event_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- Row-Level Security: org scope is mandatory; ledger scope applies when set ----

ALTER TABLE "work_item" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_item_select_scope" ON "work_item"
  FOR SELECT
  USING (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  );
CREATE POLICY "work_item_insert_scope" ON "work_item"
  FOR INSERT
  WITH CHECK (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  );
CREATE POLICY "work_item_update_scope" ON "work_item"
  FOR UPDATE
  USING (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  )
  WITH CHECK (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  );

ALTER TABLE "work_item_event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_item_event_select_scope" ON "work_item_event"
  FOR SELECT
  USING (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  );
CREATE POLICY "work_item_event_insert_scope" ON "work_item_event"
  FOR INSERT
  WITH CHECK (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  );

ALTER TABLE "outbox_event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbox_event_select_scope" ON "outbox_event"
  FOR SELECT
  USING (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  );
CREATE POLICY "outbox_event_insert_scope" ON "outbox_event"
  FOR INSERT
  WITH CHECK (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  );
CREATE POLICY "outbox_event_update_scope" ON "outbox_event"
  FOR UPDATE
  USING (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  )
  WITH CHECK (
    "org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    AND (
      "ledger_book_id" IS NULL
      OR "ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid
    )
  );
