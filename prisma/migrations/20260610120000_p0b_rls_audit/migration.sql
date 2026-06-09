-- P0b: Row-Level Security baseline on the append-only audit log.
--
-- Reads are isolated to the active ledger scope, carried in the
-- `app.current_ledger` GUC which @my-erp/db sets per-transaction via SET LOCAL
-- (see withLedgerScope). Inserts are always allowed (audit is append-only and
-- app-controlled); there is no UPDATE/DELETE policy, so RLS also enforces
-- append-only at the row level. Real business tables get RLS in P1.
--
-- NOTE: the application must connect as a NON-owner, NON-superuser role for RLS
-- to apply (owners/superusers bypass RLS). Migrations run as the privileged role.

ALTER TABLE "audit_record" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_record_select_ledger_isolation" ON "audit_record"
  FOR SELECT
  USING ("ledger_book_id" = current_setting('app.current_ledger', true));

CREATE POLICY "audit_record_insert_any" ON "audit_record"
  FOR INSERT
  WITH CHECK (true);
