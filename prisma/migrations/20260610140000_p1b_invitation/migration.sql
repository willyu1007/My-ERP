-- P1b: invitation (邀请制加入；禁止自助). State machine pending → accepted|revoked|expired.

-- CreateTable
CREATE TABLE "invitation" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "invited_email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_by" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_by" TEXT,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_key" ON "invitation"("token");

-- CreateIndex
CREATE INDEX "invitation_org_id_idx" ON "invitation"("org_id");

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Row-Level Security: org-scoped (app.current_org). Invitations are created
-- by admins/supervisors and accepted/revoked within the org; full CRUD with
-- WITH CHECK. Membership gains an INSERT policy so accepting an invitation can
-- create the member row (still WITH CHECK-pinned to the active org).

ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invitation_select_scope" ON "invitation"
  FOR SELECT USING ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid);
CREATE POLICY "invitation_insert_scope" ON "invitation"
  FOR INSERT WITH CHECK ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid);
CREATE POLICY "invitation_update_scope" ON "invitation"
  FOR UPDATE USING ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid)
              WITH CHECK ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid);

CREATE POLICY "membership_insert_scope" ON "membership"
  FOR INSERT WITH CHECK ("org_id" = NULLIF(current_setting('app.current_org', true), '')::uuid);
