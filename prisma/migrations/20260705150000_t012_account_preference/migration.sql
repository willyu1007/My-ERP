-- T-012 Phase 2: 科目展示偏好 (AccountPreference, D5).
--
-- Display/ranking preferences for the account picker: one ledger-default row
-- (user_id = '') with the team's recommended accounts, plus per-user rows with
-- pinned/hidden codes. Display-only — never affects account validity, hierarchy,
-- leaf-only posting, or permissions. Ledger-scoped (RLS); no DELETE policy
-- (clearing a preference is an UPDATE to an empty list).

-- CreateTable
CREATE TABLE "account_preference" (
    "id" UUID NOT NULL,
    "ledger_book_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL DEFAULT '',
    "recommended" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hidden" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_preference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_preference_ledger_book_id_user_id_key" ON "account_preference"("ledger_book_id", "user_id");

-- AddForeignKey
ALTER TABLE "account_preference" ADD CONSTRAINT "account_preference_ledger_book_id_fkey" FOREIGN KEY ("ledger_book_id") REFERENCES "ledger_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Row-Level Security: ledger scope (app.current_ledger) ----

ALTER TABLE "account_preference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_preference_select_scope" ON "account_preference"
  FOR SELECT
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "account_preference_insert_scope" ON "account_preference"
  FOR INSERT
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
CREATE POLICY "account_preference_update_scope" ON "account_preference"
  FOR UPDATE
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
