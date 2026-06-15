# Roadmap — Voucher fast-entry and capture intake

## Goal
Make the single most frequent accounting action — voucher entry (制单) — low-friction, and lay the
capture-first foundation so the same path can later serve a My-Chat mobile/chat surface (e.g.
"photograph a bank slip → draft voucher → confirm"). The voucher becomes a generated, confirmable
artifact rather than the primary hand-typed input; manual fast-entry is the fallback.

> Scope note (2026-06-14 top-level alignment): the finance-side **Contract / 交易生命周期** aggregate
> is split out to **T-005** and is NOT part of this task. T-004 is laser-focused on fast-entry +
> capture intake.

## Input trace
- User goals (2026-06-14 discussion): (#1) voucher entry is the most-used action but slow (drawer +
  full-page form + full `<select>` pickers); (#2) no inbound capture path for chat scenarios;
  (#3) no reports; (#4) no contract-centric transaction lifecycle. This task addresses #1 and #2 and
  lays the chat foundation; #3 and #4 are separate milestones (#4 → T-005).
- Top-level decisions (2026-06-14 alignment):
  - **α central bet**: capture-first inversion — economic event is the unit of capture; voucher is a
    generated/confirmed artifact; manual fast-entry is the fallback. Adopted.
  - **β contract scope**: the contract skeleton is **split to a separate task T-005**, not in T-004.
  - **γ sequencing**: **UI thin vertical first** — ship the inline fast-entry grid on the real `/v1`
    voucher API to relieve #1, then layer the intake pipeline behind it.
  - **δ real-API cutover**: this slice **flips the web voucher path from fixtures to real `/v1`**
    (replace `apps/web/src/lib/finance/data-source.ts` bodies with `@my-erp/api-client` calls). The
    M1 P3 controller already exposes create/update/submit/post/reverse.
  - **ε chat inbound**: the capture API is **source-agnostic** (`source=chat` is just a flag), but
    this slice only wires/verifies the **web** path. My-Chat client integration is a recorded
    follow-up (cross-repo), not in T-004.
- Repository baseline: M1 GL core done; T-003 work-item kernel done backend-first
  (`WorkItem`/`WorkItemEvent`/`OutboxEvent`, `voucher.confirm`/`pending_confirmation`,
  metadata-only outbox, `availableActions`). Voucher REST API exists
  (`apps/api/src/vouchers/vouchers.controller.ts`). Web runs on fixtures via the data-source seam.
- Ground-truth gaps (2026-06-14): no OCR/LLM channel in this repo (`packages/llm` is the separate
  My-Chat repo); no object storage wired (`JournalVoucher.attachments` is only an `Int` count, no
  attachment entity); `apps/workers/` exists but has no jobs.

## Confirmed decisions
Top-level (α/β/γ/δ/ε): see Input trace above.

Slice defaults (A–E):
- **A. OCR**: mock extraction first behind an `Extractor` seam; the real vision model + the
  `apps/workers` job are deferred. State machine is async-shaped so the real job is a drop-in.
- **B. Attachment / archive storage**: local/DB blob behind an `ObjectStore` seam; real append-only
  object-storage archival deferred, call sites unchanged.
- **C. PostingRule**: minimal code-first **posting template** (capture kind → entry skeleton + value
  binding) only; configurable rule engine deferred to M2 cashier work.
- **D. Fast-entry editor**: **inline, keyboard-first**; no modal for the primary entry path.
- **E. BusinessPartner**: **deferred to T-005** (it is needed by the contract aggregate). In T-004 an
  extracted counterparty stays as a string field inside the ERP-side extraction JSON — M1 voucher
  lines have no partner/auxiliary dimension yet, so no partner entity is required here.

## Scope
In scope:
- An inline, keyboard-first voucher fast-entry surface that replaces the drawer + separate-page
  primary path, on the **real `/v1`** voucher API (web data-source cutover).
- A domain-agnostic `Intake` (capture) entity + async-shaped state machine, an `Attachment` record,
  and `ObjectStore` / `Extractor` seams (mock/local adapters first).
- A source-agnostic capture API (web path verified this slice) that keeps financial detail in ERP and
  emits only metadata-only outbox events.
- A minimal code-first posting template that maps extraction to a `JournalVoucher` draft and creates
  a `voucher.confirm` work item (`pending_confirmation`) transactionally (reuses the T-003 kernel),
  confirmed in the **same** fast-entry editor.

Out of scope (this slice):
- Contract / transaction-lifecycle aggregate, `BusinessPartner`, timeline view → **T-005**.
- Real vision/LLM OCR model + async worker (seam + mock only).
- Real object-storage archival backend (seam + local adapter only).
- Configurable posting-rule engine, approval-policy tables, cashier funds documents.
- Financial reports (#3) — separate milestone.
- My-Chat chat-client integration (the inbound chat path) — recorded follow-up.
- Any write of financial detail into My-Chat search/recommendation/forum storage (DP24).

## Core direction
The economic event becomes the unit of capture; the voucher becomes a generated, confirmable artifact.

```text
[capture]                [extract]              [draft]                       [confirm]        [post]
web upload (this slice) ─▶ Intake(received) ─▶ extraction JSON ─▶ JournalVoucher(draft) + ───▶ edit/confirm ─▶ posted
chat (later, same API)   + attachment in       (Extractor seam,   WorkItem(voucher.confirm,    in fast-entry grid
                          ObjectStore seam       mock first)        subStatus=pending_confirmation)
                                                                    [reuses T-003 kernel]
                          OutboxEvent (metadata only) ──────────────────────────────────────▶ My-Chat
                                                  "1 draft pending confirmation"; detail fetched from ERP after auth
```

The intake confirm surface **is** the fast-entry grid, so #1 and #2 converge on one editor.

## Milestones (UI thin vertical first)
- **S0 — Top-level decision alignment** (this bundle): freeze α–ε and A–E; freeze intake state
  machine and the My-Chat metadata boundary.
- **S1 — Fast-entry on real `/v1` (UI thin vertical)**: extend `@my-erp/api-client` for voucher
  create/submit/post as needed; flip the web voucher data-source from fixtures to `/v1`; build the
  inline keyboard-first fast-entry grid; replace the modal/new-page primary path. Delivers #1.
- **S2 — Intake schema + RLS**: `Intake`, `Attachment`; org + ledger RLS; regenerate DB context.
- **S3 — Platform contracts + authz**: zod intake DTOs + extraction-result schema, intake state
  machine, capture source enum, CASL intake actions, the code-first posting-template registry.
- **S4 — Intake API + seams**: `ObjectStore`/`Extractor` seams (local/mock), source-agnostic
  capture/list/detail/draft/discard endpoints (web path verified), metadata-only outbox.
- **S5 — Posting-template → draft + confirm**: minimal template mapping; transactional draft +
  `voucher.confirm` work item + audit + outbox; the draft opens in the same fast-entry editor.
- **S6 — Verification + docs**: typecheck, tests (intake RLS/state machine, posting-template,
  outbox-metadata safety, fast-entry balance), governance + context verify.

## Verification strategy
- Governance: `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` then
  `lint --check --project main`.
- Context contracts when changed: `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`.
- DB contract when schema changes: `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`.
- Code: `pnpm typecheck`, `pnpm test`, focused integration tests for intake RLS, intake transitions,
  posting-template output, outbox-metadata absence of financial detail, fast-entry balance invariant.
- UI: `pnpm ui:governance` + route smoke checks for the fast-entry surface.

## Risks
- Capture pipeline could leak detail to My-Chat → extraction/attachments live only in ERP; outbox is
  metadata-only and contract-tested; chat fetches detail from ERP after auth.
- Real-API cutover (δ) could surface gaps between fixture VMs and `/v1` shapes → keep the VM contract
  as the seam; cut over voucher reads + writes together; smoke-test the full create→submit→post path.
- Intake/voucher/work-item state drift → draft creation and confirm are transactional with the work
  item, audit, and outbox (same rule as T-003).
- Mock OCR hides real-model edge cases → stable `Extractor` schema with confidence/needsReview so the
  real model is a drop-in.
- Fast-entry regresses correctness → keep integer-cent balance + leaf/active account rules; service
  invariants unchanged.

## Rollback strategy
- All additions are additive: `Intake`/`Attachment` are new tables; no change to the voucher state
  machine or ledger derivation.
- δ cutover is reversible at the data-source seam (one file) — fall back to fixtures if `/v1` gaps
  appear.
- If the capture pipeline proves wrong, disable the capture API + posting template; manual fast-entry
  still stands alone on real `/v1`.

## Deferred / follow-up
- **T-005**: finance-side Contract aggregate (entity + `JournalVoucher.contractId` + timeline),
  minimal `BusinessPartner`; lifecycle via the D2 model; needs M2 cashier entities to be fully useful.
- **Chat inbound integration** (ε): wire the My-Chat capture client to the source-agnostic capture
  API; cross-repo; record as a follow-up task.
- Real OCR model + `apps/workers` async job (A); object-storage archival backend (B); configurable
  posting-rule engine (C).
