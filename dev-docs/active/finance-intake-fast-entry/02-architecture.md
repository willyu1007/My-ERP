# 02 — Architecture

## Baseline (what exists)
- Finance source of truth: `JournalVoucher`, `JournalEntryLine`, `Account`, `OpeningBalance`, derived
  ledgers (`packages/finance-domain` pure functions; integer cents, zero float).
- Voucher REST API (M1 P3): `apps/api/src/vouchers/vouchers.controller.ts` — `GET /`, `GET /:id`,
  `POST /` (create), `PATCH /:id` (update), `POST /:id/submit`, `POST /:id/post`, `POST /:id/reverse`.
- Platform auth: organization / membership / invitation / ledger book, CASL actions, org + ledger
  scope, Postgres RLS.
- T-003 work-item kernel (backend-first): `WorkItem`, `WorkItemEvent`, `OutboxEvent`; statuses
  `open/claimed/waiting/returned/completed/canceled`; common subStatus incl. `pending_completion`,
  `pending_confirmation`, `pending_review`; `sourceType/sourceId`, `dedupeKey`, `availableActions`,
  metadata-only outbox envelope. Voucher submit already creates a reviewer work item; post is
  transactional.
- Web: `/finance/daily-accounting` (queue) + `/finance/vouchers/new` (full-page demo form) +
  `/finance/vouchers/[id]`, all on **fixtures** via `apps/web/src/lib/finance/data-source.ts`
  (single switch-point; TODO already points at `@my-erp/api-client`).

## Baseline gaps (confirmed in repo 2026-06-14)
- No OCR/LLM channel (`packages/llm` is the separate My-Chat repo).
- No object storage wired; `JournalVoucher.attachments` is an `Int` count, not an entity.
- No `BusinessPartner` / `Contract` (those belong to **T-005**); no `CashAccount`/`Payment`/`Receipt`
  (M2); `apps/workers/` exists but has no jobs.

## Proposed layering
```text
apps/web
  voucher fast-entry grid (inline, keyboard-first)      <- replaces drawer/new-page primary path
  data-source seam cutover: fixtures -> /v1 (δ)
  capture/upload affordance + intake confirm queue
  (intake-prefilled draft opens in the SAME fast-entry grid)

apps/api
  voucher endpoints (exist) consumed by web fast-entry
  intake controller (capture/list/detail/draft/discard)
  finance posting-template invocation + voucher draft creation

apps/workers                      (seam only this slice; real OCR job later)

packages/api-client
  voucher create/update/submit/post wrappers for web

packages/platform
  posting-template registry (code-first, finance-owned, versioned)
  Extractor + ObjectStore seam interfaces
  CASL actions for intake

packages/finance-domain
  voucher draft assembly from a posting template (invariants, integer cents)

packages/contracts
  zod: Intake DTOs, IntakeSource, intake status/subStatus, extraction-result schema

packages/db
  scoped repositories for Intake/Attachment; transactional draft creation

prisma
  Intake, Attachment            (Contract/BusinessPartner -> T-005)
```

## Boundary rules (inherit T-003 + new)
- Business layer MUST NOT import Prisma outside `packages/db` repositories.
- The platform `Extractor`/`ObjectStore` seams MUST NOT know finance account codes or voucher shape;
  the **posting template** (finance-owned) is the only place that maps extraction → entry lines.
- Every `Intake` row MUST carry `orgId` and, being ledger-bound, `ledgerBookId`.
- Attachment bytes and extraction JSON are financial detail: they live only in ERP, never in
  `WorkItem.metadata` or `OutboxEvent` payloads.
- A capture/draft/confirm transition that touches both a source entity and a work item MUST run in
  one database transaction (same rule as T-003).
- Confirm/post remains subject to SoD; generated drafts do not bypass review.

## δ — Real-API cutover (web data-source seam)
- The web voucher path moves from fixtures to `/v1` by replacing the bodies in
  `apps/web/src/lib/finance/data-source.ts` with `@my-erp/api-client` calls; the `VoucherVM`/
  `AccountVM` shapes stay as the seam, so pages/components are untouched.
- Reads (`listVouchers`/`getVoucher`/`listAccounts`) map to `GET /v1/vouchers*`; new write operations
  (create/submit/post) are added for the fast-entry editor.
- Reversible: if a `/v1` gap appears, the seam can fall back to fixtures (one file).

## Repo findings that shape S1
- `packages/api-client` is a **stub** (only a package-name constant). δ requires standing it up via
  OpenAPI codegen (Decision F1), not just adding methods.
