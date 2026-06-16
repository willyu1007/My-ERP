# 00 — Overview: Voucher fast-entry and capture intake

## Problem statement
My-ERP has a working M1 general ledger core and a backend-first T-003 work-item kernel, but daily
accounting still treats the **voucher form as the primary hand-typed input**. The most frequent
action (制单 / voucher entry) goes through a drawer plus a separate full-page form with full
`<select>` account pickers — high friction for the highest-frequency task. There is also no inbound
**capture** path: My-Chat only receives outbound notification metadata, so chat-driven scenarios
(photograph a bank slip → draft voucher → confirm) cannot be served.

This task makes voucher entry low-friction (an inline, keyboard-first grid on the real `/v1` API) and
lays a **capture-first** foundation: an economic event (a photo, a PDF) is captured, extracted,
mapped to a voucher draft, and confirmed in the **same** fast-entry editor. The voucher becomes a
generated, confirmable artifact.

## Status
- State: done
- **DONE (2026-06-16)**: all phases S1–S6 + S5b delivered and **live-verified** on real `/v1` + Postgres
  (capture → extract → auto-draft → confirm → submit, plus the web fast-entry/confirm/capture surfaces).
  All acceptance criteria met; full sweep green (typecheck, 115 tests, ui:governance, contracts/context/
  governance). Deferred-behind-seams items (real OCR, object storage, chat inbound) and T-005 (contract
  aggregate) are separate follow-ups.
- Scope was narrowed at the 2026-06-14 top-level alignment (see below); readiness pass 2026-06-15
  (`06-readiness-review.md`).
- **S1 complete** (2026-06-15): S1a `@my-erp/api-client` via OpenAPI codegen; S1b env-gated
  data-source cutover to `/v1` with fixture fallback; S1c inline keyboard-first `<VoucherFastEntry>`
  grid wired into `/finance/daily-accounting`. Verified by typecheck, `pnpm ui:governance`, 97 tests,
  and a runtime SSR smoke (GET 200, grid markers present). Live `/v1` write round-trip not yet
  exercised (needs a running API + seed); the grid runs in demo mode on fixtures meanwhile.
- **S2 done** (2026-06-15): `Intake`/`Attachment` Prisma models + migration with org+ledger RLS
  (WITH CHECK), scoped repositories (version-guarded one-shot update), DB context regenerated. Verified
  by prisma validate, strict context verify, typecheck, and 102 tests (incl. a 5-test `intake-rls`
  RLS integration suite).
- **S3 done** (2026-06-15): `ExtractionResultSchema` + intake contracts (`packages/contracts`),
  posting-template registry (`packages/finance-domain`), `voucher.confirm` workItemType +
  `Extractor`/`ObjectStore` seams + CASL `Intake` actions (`packages/platform`). Verified by typecheck
  + 108 tests (incl. two-schema-boundary + posting-template tests).
- **S4 done** (2026-06-15): intake API (`apps/api/src/intakes/`) — `LocalObjectStore` + `MockExtractor`
  seam adapters, capture/list/detail/extract/discard endpoints, metadata-only outbox, OpenAPI + api-index
  (33 endpoints). Verified by typecheck, 111 tests, openapi quality, and a runtime route smoke.
- **S5 (backend) done** (2026-06-15): auto-draft pipeline — `extract` chains to high-confidence
  auto-draft (G1); `draftVoucherFromIntakeTx` builds + persists the voucher draft + a `voucher.confirm`
  work item transactionally (version-guarded), confidence routing; submit completes the confirm task.
  Verified by typecheck + 115 tests (helpers + persistence-chain integration).
- **Live e2e verified** (2026-06-15): added `pnpm dev:seed` (`scripts/dev-seed.mjs`); brought up
  docker PG + API + web and proved capture → extract → **auto-draft** → confirm-workitem on real `/v1`,
  and the web daily-accounting page rendering the real draft (S1b cutover). See `04-verification`.
- **S5b done** (2026-06-16): web confirm surface — `<VoucherFastEntry>` edit/confirm mode (`voucherId`
  + `initial`), the draft-voucher detail page opens prefilled, a `拍照/上传票据` capture button, and
  intake methods on `@my-erp/api-client`. Live-verified: confirm opens the prefilled draft, and
  PATCH-contra → submit → pending + `voucher.confirm` completed + `voucher.review` opened.
- **S6 sign-off + T-004 DONE** (2026-06-16): full sweep green (typecheck, **115 tests**,
  ui:governance, api-index + openapi quality, strict context verify, governance lint); all acceptance
  criteria met; whole pipeline live-verified. Status → **done**.

