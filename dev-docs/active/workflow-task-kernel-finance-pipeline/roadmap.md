# Roadmap - Workflow task kernel and finance daily pipeline

## Goal
Create a shared roadmap for making SME accounting daily work pipeline-like in the product while keeping the runtime model compatible with future ERP modules and multiple role-based workflows.

## Input trace
- User goal: make accounting daily work pipeline-like, and keep compatibility for future ERP multi-workflow upgrades.
- Repository baseline: M1 general ledger core is implemented; web workbench has a daily accounting entry but no real task queue.
- Hard constraints: finance correctness, no physical deletes, ledger scoped access plus RLS, role-based workflow rather than hard-coded linear pipeline, My-Chat integration isolation.
- Existing planning source: `docs/project/overview/requirements.md`, `docs/project/overview/project-blueprint.json`, `dev-docs/active/m1-general-ledger-core/`, `dev-docs/active/web-workbench-foundation/`.

## Scope
In scope:
- A platform-level workflow/task kernel that can be reused by finance, purchase, inventory, sales, HR, and later modules.
- Finance daily accounting pipeline as the first consumer: voucher completion, review/posting, reversal handling, period-close readiness, and later cashier payment handoff.
- Role workbenches for accountant, cashier, supervisor, admin, and viewer, backed by task queues rather than raw resource lists.
- Approval/outbox boundaries needed for My-Chat notifications and approval callbacks, without leaking financial details.
- Decision records and acceptance criteria before implementation.

Out of scope:
- Implementing non-finance ERP modules.
- Connecting payment rails or automatic disbursement.
- Directly using or connecting to the My-Chat database.
- Sending financial details into My-Chat search, recommendations, forums, or persistent collaboration storage.
- Introducing a heavyweight BPMN runtime before the lightweight task kernel is proven necessary.

## Core direction
The product MAY call the experience a pipeline, but the system SHOULD model it as role-based work items with explicit transitions. A single hard-coded accounting pipeline would conflict with the repo's DP26 constraint and would not scale to future ERP modules.

The workbench is personal in presentation but organizational in authority. Users enter a "my workbench" view as an individual, but every work item is still scoped to a company/organization membership. Finance work items additionally carry the ledger book scope. There is no personal finance workspace and no org-less task queue.

The preferred runtime shape is:

```text
Module registry
  -> workflow definitions
  -> work item types
  -> role queues
  -> allowed actions/transitions
  -> audit + outbox events
```

Finance becomes the first registered module. Its daily accounting workstream is one workflow family, not the platform itself.

## Confirmed decisions

- D1: Use persisted `WorkItem` records plus source-entity state machines. Work items provide queues, assignment, next actions, SLA/reminders, task history, and outbox correlation. Business entities such as vouchers and future payments remain the source of truth for business state. Transitions that touch both MUST run in one transaction.
- D2: Use a mixed workflow-definition model. Module workflow topology is code-first and versioned in TypeScript; organization/ledger-specific policies are DB-configured. Runtime tasks store workflow keys and definition versions, while policy rows control assignment, approval thresholds, SLA, and notification behavior.
- D3: Voucher review/posting is task-driven, not a standalone approval workflow by default. `JournalVoucher.status` remains a small accounting state machine (`draft`, `pending`, `posted`, `reversed`), while `WorkItem.status` / `subStatus` provides user-facing processing states such as pending completion, pending confirmation, waiting for me, waiting for others, returned, completed, and overdue. Standalone approval instances are mandatory for payment workflows and optional for vouchers only if future policy explicitly enables multi-step voucher approval.
- D4: My-Chat outbox events use metadata-only notification envelopes. Events MAY identify organization, module, workflow, work item, source type/id, assignee, status, priority, timestamps, and ERP deep link. Events MUST NOT include financial amounts, account lines, bank details, counterparties, summaries, attachments, OCR text, or approval comments. Detailed context is fetched only from ERP after authorization.
- P1: The workbench is a personal user experience: the default view is "my tasks", "my approvals", and "my recently handled work" for the signed-in individual.
- P2: The workbench cannot detach from company organization context: each task MUST be tied to `orgId`; finance tasks MUST also be tied to `ledgerBookId` where the source data is ledger-scoped. A user sees tasks only through their organization membership, role, permissions, and ledger scope.

## Milestones

