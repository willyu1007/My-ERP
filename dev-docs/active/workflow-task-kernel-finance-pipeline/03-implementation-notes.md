# 03 - Implementation notes

## 2026-06-12 - Task package created
- Created the task package to align decisions before implementation.
- Current repository evidence shows M1 accounting core exists, but task/workflow/approval/outbox/module-registry runtime is not implemented yet.
- Initial direction: use a lightweight platform task kernel first, not a heavyweight BPMN runtime and not a hard-coded finance-only pipeline.

## 2026-06-12 - D1 aligned: persisted work items with personal workbench / organization authority
- Confirmed D1: use persisted `WorkItem` records for queues, assignments, task history, reminders, and outbox correlation while keeping source entities such as vouchers/payments as the business-state source of truth.
- Confirmed product principle: the workbench is personal for the signed-in user ("my tasks", "my approvals"), but every task is authorized through organization membership and role/permission checks.
- Confirmed tenancy principle: tasks cannot be organization-less. All work items carry `orgId`; finance ledger-scoped tasks also carry `ledgerBookId`.

## 2026-06-12 - D2 aligned: mixed workflow definition model
- Confirmed D2: module workflow topology is code-first and versioned in TypeScript; organization/ledger-specific policies are DB-configured.
- Runtime tasks should store workflow keys and definition versions so historical work remains explainable after module workflow definitions evolve.
- Configurable policy should cover assignment, approval thresholds, SLA, and notification behavior, but should not let users arbitrarily rewrite finance state topology.

## 2026-06-12 - D3 aligned: voucher review stays task-driven with user-facing work item statuses
- Confirmed D3: vouchers do not use standalone approval workflow by default. A pending voucher creates a reviewer work item; an authorized non-maker can post or return it, with existing SoD and audit still enforced.
- Confirmed state layering: `JournalVoucher.status` remains the compact accounting state machine, while `WorkItem.status` / `subStatus` carries workbench-facing states such as pending completion, pending confirmation, waiting for me, waiting for others, returned, completed, and overdue.
- Confirmed extension path: payment workflows must use standalone approval instances; vouchers may opt into multi-step approval later via explicit policy.

## 2026-06-12 - D4 aligned: My-Chat receives metadata-only event envelopes
- Confirmed D4 as the initial integration boundary: My-Chat outbox events may carry identifiers, workflow/task metadata, assignment, priority, timestamps, and ERP deep links.
- Confirmed forbidden payload categories: financial amounts, account lines, bank details, counterparties, summaries, attachments, OCR text, approval comments, and audit-detail payloads.
- Detailed task and source-entity context must be fetched from ERP after authorization instead of being pushed into My-Chat.

## 2026-06-13 - WorkItem minimum data model aligned
- Confirmed a two-table minimum model: `WorkItem` for current queue state and `WorkItemEvent` for append-only transition history.
- Confirmed v1 status values: `open`, `claimed`, `waiting`, `returned`, `completed`, `canceled`.
- Confirmed view-only states such as waiting for me, waiting for others, and overdue are derived from assignment/role/permission/time, not stored as primary status values.
- Confirmed `metadata` remains display-safe and cannot contain financial details or My-Chat-forbidden payload categories.

## 2026-06-13 - Platform common subStatus vocabulary aligned
- Confirmed `subStatus` is a stable machine key explaining why a work item is in its current lifecycle state and what next-step category is expected.
- Confirmed platform common v1 values: `pending_completion`, `pending_confirmation`, `pending_review`, `pending_correction`, `pending_external`, `pending_system`, `blocked`, `ready`, `done`.
- Module-specific `subStatus` keys remain allowed through code-first `WorkflowDefinition`; voucher/payment-specific vocabularies are not finalized yet.

## 2026-06-13 - Visibility vs actionability aligned
- Confirmed visibility and actionability are separate decisions. A user may be allowed to see a work item without being allowed to act on it.
- Confirmed visibility depends on organization membership, ledger access, assignment/role/creator/history/supervision/audit policy.
- Confirmed actionability additionally requires workflow action availability, operation permission, assignment eligibility, source-entity state validity, SoD checks, and optimistic concurrency.
- Confirmed APIs may return backend-computed `availableActions`; frontends must not infer task permissions.

## Open issues
- D5 is deferred. UI-related changes may lag behind the task-kernel work and are not a blocker for non-UI contract/schema/backend planning.
- The first implementation slice is completed as a backend-first voucher-backed task kernel: schema/RLS/contracts/auth/API/repository plus voucher submit/post adapter.
- Decide how this task should interact with W2d from `web-workbench-foundation` only when UI work is resumed.

## 2026-06-13 - Backend-first implementation slice completed
- Added persisted task-kernel schema for `WorkItem`, `WorkItemEvent`, and `OutboxEvent`, including org + optional ledger RLS policies and DB-level active-task dedupe.
- Added shared task contracts for status, platform subStatus, work item views/actions, safe metadata, and metadata-only outbox envelopes.
- Added platform workflow types and extended CASL with `WorkItem` plus task actions: `claim`, `complete`, `return`, `assign`, and `cancel`.
- Added DB repository helpers for optional-ledger scope, work item create/list/detail/claim/transition/cancel/source-completion, append-only events, and outbox append.
- Added `/v1/work-items` list/detail/action API. Responses include backend-computed `availableActions`; action execution rechecks source state, assignment, operation permission, SoD, and optimistic version.
- Wired vouchers into the task kernel: submitting a balanced draft creates a supervisor review work item; direct voucher post and task `complete` both post the voucher and complete active review work items in the same transaction.
- Added tests for metadata safety, task authorization, and Postgres RLS/dedupe/append-only behavior.
- Refreshed API and DB context artifacts.
- Did not apply the new migration to the current development database; migration application remains an explicit DB sync/deploy step.

## 2026-06-13 - Implementation review fixes applied
- Tightened WorkItem visibility so detail/list results require a concrete visibility basis: assigned user, assigned role, creator, historical handler, or supervisor/admin oversight.
- Restricted `audit_readonly` to supervisor/admin capability until a dedicated audit role is introduced.
- Changed `availableActions` to include source voucher state and SoD checks, so maker/self-post and non-pending voucher cases do not advertise impossible `complete` actions.
- Made `expectedVersion` mandatory for all work item actions to align the API with optimistic concurrency semantics.
- Changed generic claim behavior to preserve the existing `subStatus` instead of forcing voucher-specific `pending_review`.
- Replaced metadata blacklist validation with a strict allowlist for WorkItem metadata.
- Added list pagination controls (`limit`, `cursor`) and repository defaults to avoid unbounded task queries.
- Changed the `WorkItemEvent -> WorkItem` foreign key to restrict deletes, keeping append-only event history semantics at the DB relationship level.
- Added focused tests for visibility/action rules, metadata allowlist, generic claim behavior, and list limit handling.