## Top-level decisions (2026-06-14 alignment)
- **α** Capture-first inversion is the central bet (voucher = generated/confirmed artifact; manual
  fast-entry is the fallback). Adopted.
- **β** The finance-side Contract / 交易生命周期 aggregate is **split to a separate task T-005** and
  is NOT in this task.
- **γ** **UI thin vertical first**: ship the inline fast-entry grid on the real `/v1` voucher API to
  relieve #1, then layer the intake pipeline.
- **δ** **Flip the web voucher path from fixtures to real `/v1`** as part of this slice (the M1 P3
  controller already exposes create/update/submit/post/reverse).
- **ε** The capture API is **source-agnostic**; this slice wires/verifies the **web** path only.
  My-Chat chat-client integration is a recorded follow-up.
- Slice defaults: **A** mock OCR behind `Extractor` seam · **B** local blob behind `ObjectStore`
  seam · **C** minimal code-first posting template · **D** inline keyboard-first editor (no modal) ·
  **E** `BusinessPartner` deferred to T-005 (extracted counterparty stays a string in ERP-side
  extraction JSON).

## Goal
On top of M1 and the T-003 kernel:
- An inline, keyboard-first voucher fast-entry surface that replaces the drawer + separate-page
  primary path, on the real `/v1` voucher API (web data-source cutover).
- A domain-agnostic `Intake` (capture) entity + async-shaped state machine, an `Attachment` record,
  and `ObjectStore` / `Extractor` seams (mock/local adapters first).
- A source-agnostic capture API (web path verified) that keeps financial detail in ERP and emits only
  metadata-only outbox events.
- A minimal code-first posting template mapping extraction → `JournalVoucher` draft + a
  `voucher.confirm` work item (`pending_confirmation`), confirmed in the same fast-entry editor.

## Non-goals
- Contract / transaction-lifecycle aggregate, `BusinessPartner`, timeline view → **T-005**.
- Real vision/LLM OCR model + async worker (seam + mock only).
- Real object-storage archival backend (seam + local adapter only).
- Configurable posting-rule engine, approval policy tables, cashier funds documents.
- Financial reports (BS/IS/CF or management) — separate milestone.
- My-Chat chat-client (inbound chat) integration — recorded follow-up.
- Never write financial detail into My-Chat search/recommendation/forum storage (DP24).
- Do not change the voucher state machine or ledger derivation logic.

## High-level acceptance criteria
- [x] A balanced voucher can be entered keyboard-only in an inline grid (no modal); the primary entry
      path no longer requires the drawer/new-page flow. **(S1c; SSR-rendered)**
- [x] The web voucher path reads/writes real `/v1`, not fixtures. **(S1b; live-verified — daily
      accounting renders real `/v1` drafts; create/submit live, post via the review queue.)**
- [x] An economic event can be captured (web upload; `source` is a flag so chat reuses it later),
      stored ERP-side, and produces an `Intake` row; the notification path carries only safe metadata.
      **(S4; live-verified + outbox-safety test.)**
- [x] A captured intake is mapped by a posting template into a `JournalVoucher` draft plus a
      `voucher.confirm` work item, in one transaction with audit + metadata-only outbox, and **opens
      in the same fast-entry editor for confirm**. **(S5 + S5b; live-verified end-to-end — capture →
      auto-draft → confirm opens prefilled → submit → pending + confirm task completed + review opened.)**
- [x] Debit/credit balance (integer cents, zero float), leaf+active account rules, no-silent-delete,
      SoD, audit, org+ledger RLS, and the metadata-only My-Chat boundary are all preserved.
- [x] Tests cover intake RLS, intake transitions, posting-template output, outbox-metadata safety,
      and the fast-entry balance invariant; local suite green (**115 tests**).

## Pointers
- Root constraints: `AGENTS.md` (Hard constraints)
- Requirements / blueprint: `docs/project/overview/`
- M1 baseline: `dev-docs/active/m1-general-ledger-core/`
- Work-item kernel baseline (reused): `dev-docs/active/workflow-task-kernel-finance-pipeline/`
- Contract follow-up: `dev-docs/active/finance-contract-transaction-lifecycle/` (T-005)
- Voucher API: `apps/api/src/vouchers/vouchers.controller.ts`
- Web data-source seam (δ cutover): `apps/web/src/lib/finance/data-source.ts`
- Entry UI being replaced: `apps/web/src/app/(workbench)/finance/vouchers/new/new-voucher-client.tsx`,
  `apps/web/src/app/(workbench)/finance/daily-accounting/daily-accounting-client.tsx`
