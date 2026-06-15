# 00 - Overview: Workflow task kernel and finance daily pipeline

## Problem statement
My-ERP has a working M1 general ledger core and a web workbench that frames daily accounting as a workflow entry. The missing layer is a durable, reusable way to express role-based work items, approvals, task queues, and cross-role transitions. Without that layer, accounting daily work will either remain static UI over voucher lists or become a hard-coded linear finance pipeline that cannot scale to future ERP modules.

## Status
- State: in-progress
- Backend-first implementation slice completed on 2026-06-13.
- Implemented scope: WorkItem / WorkItemEvent / OutboxEvent schema and RLS, shared task contracts, platform authorization, task API, voucher-backed review/post adapter, metadata-only outbox envelope, and focused tests.
- Deferred scope: UI wiring, payment approval workflows, configurable workflow policy tables, and My-Chat delivery worker.

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
