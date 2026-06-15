# 03 — Implementation notes

## S1a — `@my-erp/api-client` via OpenAPI codegen (done 2026-06-15)

What changed:
- `packages/api-client` was a stub (one constant). Stood it up as a typed client.
- Added `openapi-typescript` (devDep) + a `codegen` script:
  `openapi-typescript ../../docs/context/api/openapi.yaml -o src/generated/schema.ts`.
- Generated `src/generated/schema.ts` (types only; committed, regenerate with `pnpm --filter
  @my-erp/api-client codegen`).
- Wrote a thin typed fetch client in `src/index.ts`: `createApiClient({ baseUrl, token, fetch? })`
  exposing `listVouchers/getVoucher/createVoucher/updateVoucher/submitVoucher/postVoucher/
  listAccounts`, plus `ApiError` and re-exported `Account`/`Voucher`/`VoucherLine`/`CreateVoucher`/
  `VoucherStatus` types from the generated schema.
- Added `@types/node` (devDep) so the global `fetch`/`Response` types resolve (base tsconfig is
  `lib: ["ES2022"]`, no DOM).
- Builds to `dist/` (consumers use `main: dist/index.js`); generated schema is type-only.

Design notes:
- Runtime is a thin fetch wrapper (no `openapi-fetch`/runtime dep) → avoids ESM/CJS friction in this
  `type: commonjs` package; native `fetch` (Node ≥18) is the transport.
- Auth is `Authorization: Bearer <token>`; the token encodes `{userId, orgId, ledgerBookId}` (verified
  by `MockIdentityProvider`, HS256, secret `AUTH_DEV_SECRET`). Ledger scope rides on the token, so the
  client needs only a base URL + token — no extra scope headers.
- Client surface is scoped to voucher + account (what daily-accounting + fast-entry need). Trial-
  balance / account-ledger are not in the client yet (report milestone).

## S1b — data-source cutover (env-gated, reversible) (done 2026-06-15)

What changed:
- `apps/web` now depends on `@my-erp/api-client` (workspace).
- `apps/web/src/lib/finance/request-scope.ts`: `getFinanceApi()` returns a client when
  `API_BASE_URL` + `API_DEV_TOKEN` are set, else `null`; `requireFinanceApi()` throws (for writes).
- `apps/web/src/lib/finance/vm-map.ts`: `accountToVM` / `voucherToVM` map `/v1` entities → the
  existing `AccountVM`/`VoucherVM` (VM stays the seam; `balanced` derived via integer cents; line
  `id` synthesized as `${voucherId}:${index}`).
- `data-source.ts`: reads use the client when configured, else fixtures; added `createVoucher` /
  `submitVoucher` writes (require the backend — mutations cannot demo). Ledger reports stay on
  fixtures for S1.

Operational notes (for the live path):
- Mint `API_DEV_TOKEN` with `signDevToken({ userId, orgId, ledgerBookId }, AUTH_DEV_SECRET)` from
  `@my-erp/platform`, matching seeded data.
- **No seed script exists.** The live path needs a running API + a seeded org/ledger/membership and
  accounts. Accounts can be seeded via `POST /v1/accounts/seed-standard` (《小企业会计准则》 idempotent
  template). Without seed data, reads return empty lists.
- Reversible: unset the env to fall back to fixtures (one seam, no page changes).

## S1c — inline `<VoucherFastEntry>` grid (done 2026-06-15)

What changed:
- New `apps/web/src/app/(workbench)/finance/daily-accounting/voucher-fast-entry.tsx`: the inline,
  keyboard-first grid + an `AccountCombobox` (fuzzy match on code+name, leaf+active only). Token-only
  styling in `voucher-fast-entry.module.css` (passes `pnpm ui:governance`).
- New `actions.ts` (`'use server'`): `saveDraftAction` / `submitNewAction` call the data-source
  create/submit; return a `SaveResult` (`ok` | `unconfigured` | `error`) so the client can demo-toast
  when the backend is absent.
- `page.tsx` now fetches accounts + today and passes them; `daily-accounting-client.tsx` renders
  `<VoucherFastEntry>` above the queue.

Behavior:
- Keyboard: native Tab/Shift-Tab cell flow; Enter on an amount adds/advances a row; combobox
  ArrowUp/Down + Enter to pick; Escape closes.