### R0 - Decision alignment
Deliverables:
- Confirm the vocabulary: task/work item, workflow, workstream, queue, approval, outbox event, module capability.
- Decide persistence strategy for tasks: persisted work items vs derived queues vs hybrid.
- Decide whether workflow definitions are code-first, DB-configured, or mixed.
- Decide how approval policy belongs to the platform vs finance module.
- Decide which first vertical slice proves the model.

Exit criteria:
- Open decisions are resolved or explicitly deferred.
- `00-overview.md`, `01-plan.md`, and `02-architecture.md` reflect the chosen direction.

### R1 - Platform task kernel contract
Deliverables:
- Data/API contract for work items, assignments, transitions, and task event history.
- Module registration contract for declaring workflow capabilities.
- Permission model extension for task actions and approvals.
- Outbox event envelope with metadata-only payload rules for My-Chat.

Exit criteria:
- Completed for the backend-first slice on 2026-06-13. The contract can represent voucher review/posting and future payment approval without finance-specific hacks in platform code.

### R2 - Finance daily accounting first slice
Deliverables:
- Finance module maps existing voucher states into work item types.
- Accountant/supervisor queues show real backend-backed work items.
- Actions route through the existing voucher state machine, not around it.
- Audit and SoD rules remain enforced by the service layer and DB constraints.

Exit criteria:
- Backend path completed on 2026-06-13: submit creates a reviewer task, and task complete posts the voucher transactionally. UI queue wiring is deferred per D5.

### R3 - Cashier and approval extension
Deliverables:
- M2 cashier funds workflow model: receipt/payment draft, payment approval, payment confirmation, journal generation.
- Approval policy support for amount thresholds and multi-step approval.
- My-Chat notification/outbox integration boundaries documented for metadata-only delivery.

Exit criteria:
- Payment workflow can coexist with voucher workflow and use the same task kernel.

### R4 - ERP multi-workflow compatibility
Deliverables:
- Example non-finance module registration sketch, such as purchase request or inventory adjustment.
- Module isolation checks: no finance-only concepts in platform task kernel.
- Web navigation pattern for multiple modules and multiple workstreams.

Exit criteria:
- A future ERP module can add a workflow by registering capabilities and views, without rewriting the finance pipeline.

## Project structure change preview
Likely areas if implementation proceeds:
- `prisma/` - work item, transition history, approval, outbox, and optional workflow policy tables.
- `docs/context/api/` - contract-first API additions for work queues and actions.
- `docs/context/db/schema.json` - regenerated from Prisma after schema changes.
- `packages/platform/` - module registry, task kernel, generic approval primitives.
- `packages/contracts/` - shared zod contracts for tasks/events.
- `packages/db/` - repositories that return domain/platform entities and enforce org/ledger scopes.
- `apps/api/src/` - workflow/task controllers and finance integration actions.
- `apps/web/src/app/(workbench)/finance/` - real role queues and task-backed daily accounting.
- `apps/workers/` - outbox dispatch and later async workflow jobs.

## Verification strategy
- Governance: `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` and `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`.
- Context contracts, when changed: `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`.
- DB contract, when schema changes: `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`.
- Code implementation, when started: `pnpm typecheck`, `pnpm test`, focused integration tests for RLS, SoD, task transitions, and outbox idempotency.
- UI implementation, when started: `pnpm ui:governance` and route-level smoke checks for role queues.

## Risks
- Overfitting the platform kernel to vouchers would block future ERP modules.
- A generic workflow engine that is too broad would delay M2 without proving value.
- Persisted task state can drift from source entities unless transitions are transactional and audited.
- Outbox payloads can accidentally leak financial details unless the event envelope is strict.
- My-Chat approval surface is an external dependency and must not become required for ERP core operation.

## Rollback strategy
- Keep task kernel additive until proven.
- Source business state remains in finance entities; task records coordinate work but do not replace voucher/payment state machines.
- If the platform abstraction is wrong, disable module task registration and fall back to finance-specific queues without rewriting accounting data.

## Deferred decisions
- D5: W2d / task-kernel UI slice sequencing is deferred. UI-related changes may lag behind the task-kernel work, so this roadmap does not require a UI adjustment pass before non-UI contract/schema/backend planning proceeds. Revisit only when the user explicitly resumes UI work or asks to wire the task kernel into the web workbench.
