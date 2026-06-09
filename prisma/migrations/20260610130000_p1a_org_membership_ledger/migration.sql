-- P1a: organization / membership / ledger_book (platform tenancy).

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_book" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "period_structure" TEXT NOT NULL DEFAULT '12+1',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_book_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_user_id_idx" ON "membership"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_org_id_user_id_key" ON "membership"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "ledger_book_org_id_idx" ON "ledger_book"("org_id");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_book" ADD CONSTRAINT "ledger_book_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Row-Level Security: org-scoped isolation via the app.current_org GUC ----
-- (set per-transaction by withOrgScope). The app connects as a NON-privileged
-- role for these to apply; migrations/sync run privileged. Organizations and
-- memberships are written by the privileged sync/seed path (My-Chat/Logto owns
-- orgs; memberships via invitation in P1b), so app-facing policies are read-only
-- here. ledger_book is ERP-owned → full tenant-scoped CRUD with WITH CHECK to
-- block cross-org writes.

ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organization_select_scope" ON "organization"
  FOR SELECT USING ("id" = NULLIF(current_setting('app.current_org', true), '')::uuid);

ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membership_select_scope" ON "membership"
  FOR SELECT USING ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid);

ALTER TABLE "ledger_book" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_book_select_scope" ON "ledger_book"
  FOR SELECT USING ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid);
CREATE POLICY "ledger_book_insert_scope" ON "ledger_book"
  FOR INSERT WITH CHECK ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid);
CREATE POLICY "ledger_book_update_scope" ON "ledger_book"
  FOR UPDATE USING ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid)
              WITH CHECK ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid);