- `@my-erp/ui` (= `@willyu1007/web-workbench` + host chrome) provides only **display** tables
  (`EntityTable`/cell kit) and chrome (shell/sidebar/toast/overlay/breadcrumb). There is **no
  editable grid or combobox** — the fast-entry grid is net-new, Tailwind-token-built, governed by
  `pnpm ui:governance`.

## Voucher fast-entry surface (Decision D, Phase 1)
A net-new `<VoucherFastEntry>` editable grid. **No modal**; replaces the `/finance/vouchers/new`
full-page form and the row drawer as the primary path (those remain deep links / inspection).

Layout: columns 科目 (account combobox) / 摘要 / 借方 / 贷方 / delete; header 日期 + derived 期间 +
整单摘要; footer totals + balance badge.

Keyboard model:
- `Tab`/`Shift-Tab` cell-to-cell with row wrap; `Enter` on a last-row amount adds a row and focuses
  its account cell.
- Account cell is a **combobox** that fuzzy-matches **code + name** (pinyin/助记 deferred to avoid a
  dependency now) and lists **leaf + active** accounts only (sourced from `AccountVM.isLeaf/active`).
- **Single-side-per-line** mutual exclusion: typing a debit clears the credit (and vice versa) —
  turns the current form's post-hoc error into proactive prevention.
- **Auto-balance**: when one amount slot is empty and the diff is known, show a ghost-prefill of the
  contra amount (accept with `Tab`/`Enter`) or fill-to-balance on a hotkey.
- Money: `inputMode=decimal`, normalized to 2dp on blur; integer-cent internally via
  `apps/web/src/lib/finance/money` (`toCents`/`sumCents`/`centsToString`).

Placement (**F2**): an always-present inline panel at the top of `/finance/daily-accounting` (zero
navigation). The **same** component is reused as the S5 intake-prefilled confirm surface — one editor
for blank-start and intake drafts.

Action set (**F3**): `暂存` (draft recovery; hardened by T-010) + `提交` (submit, draft→pending; T-003 auto-creates the
reviewer work item). **Posting is not in the entry surface** — `POST /v1/vouchers/:id/post` enforces
SoD / single-person二次确认 and belongs to the review queue.

Invariants preserved from the current form and service layer: front-end debit/credit balance in
integer cents (zero float), leaf + active account only, single-side per line, summary required for submit,
≥1 line with content, ≥2 lines.

## New entities (minimum data models)

### Intake (capture) — domain-agnostic
- `id` uuid; `orgId` uuid (req); `ledgerBookId` uuid (req — ledger-bound).
- `source` enum: `web` | `chat` | `email` | `api` (only `web` exercised this slice).
- `kind` enum: `image` | `pdf` | `text` | `structured`.
- `status` enum: `received` | `extracting` | `extracted` | `drafted` | `confirmed` | `discarded` | `failed`.
- `attachmentId` uuid nullable (FK → Attachment).
- `extraction` JSON nullable — extractor output (financial detail; ERP-only). Holds the extracted
  counterparty as a **string** (no `BusinessPartner` entity in T-004).
- `confidence` decimal nullable; `needsReview` boolean.
- `targetType` string nullable (e.g. `JournalVoucher`); `targetId` uuid nullable.
- `channelRef` string nullable — opaque correlation to the originating chat message / upload session
  (no content stored).
- `createdBy` string; `createdAt`/`updatedAt`.

Intake state machine:
```text
received ──(extract)──▶ extracting ──(ok)──▶ extracted ──(template)──▶ drafted ──(confirm)──▶ confirmed
   │                        │                                              │
   └──(discard)─────────────┴──(error)──▶ failed                          └──(discard)──▶ discarded
```
Transitions (trigger / actor / what persists):

| from → to | trigger | actor | persists |
|---|---|---|---|
| ∅ → `received` | `POST /v1/intakes` (capture) | user (web) | Intake + Attachment (via `ObjectStore`); outbox `intake.received` |
| `received` → `extracting` | extract picked up | system (inline mock; worker later) | status (+ worker claim) |
| `extracting` → `extracted` | extractor returns | system | `extraction` JSON + `confidence` + `needsReview` |
| `extracting` → `failed` | extractor error/unsupported | system | status, reason (ERP-only) |
| `extracted` → `drafted` | posting template | system (auto, G1) / user (retry) | voucher draft + `targetType/Id` + `WorkItem(voucher.confirm)` + audit + outbox `intake.drafted` |
| `drafted` → `confirmed` | submit via fast-entry confirm | user | voucher → pending/posted; WorkItem completes |
| `received`/`extracted`/`drafted` → `discarded` | `POST /:id/discard` | user | status + reason (draft voucher, if any, stays a normal draft) |