- Single-side-per-line mutual exclusion (typing debit clears credit); integer-cent balance badge;
  auto-balance hint (placeholder of the contra amount) + a `一键配平` button.
- Actions: `保存草稿` (create) + `提交` (create→submit). **Posting stays in the review queue** (SoD).
- On success: success toast + form reset + `router.refresh()`. When unconfigured: demo toast (reads
  still work on fixtures).
- Built for reuse as the S5 intake-prefilled confirm surface (blank vs prefilled is just initial state).

## S2 — Intake / Attachment schema + RLS (done 2026-06-15)

What changed:
- `prisma/schema.prisma`: added `Attachment` and `Intake` models (both ledger-scoped — `orgId` +
  `ledgerBookId` required), with back-relations on `Organization` and `LedgerBook`. `Intake` carries
  `extraction` (Json, ERP-only), `confidence` `Decimal(4,3)`, `needsReview`, `targetType/targetId`,
  `channelRef`, and `version` (one-shot extracted→drafted guard). `Attachment` references object
  storage via `storageKey` + `sha256`/`byteSize` (bytes never inline).
- Migration `prisma/migrations/20260615120000_t004_intake_capture/migration.sql`: tables, indexes,
  FKs (`intake.attachment_id` → `attachment` ON DELETE SET NULL), and **RLS** — org + ledger scope on
  both (SELECT/INSERT; `intake` also UPDATE), mirroring the T-003 `app.current_org`/`app.current_ledger`
  GUC pattern. Ledger is mandatory (no NULL branch).
- `packages/db/src/index.ts`: `AttachmentEntity`/`IntakeEntity` + create/update inputs + repos
  `createAttachmentTx`/`createIntakeTx`/`getIntakeTx`/`listIntakesTx`/`updateIntakeTx`.
  `updateIntakeTx` is version-guarded (`updateMany where:{id,version}` + `version:{increment:1}`) so
  the draft transition is one-shot.
- Regenerated Prisma client + DB context (`docs/context/db/schema.json`).

Notes:
- `attachmentId` is set at intake creation (relation FK is excluded from Prisma `updateMany` data);
  the update path patches only scalars (status/extraction/confidence/needsReview/target).
- `confidence` is `Decimal(4,3)` in DB, surfaced as `number | null` in the entity.

## S3 — platform contracts + posting-template + seams + CASL (done 2026-06-15)

What changed:
- `packages/contracts`: `IntakeSource`/`IntakeKind`/`IntakeStatus`/`DocType` enums, `ExtractionResultSchema`
  (per-field + overall confidence, `extractor` provenance, `raw`), and `IntakeSchema` (ERP-facing DTO).
  `ExtractionResultSchema` is **ERP-internal** — deliberately not run through `rejectForbiddenMetadata`.
  `intake.test.ts` proves the two-schema boundary (extraction accepts amount/counterparty; the outbox
  envelope rejects them).
- `packages/finance-domain`: `posting-template.ts` — `PostingTemplate` registry (a `bank-slip` template),
  `selectPostingTemplate`, and `buildDraftFromExtraction` returning a `DraftVoucher` + a `complete` flag
  (false when a line still needs a human-chosen account → pending_completion). Pure-domain (no deps);
  `PostingExtraction` is the flattened mirror of `ExtractionResult`. `posting-template.test.ts` added.
- `packages/platform`: added the `voucher.confirm` workItemType to `FINANCE_DAILY_ACCOUNTING_WORKFLOW`
  (`complete` = submit the draft draft→pending; `cancel` = discard; posting stays in the review queue).
  New `capture.ts` with `ObjectStore` + `Extractor` seam interfaces (extractor returns `unknown`,
  validated against `ExtractionResultSchema` at the API boundary — keeps the kernel decoupled). CASL:
  added the `Intake` subject and grants (accountant/cashier `create/read/update/cancel`; supervisor +
  viewer `read`).

Notes:
- Intake CASL actions reuse existing verbs on the `Intake` subject (capture=create, draft=update,
  discard=cancel, read), avoiding new action verbs in the kernel.
- No DB/OpenAPI/context change in S3 (those land in S4).

## S4 — Intake API + seam adapters + outbox (done 2026-06-15)

