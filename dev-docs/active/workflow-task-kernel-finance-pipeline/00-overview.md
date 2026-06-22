# 00 - Overview: Workflow task kernel and finance daily pipeline

## Problem statement
My-ERP has a working M1 general ledger core and a web workbench that frames daily accounting as a workflow entry. The missing layer is a durable, reusable way to express role-based work items, approvals, task queues, and cross-role transitions. Without that layer, accounting daily work will either remain static UI over voucher lists or become a hard-coded linear finance pipeline that cannot scale to future ERP modules.

## Status
- State: done
- Closed 2026-06-17, scoped to the **platform task kernel + finance voucher slice (R0/R1/R2, incl. R2-UI)**.
  The deferred extensions were spun out to their own tasks: **R3 → T-007** (finance-cashier-payments),
  **R4 → T-008** (erp-multi-workflow-compat); the **outbox dispatch worker** (My-Chat delivery) is folded
  into T-007's notification scope. `return`/`assign` actions + workflow policy tables ride along with T-007.
- Backend-first implementation slice completed on 2026-06-13.
- Implemented scope: WorkItem / WorkItemEvent / OutboxEvent schema and RLS, shared task contracts, platform authorization, task API, voucher-backed review/post adapter, metadata-only outbox envelope, and focused tests.
- **R2-UI done (2026-06-17):** `/finance/workbench` (我的工作台) — the first real web consumer of the
  kernel. Views 待我处理 / 监督 / 我处理过; actions (领取 / 通过并过账 / 取消) rendered from each item's
  backend `availableActions` with optimistic `expectedVersion`. Backend readiness fix: `viewWhere`
  elevates supervision-capable callers (admin/SME-single-admin now see their tasks; see `07`). Live +
  browser verified (submit → review task → 通过并过账 → posted → 我处理过). 136 tests green.
  > **Superseded (2026-06-22, T-009):** this `/finance/workbench` page was deleted in commit `14930db`
  > during the web-workbench kit 0.4.0 convergence and was NOT restored through 0.5.0/0.6.0/0.6.1, so the
  > web silently regressed to voucher-list-derived 待办. The kernel (backend) stayed intact. The page was
  > rebuilt on the 0.6.1 kit under **T-009 (finance-workbench-kernel-rewire)**.
- Spun out (not part of this closed task): **R3** cashier + payment approval — **shipped in T-007**;
  **R4** multi-module compatibility — **T-008** (planned). Genuinely still deferred: the **outbox dispatch
  worker** (My-Chat delivery — `apps/workers` is a placeholder), `return`/`assign` work-item actions, and
  configurable workflow policy tables.

## Goal
Define and align a platform-compatible workflow/task roadmap so SME accounting daily work can become pipeline-like for users while remaining a reusable multi-workflow ERP capability.

## Non-goals
- Do not implement code before decisions are confirmed.
- Do not replace the existing voucher state machine or ledger derivation logic.
- Do not connect automatic payment/disbursement channels.
- Do not implement purchase, inventory, sales, HR, or other non-finance modules.
- Do not store financial details in My-Chat or connect to the My-Chat database.
- Do not introduce a heavyweight BPMN runtime as the first step.

## High-level acceptance criteria
- [x] The task vocabulary and boundaries are clear enough for a future contributor to implement without re-opening core terminology.
- [x] The roadmap distinguishes platform task kernel work from finance module workflow work.
- [x] The implemented backend slice preserves finance invariants: debit/credit balance, no silent delete, SoD, audit, transaction boundaries, ledger scope, and RLS.
- [x] Future ERP modules can register workflows without depending on finance-specific concepts.
- [x] My-Chat integration boundaries remain metadata-only and isolated from financial details.
- [x] Open decisions are either resolved with the user or kept explicit in the roadmap.

## Pointers
- Root constraints: `AGENTS.md`
- Requirements: `docs/project/overview/requirements.md`
- Blueprint: `docs/project/overview/project-blueprint.json`
- M1 baseline: `dev-docs/active/m1-general-ledger-core/`
- Web baseline: `dev-docs/active/web-workbench-foundation/`
- API context: `docs/context/api/API-INDEX.md`
- DB context: `docs/context/db/schema.json`