- `extract` is async-shaped: this slice runs it inline with a mock extractor but persists the
  intermediate `extracting`/`extracted` states so the real `apps/workers` job is a drop-in.
- **G1 — high-confidence auto-draft**: on `extracted`, the posting template runs automatically;
  high confidence → `drafted` + `pending_confirmation` (confirm face = review). Low confidence /
  unmatched / unbalanced → `drafted` + `needsReview=true` + `pending_completion` (manual fill).
- `extracted → drafted` is one-shot, guarded by `status` + an optimistic-concurrency `version`
  (same pattern as `WorkItem.version`), so one intake drafts exactly once.

### Attachment
- `id` uuid; `orgId`; `ledgerBookId`; `storageKey` string (via `ObjectStore` seam);
  `contentType`; `byteSize`; `sha256`; `createdBy`; `createdAt`.
- Append-only intent: aligns with the accounting-archive hard constraint; the local adapter is a
  stand-in for object-storage archival (deferred backend).

## Seams

### ObjectStore (deferred backend, local adapter now)
```text
put(orgId, ledgerBookId, bytes, contentType) -> { storageKey, sha256, byteSize }
getUrl(storageKey) -> signed/ephemeral URL (local adapter returns a local route)
```
Real object-storage archival (append-only, retention) is a later milestone; call sites do not change.

### Extractor (mock now, vision/LLM later) — the drop-in contract
The `Extractor` output is `ExtractionResultSchema` (in `packages/contracts`). It is the stable
contract the mock returns and the real OCR must satisfy, so swapping **A (mock → real Dashscope/通义,
ERP-side)** changes only the adapter, not callers.

```ts
// ERP-INTERNAL — financial detail allowed; MUST NOT pass through rejectForbiddenMetadata
const Field = <T>(v) => z.object({ value: v, confidence: z.number().min(0).max(1) });
ExtractionResultSchema = z.object({
  docType: z.enum(['bank_slip','invoice','receipt','unknown']).default('unknown'),
  fields: z.object({
    date:         Field(z.string().date()).optional(),
    amount:       Field(MoneyString).optional(),         // 2dp string, integer-cent safe; never float
    direction:    Field(z.enum(['in','out'])).optional(),
    counterparty: Field(z.string()).optional(),           // STRING (BusinessPartner deferred to T-005)
    summary:      Field(z.string()).optional(),
    docNo:        Field(z.string()).optional(),
  }),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  raw: z.string().optional(),                             // OCR raw text — ERP-only, never to outbox
  extractor: z.object({ name: z.string(), version: z.string() }), // provenance (DP12 generation 留存)
}).strict();
```
Mock returns deterministic fixtures keyed by `docType`; `extractor:{name,version}` records provenance
so mock-vs-real and model version are auditable.

### Two schema families (the boundary that makes capture DP24-safe)
- **Internal (ERP-only, detail allowed):** `ExtractionResultSchema`, `Intake.extraction`, the voucher
  draft. Stored in ERP DB only. NOT filtered by `rejectForbiddenMetadata`.
- **External (My-Chat-bound, forbidden-key filtered):** `SafeWorkItemMetadataSchema` and
  `OutboxEventEnvelopeSchema` (reused from T-003). The `intake.received` / `intake.drafted` events
  carry only `titleKey/workItemId/subStatus/deepLink/priority` — never amount/counterparty/raw.
- A contract test asserts the two never cross: outbox/work-item metadata for an intake-sourced draft
  rejects amount, counterparty, account lines, and OCR text.

## Posting template (code-first, minimal — Decision C)
Lives in **`packages/finance-domain`** (it knows account codes / debit-credit, so per the boundary
rules it MUST NOT sit in the domain-agnostic platform kernel). Separate from the workflow registry.

```ts
// packages/finance-domain
type PostingTemplate = {
  key: string; version: string;
  match: { docType: DocType; direction?: 'in' | 'out' };
  build(x: ExtractionResult): DraftVoucher;   // pure → the POST /v1/vouchers body shape
};
type DraftVoucher = { date: string; summary: string;
  lines: { accountCode?: string; summary: string; debit?: string; credit?: string }[] };
```
- Output is the **same create body** `POST /v1/vouchers` consumes; lines the template can't infer
  (the contra side) come back with `accountCode` unset → empty cells in the fast-entry grid.
- Example bank-slip / 收款(in): `debit 1002 银行存款 = amount`, `credit (accountCode unset)` with
  summary bound. The future CF tag / aux can use the existing `JournalEntryLine.cashFlowItem`/`aux`
  columns (left null in T-004).
