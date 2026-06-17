-- T-006 M3b (post-hoc tagging): allow UPDATE on journal_entry_line so an already
-- posted voucher's non-cash line can be tagged with a 现金流量项目 from the pre-close
-- worklist. Lines are otherwise immutable (insert + delete only); this UPDATE path
-- exists solely to set cash_flow_item — a reporting dimension that never changes
-- debit/credit, so 借贷必平 and balances are unaffected. Ledger-scoped like the
-- other journal_entry_line policies; the service additionally blocks tagging in a
-- closed period and audits each change.

CREATE POLICY "journal_entry_line_update_scope" ON "journal_entry_line"
  FOR UPDATE
  USING ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid)
  WITH CHECK ("ledger_book_id" = NULLIF(current_setting('app.current_ledger', true), '')::uuid);