What changed (all under `apps/api/src/intakes/`):
- **Seam adapters**: `LocalObjectStore` (local disk, content-addressed by sha256, `OBJECT_STORE_DIR`
  env; real archival deferred — B) and `MockExtractor` (deterministic `ExtractionResult` by kind;
  real OCR deferred — A). Provided via DI tokens `OBJECT_STORE`/`EXTRACTOR` in `app.module` so the
  real adapters drop in.
- **`IntakeService`**: `capture` (`ObjectStore.put` → `createAttachmentTx` + `createIntakeTx` +
  `intake.received` outbox, in `withScope` so RLS sees org+ledger), `list`/`detail` (scoped),
  `extract` (mock → validate `ExtractionResultSchema` → `updateIntakeTx(extracted)` version-guarded →
  `intake.extracted` outbox), `discard`. Capture body is **base64-in-JSON** (no multer dep; ≤10MB);
  real multipart can come later behind the same storage seam.
- **`IntakesController`**: `POST /v1/intakes`, `GET /v1/intakes`, `GET /:id`, `POST /:id/extract`,
  `POST /:id/discard` — `AuthGuard`+`PermissionGuard`+`LedgerScopeGuard`, `@RequirePermission` on the
  `Intake` subject, `@LedgerBookId`.
- **`intake-outbox.ts`**: metadata-only envelope (reuses `OutboxEventEnvelopeSchema`); a unit test
  proves the extracted amount/counterparty never leak into the payload.
- `packages/db`: added `getAttachmentTx`.
- **OpenAPI**: `/v1/intakes` paths + `Intake`/`ExtractionResult`/`ExtractionField`/`CaptureIntake`
  schemas; `api-index` regenerated (33 endpoints); `ctl-openapi-quality verify` passes.

Notes:
- The `extract` endpoint is explicit in S4; **S5 chains extract → high-confidence auto-draft (G1)**.
- Runtime smoke confirmed the route is wired (Nest starts, `/v1/intakes` 401 without a token).

## S5 (backend) — posting-template → auto-draft → confirm (done 2026-06-15)

What changed:
- `apps/api/src/intakes/draft.ts`: `flattenExtraction` (ExtractionResult → PostingExtraction),
  `shouldAutoDraft` (G1: template matches + confidence ≥ 0.8), `confirmSubStatus` (complete + high →
  `pending_confirmation`, else `pending_completion`), and `draftVoucherFromIntakeTx` — in one tx:
  build the draft (posting template), persist the voucher with **only account-bearing lines** (the
  contra line has no account → left for the human; `JournalEntryLine.accountCode` is NOT NULL),
  `updateIntakeTx(drafted, target, expectedVersion)` (version-guarded one-shot), open a
  `voucher.confirm` work item, audit, and metadata-only outbox.
- `IntakeService`: `extract()` auto-drafts inline when `shouldAutoDraft` (G1); explicit
  `draft()` + `POST /v1/intakes/:id/draft` for retry/manual.
- `work-items/voucher-workflow.ts`: `createVoucherConfirmWorkItemTx` (dedupe per voucher; routed
  subStatus).
- `vouchers.controller` submit: now **completes active `voucher.confirm` work items** (confirm =
  submit closes the accountant's confirm task) and then opens the supervisor review task.
- OpenAPI `/v1/intakes/:id/draft`; api-index regenerated.

Verification: `draft.test.ts` (flatten/route/auto-draft helpers) + `intake-draft.integration.test.ts`
(extracted intake → voucher draft + `voucher.confirm` work item, version-guarded one-shot).

## Open items / next
- **S5b (web)** — reuse `<VoucherFastEntry>` for the confirm surface (add `initialDraft`/edit mode so
  a drafted voucher opens prefilled and 提交 updates+submits), a "待确认" queue entry, a minimal
  capture/upload affordance, and intake methods on `@my-erp/api-client`. Live-verifiable with a seed.
- **Dev seed + live e2e**: a one-command seed (org/ledger/membership/accounts + `API_DEV_TOKEN`) would
  light up the whole loop (S1b cutover, S4 capture, S5 draft→confirm) for real `/v1` verification.
- **S6** — full verification sweep + docs; tick acceptance criteria.
