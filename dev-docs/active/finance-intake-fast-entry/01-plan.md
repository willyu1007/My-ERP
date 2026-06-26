# 01 — Plan

Sequencing follows top-level decision γ: **UI thin vertical first** (relieve the #1 pain), then the
intake backend, then template + confirm, then verification. Each phase is independently committed +
self-reviewed, mirroring the T-003 cadence.

## Phase 0 — Top-level decision freeze (S0)
Purpose: lock scope and runtime shapes before any code.

Steps:
- Freeze α–ε (capture-first bet; contract split to T-005; UI-first; real-API cutover; chat source-
  agnostic web-only) and A–E slice defaults.
- Freeze the `Intake` state machine and the safe-metadata boundary for capture/draft outbox events.

Acceptance criteria:
- [ ] `02-architecture.md` reflects the frozen entity shapes, intake state machine, seams, and the
      My-Chat inbound/outbound boundary.
- [ ] Contract scope is recorded in T-005; every deferred item has a revisit trigger.

## Phase 1 — Voucher fast-entry on real `/v1` (S1, UI thin vertical)
Purpose: relieve the #1 pain first, on real data.

Two repo findings shape S1, so it splits into three sub-layers:
- `packages/api-client` is currently a **stub** (only exports a package-name constant); it must be
  stood up. Decision **F1**: generate it from `docs/context/api/openapi.yaml` (codegen), per the
  package's stated intent.
- `@my-erp/ui` (re-exporting `@willyu1007/web-workbench`) has only **display** tables (`EntityTable`/
  cell kit) and host chrome — no editable grid or combobox. The fast-entry grid is **net-new**,
  built from Tailwind tokens and governed by `pnpm ui:governance`.

### S1a — Stand up `@my-erp/api-client` (codegen, F1)
Steps:
- Wire OpenAPI codegen for `packages/api-client`; generate the voucher (list/detail/create/update/
  submit/post) and account-list surface from `docs/context/api/openapi.yaml`.
- Align the create/submit payloads with the existing `CreateVoucherDto` in
  `apps/api/src/vouchers/vouchers.controller.ts`.

Acceptance criteria:
- [ ] Client exposes typed voucher list/detail/create/submit/post + account list, scoped by
      org/ledger headers.
- [ ] Generation is reproducible from the OpenAPI contract (no hand-drift).

### S1b — Data-source cutover (δ)
Steps:
- Replace the fixture bodies in `apps/web/src/lib/finance/data-source.ts` with `@my-erp/api-client`
  calls; add write operations (create/submit). Keep `VoucherVM`/`AccountVM` as the seam: map `/v1`
  responses → existing VM shapes so pages/components stay untouched.

Acceptance criteria:
- [ ] Voucher reads + create/submit go through real `/v1`; VM shapes unchanged.
- [ ] The seam can fall back to fixtures if a `/v1` gap appears (reversible cutover, one file).

### S1c — Inline keyboard-first fast-entry grid
Steps:
- Build a net-new `<VoucherFastEntry>` editable grid (Tailwind tokens, governed): columns 科目
  (account combobox) / 摘要 / 借方 / 贷方 / delete; header 日期 + derived 期间 + 整单摘要; footer
  totals + balance badge.
- Keyboard model: Tab/Shift-Tab cell flow with row wrap; Enter on last-row amount adds a row and
  focuses the account cell; account **combobox** fuzzy-matches code+name (pinyin deferred) and lists
  **leaf+active** accounts only; single-side-per-line mutual exclusion (typing debit clears credit);
  **auto-balance** ghost-prefill of the contra amount; integer-cent math reused from
  `apps/web/src/lib/finance/money`. Copy-last / 常用凭证 seed.
- Placement (**F2**): an always-present inline fast-entry panel at the top of
  `/finance/daily-accounting` (zero navigation, no modal). The **same** `<VoucherFastEntry>` is
  reused as the S5 intake-confirm surface.
- Action set (**F3**): `暂存` (draft recovery; hardened by T-010) + `提交` (submit, draft→pending) only. Posting belongs to
  the review queue (`/post` enforces SoD / single-person二次确认); the entry surface does not post.
- Keep the old `/finance/vouchers/new` page and the row drawer as deep links / inspection, not the
  primary path.

Acceptance criteria:
- [ ] A balanced voucher can be created and submitted keyboard-only, inline, with no modal, against
      real `/v1`.
- [ ] Front-end balance check (integer cents, zero float), leaf+active account rule, and single-side-
      per-line are preserved.
- [ ] `pnpm ui:governance` passes (token-only styling, no inline visuals).
- [ ] `<VoucherFastEntry>` is reusable for the intake-prefilled confirm surface (S5).

## Phase 2 — Intake schema and RLS (S2)
Purpose: persist capture safely with org + ledger isolation.

Steps:
- Use the `sync-db-schema-from-code` workflow.
- Add `Intake` and `Attachment` to `prisma/schema.prisma` (no Contract/BusinessPartner — those are
  T-005).
- Migration SQL: org-scope RLS on both tables; ledger-scope RLS on `Intake` (ledger-bound); FK +
  index for `intake.attachmentId` and `intake.targetType/targetId`.
- Scoped repositories in `packages/db` returning plain domain entities (no Prisma in business layer).
- Regenerate DB context: `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`.

Acceptance criteria:
- [ ] `Intake` cannot be read outside org scope, nor outside ledger scope.
- [ ] `Attachment` content is referenced via `ObjectStore`, never inlined into work-item or outbox
      metadata.
- [ ] Intake status history is append-only (no silent state loss).

## Phase 3 — Platform contracts and authorization (S3)
Purpose: make capture concepts explicit and permissioned before API exposure.

Steps:
- Add zod contracts in `packages/contracts`: `IntakeSource`/`IntakeKind`/`IntakeStatus`, `Intake`
  DTOs, and `ExtractionResultSchema` (per-field + overall `confidence`, `needsReview`, `extractor`
  provenance, `raw`). Mark it **ERP-internal** — it must NOT go through `rejectForbiddenMetadata`.
- Add the code-first **posting-template registry** in **`packages/finance-domain`** (NOT
  `packages/platform` — it knows account codes): `PostingTemplate{match, build(x)→DraftVoucher}`,
  versioned, returning the `POST /v1/vouchers` body shape.
- Add the `voucher.confirm` `workItemType` to `FINANCE_DAILY_ACCOUNTING_WORKFLOW`
  (`packages/platform/src/workflow.ts`); `Extractor`/`ObjectStore` seam interfaces in
  `packages/platform`.
- Extend CASL with `intake.capture`, `intake.draft`, `intake.discard`, `intake.read`. Keep
  `voucher.*` operations in finance adapters.

Acceptance criteria:
- [ ] The two schema families are distinct: `ExtractionResultSchema` (internal, detail allowed) vs
      the capture/draft outbox + work-item metadata (forbidden-key filtered). A test asserts an
      intake-sourced draft's outbox rejects amount/counterparty/account-lines/OCR-text.
- [ ] The posting-template `build()` is a pure function in finance-domain producing a `DraftVoucher`
      for at least one realistic mapping (bank-slip → bank + open contra); no account-code leakage
      into the platform kernel.
- [ ] Capture/draft/discard are authorized server-side; the T-003 `availableActions` pattern is reused.

## Phase 4 — Intake API and seams (S4)
Purpose: capture (web now, chat-ready) through one pipeline without leaking detail.

Steps:
- Define `ObjectStore` and `Extractor` seams; provide a local blob adapter and a deterministic mock
  extractor (realistic output schema + confidence).
- Add contract-first OpenAPI for `POST /v1/intakes` (multipart capture, `source` flag),
  `GET /v1/intakes`, `GET /v1/intakes/:id`, `POST /v1/intakes/:id/draft`,
  `POST /v1/intakes/:id/discard`; regenerate `API-INDEX.md` / `api-index.json`.
- Implement endpoints in `apps/api`; verify the `source=web` path this slice (`source=chat` is a flag
  reused later).
- Append a metadata-only `OutboxEvent` on capture-received and on draft-created.

Acceptance criteria:
- [ ] Capture stores the attachment via the seam and creates an `Intake(received)`; intake list/
      detail are org + ledger scoped.
- [ ] Outbox payloads on capture/draft contain only allowed metadata (contract-tested).
- [ ] Extraction runs through the `Extractor` seam (mock); state advances received → extracted.

## Phase 5 — Posting-template → draft + confirm (S5)
Purpose: turn an extracted intake into a confirmable voucher draft in the same fast-entry editor.

Steps:
- On `extracted`, run the matching posting template's `build(x)` → `DraftVoucher`, validate with
  finance-domain `voucherBalanceError` + leaf/active checks (integer cents).
- **G1 high-confidence auto-draft**: in one transaction create the draft, set
  `intake.targetType/targetId`, create `WorkItem(workItemType=voucher.confirm, subStatus=
  pending_confirmation)`, write audit, append outbox; advance `extracted → drafted` (guarded by
  `status` + `version`). Low confidence / unmatched / unbalanced → `pending_completion` instead.
- Open the generated draft in the Phase-1 `<VoucherFastEntry>` editor (prefilled); confirm submits
  via the existing voucher state machine and completes the `voucher.confirm` work item.

Acceptance criteria:
- [ ] Draft creation, work-item creation, audit, and outbox are a single transaction; auto-draft is
      one-shot per intake (version-guarded).
- [ ] The generated draft obeys leaf+active account and integer-cent rules; never auto-posts.
- [ ] High-confidence → `pending_confirmation`; low/incomplete → `pending_completion`.
- [ ] Intake-prefilled and blank drafts use one editor; confirm routes through `voucher.confirm` with
      SoD enforced.

## Phase 6 — Verification and documentation (S6)
Purpose: close the slice with machine-checkable evidence.

Steps:
- Run `pnpm typecheck`, `pnpm test`.
- Focused integration tests: intake RLS, intake state transitions, posting-template output, outbox-
  metadata safety, fast-entry balance invariant.
- Governance + context verification; update `03-implementation-notes.md`, `04-verification.md`, and
  this plan with actual outcomes.

Acceptance criteria:
- [ ] Typecheck + tests pass; context artifacts regenerated and verified.
- [ ] Bundle reflects implemented behavior and the explicit deferred items (T-005, chat inbound,
      real OCR, object storage).

## Risks and mitigations
- δ cutover gaps (fixture VM vs `/v1`) → keep VM as seam, cut reads+writes together, smoke the full
  create→submit→post path, reversible at one file.
- Detail leak to My-Chat → metadata-only outbox, ERP-side attachments/extraction, contract tests.
- State drift (intake/voucher/work-item) → transactional draft + confirm with audit + outbox.
- Mock OCR hides edge cases → stable `Extractor` schema with confidence/needs-review for drop-in.
- Fast-entry correctness regression → keep integer-cent balance + leaf/active rules; service
  invariants unchanged.