- **Confidence routing**: build output is checked by finance-domain `voucherBalanceError` + leaf/
  active rules. Balanced + high confidence → `pending_confirmation`; otherwise → `pending_completion`.
  Never auto-posts; SoD still applies at confirm.
- Deliberately NOT the configurable `PostingRule` DB engine (M2 cashier work) — M2 adds that on top
  of the same `DraftVoucher` contract.

## Kernel touch-point
Add one `workItemType` to `FINANCE_DAILY_ACCOUNTING_WORKFLOW` (`packages/platform/src/workflow.ts`):
`voucher.confirm` (defaultAssignedRole `accountant`, defaultSubStatus `pending_confirmation`; actions:
`confirm`→submit the draft, `discard`→cancel). Sits alongside the existing `voucher.review`. No new
kernel primitives — reuses `WorkItem`/`WorkItemEvent`/outbox and `availableActions`.

## My-Chat inbound / outbound boundary (the key reconciliation)
Capture introduces an **inbound** path (built source-agnostic; web exercised this slice), but DP24
isolation must hold:

```text
INBOUND (capture):  client photo/intent ──▶ ERP POST /v1/intakes (source flag)
                    attachment bytes + extraction JSON persist ONLY in ERP.
                    channelRef correlates back to the source message (no content stored).

OUTBOUND (notify):  ERP OutboxEvent (metadata only) ──▶ My-Chat
                    e.g. "1 draft pending confirmation" — workItemId, status, subStatus,
                    priority, deepLink, title-key. NO amounts/partner/account/OCR text.

DETAIL FETCH:       My-Chat confirm card ──(deepLink, authorized)──▶ ERP fetches voucher draft detail
                    rendered transiently; never persisted to My-Chat search/recommendation/forum.
```
- Reuses the T-003 metadata-only `OutboxEventEnvelopeSchema` and its forbidden-keys contract test.
- This slice verifies the **web** capture path. Whether v1 lets the user *confirm* from a chat card
  or only from web is part of the deferred chat-inbound follow-up (ε); the pipeline supports either
  because confirm is an authorized ERP action.

## Decision records
- **α — capture-first inversion**: adopted as the foundation. Manual fast-entry is the fallback path,
  not the model.
- **β — contract split**: the Contract aggregate, `BusinessPartner`, and the timeline view move to
  **T-005**; T-004 does not introduce them. An extracted counterparty stays a string in the ERP-side
  extraction JSON.
- **γ — UI thin vertical first**: Phase 1 is the fast-entry grid on real `/v1`; the intake backend
  follows.
- **δ — real-API cutover**: the web voucher path is flipped to `/v1` at the data-source seam in this
  slice; reversible to fixtures if gaps appear.
- **ε — chat inbound**: capture API is source-agnostic; web path only this slice; My-Chat client
  integration is a recorded follow-up (cross-repo).
- **A — OCR mock first**: `Extractor` seam + deterministic mock; real model + worker deferred.
- **B — storage seam**: `ObjectStore` seam + local blob adapter; object-storage archival deferred.
- **C — minimal posting template**: code-first skeleton mapping; configurable engine deferred to M2.
- **D — inline fast-entry**: no modal for the primary path.
- **E — BusinessPartner deferred to T-005**: not required by T-004's voucher draft path.
- **F1 — api-client via OpenAPI codegen**: stand up `packages/api-client` (currently a stub) by
  generating from `docs/context/api/openapi.yaml`; payloads align with `CreateVoucherDto`.
- **F2 — fast-entry placement**: an always-present inline panel atop `/finance/daily-accounting`; the
  same `<VoucherFastEntry>` is reused for the S5 intake confirm surface.
- **F3 — entry action set**: `暂存` + `提交` only; posting belongs to the review queue (SoD /
  single-person二次确认), not the entry surface.
- **G1 — high-confidence auto-draft**: on `extracted`, the posting template runs automatically;
  high confidence drafts straight to `pending_confirmation`. Lowest friction, matches α.
- **Confidence routing (two-tier)**: high → `pending_confirmation` (one-tap confirm); low /
  unmatched / unbalanced → `pending_completion` (manual fill). Threshold is a code default for now.
- **Discard + no-silent-delete**: `discard` only sets `intake=discarded`; any voucher draft it created
  stays a normal draft (vouchers are never physically deleted, even drafts — per M1). A draft-void
  capability is a separate later question.

## Open questions to resolve later (not blocking T-004)
- Object-storage backend choice + retention wiring (deferred; needs infra decision).
- Real extractor model + async worker sequencing (deferred behind the seam).
- Chat-side confirm in v1 vs web-only first (deferred chat-inbound follow-up).
