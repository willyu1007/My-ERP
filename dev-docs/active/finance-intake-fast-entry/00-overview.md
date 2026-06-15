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
- State: in-progress
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
- **Next: S5** — posting-template → auto-draft → confirm (closes the capture loop).

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
- [ ] A balanced voucher can be entered keyboard-only in an inline grid (no modal); the primary entry
      path no longer requires the drawer/new-page flow.
- [ ] The web voucher path reads/writes real `/v1` (create → submit → post), not fixtures.
- [ ] An economic event can be captured (web upload; `source` is a flag so chat reuses it later),
      stored ERP-side, and produces an `Intake` row; the notification path carries only safe metadata.
- [ ] A captured intake can be mapped by a posting template into a `JournalVoucher` draft plus a
      `voucher.confirm` work item, in one transaction with audit + metadata-only outbox, and opens in
      the same fast-entry editor.
- [ ] Debit/credit balance (integer cents, zero float), leaf+active account rules, no-silent-delete,
      SoD, audit, org+ledger RLS, and the metadata-only My-Chat boundary are all preserved.
- [ ] Tests cover intake RLS, intake transitions, posting-template output, outbox-metadata safety,
      and the fast-entry balance invariant; local suite green.

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
