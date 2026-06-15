# 06 — Implementation readiness review

Date: 2026-06-15

## Readiness summary
T-004 is ready to enter implementation, starting with the **UI thin vertical (S1)** per decision γ:
stand up `@my-erp/api-client` (codegen), cut the web voucher path over to `/v1`, then build the
inline `<VoucherFastEntry>` grid. The capture pipeline (S2–S5) follows. Every planning fork is
resolved (α–ε, A–E, F1–F3, G1); remaining unknowns are implementation-level (exact Prisma fields,
RLS SQL, the test matrix), not design decisions.

Current baseline is healthy:
- `pnpm typecheck` passed (9 workspace projects).
- `pnpm test` passed: 20 files, 97 tests, including the `work-item-rls` Postgres RLS integration
  test (testcontainers PG available locally).
- Project governance lint passed with one existing non-blocking T-001 warning.

Do NOT start with: real OCR model, object-storage backend, the chat inbound path, the contract
aggregate (T-005), or any cashier/payment work.

## Findings

### High priority

1. `@my-erp/api-client` is a stub — δ cutover is foundational, not incremental.
Evidence: `packages/api-client/src/index.ts` only exports a package-name constant; "generation is
wired in once REST endpoints land (P3+)".
Impact: the entire UI-first plan (S1) and every future `/v1` page depend on it.
Required action (S1a): wire OpenAPI codegen for `packages/api-client` against
`docs/context/api/openapi.yaml`; expose the voucher (list/detail/create/update/submit/post) and
account-list surface; align create/submit payloads with `CreateVoucherDto` in
`apps/api/src/vouchers/vouchers.controller.ts`. Do this before the data-source cutover.

2. The fast-entry grid is net-new UI — no editable-grid or combobox primitive exists.
Evidence: `@my-erp/ui` re-exports `@willyu1007/web-workbench` (display-only `EntityTable`/cell kit)
plus host chrome; there is no editable grid or combobox.
Impact: largest net-new UI surface; risk of `pnpm ui:governance` failures (inline visuals) and of
building the component without the S5 prefill mode in mind.
Required action (S1c): build `<VoucherFastEntry>` token-only (governed), and design it from the start
for **both** modes — blank-start and intake-prefilled — since S5 reuses it. Consider extracting the
account combobox as a reusable primitive (candidate to later push into `@my-erp/ui`).

3. δ cutover risk: fixture VM vs `/v1` response shape drift.
Evidence: pages depend only on `VoucherVM`/`AccountVM`; `/v1` returns the persisted entity shapes.
Impact: a shape mismatch (e.g. `lines`/`totalDebit`/`balanced`/`maker`/`checker`) would break pages
silently.
Required action (S1b): map `/v1` → existing VMs at the `data-source.ts` seam; smoke the full
create→submit path; keep the seam reversible to fixtures (one file) if a gap appears.

4. New persisted schema (`Intake`/`Attachment`) needs RLS and the DB-SSOT workflow.
Evidence: DB helpers support `withOrgScope`/`withLedgerScope`/`withScope`; `Intake` is ledger-bound.
Impact: capture rows could leak across ledgers; schema drift if added outside the SSOT path.
Required action (S2): add `Intake`/`Attachment` via `sync-db-schema-from-code`; RLS requires org
membership and applies `app.current_ledger` for the ledger-bound `Intake`; regenerate DB context;
tests prove no cross-ledger read.

5. The two-schema-family boundary must be enforced, not just documented.
Evidence: `ExtractionResultSchema` carries amounts/counterparty/raw (financial detail); the My-Chat
path only accepts `OutboxEventEnvelopeSchema`/`SafeWorkItemMetadataSchema` (forbidden-key filtered).
Impact: extraction detail could leak into an intake-sourced outbox event.
Required action (S3): keep `ExtractionResultSchema` out of `rejectForbiddenMetadata`; intake outbox
uses only the T-003 envelope; add a contract test asserting an intake-sourced draft's outbox rejects
amount/counterparty/account-lines/OCR-text.

6. Auto-draft (G1) coupling and one-shot guard.
Impact: double-drafting from one intake; state drift between intake / voucher / work-item.
Required action (S5): `extracted → drafted` is version-guarded and one-shot; draft creation +
`voucher.confirm` work item + audit + outbox run in one transaction (same rule as T-003 transitions).

### Medium priority

7. CASL lacks intake subjects/actions.
Evidence: `packages/platform/src/ability.ts` has `Voucher`/`WorkItem`/`LedgerBook`/`Membership` but
no `Intake`; no `intake.capture/draft/discard/read`.
Required action (S3): extend platform authorization before exposing intake endpoints.

8. `voucher.confirm` must extend the existing workflow without disturbing `voucher.review`.
Evidence: `FINANCE_DAILY_ACCOUNTING_WORKFLOW` (`packages/platform/src/workflow.ts`) currently defines
`voucher.review` only.
Required action (S3): add the `voucher.confirm` `workItemType` (role `accountant`, subStatus
`pending_confirmation`; actions confirm→submit, discard→cancel); reuse `availableActions`.

9. Posting template must live in `packages/finance-domain`, not the platform kernel.
Impact: account-code knowledge in the domain-agnostic kernel breaks the boundary rule and future-
module reuse.
Required action (S3): `PostingTemplate`/`build()→DraftVoucher` in finance-domain; platform holds only
the `Extractor`/`ObjectStore` seam interfaces.

10. Capture endpoint needs upload validation + hashing + archive intent.
Impact: unvalidated multipart uploads; archive append-only requirement.
Required action (S4): validate content type (image/pdf) and size, compute `sha256`, store via the
`ObjectStore` seam; reuse the existing `AuthGuard`/`LedgerScopeGuard`/`@CurrentIdentity` pattern for
scope and `createdBy`.

## Non-blocking notes
- Chat inbound (ε) is deferred (cross-repo); the capture API is built source-agnostic now.
- Real OCR (A) and object-storage backend (B) are deferred behind the `Extractor`/`ObjectStore`
  seams; `ExtractionResultSchema` with `extractor:{name,version}` keeps the swap a drop-in.
- Pinyin/助记 combobox search is deferred (code+name first) to avoid a dependency.
- `JournalEntryLine.aux`/`cashFlowItem` columns already exist; T-004 leaves them null.
- The contract aggregate is split to T-005 — do not pull it into T-004.
- Working tree has uncommitted T-003 + governance changes; keep T-004 commits path-scoped.

## Recommended implementation stance
UI thin vertical first, then the capture pipeline:
1. S1a — `@my-erp/api-client` via OpenAPI codegen (voucher + account surface).
2. S1b — data-source cutover at the `data-source.ts` seam (reads + create/submit).
3. S1c — inline `<VoucherFastEntry>` grid (built for blank + prefilled modes); relieves #1.
4. S2 — `Intake`/`Attachment` schema + RLS via the DB-SSOT workflow.
5. S3 — contracts (`ExtractionResultSchema`), posting-template (finance-domain), `voucher.confirm`
   type, seams, CASL.
6. S4 — intake API + mock `Extractor` / local `ObjectStore` adapters + metadata-only outbox.
7. S5 — high-confidence auto-draft → confirm in the same `<VoucherFastEntry>` editor.
8. S6 — verification (intake RLS, transitions, posting-template, two-schema safety, fast-entry
   balance) + docs.

Do not start with real OCR, object-storage backend, chat inbound, the T-005 contract aggregate, or
cashier/payment workflows.
