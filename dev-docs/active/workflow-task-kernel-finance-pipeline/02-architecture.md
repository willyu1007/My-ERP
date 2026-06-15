# 02 - Architecture

## Baseline
Current implementation has:
- Finance accounting source of truth: `JournalVoucher`, `JournalEntryLine`, `Account`, `OpeningBalance`, and derived ledgers.
- Platform auth foundation: organization, membership, invitation, ledger book, CASL actions, org/ledger scope, and RLS.
- Web workflow entry: `/finance/daily-accounting`, currently backed by fixture vouchers.

Current implementation does not have:
- Configurable workflow policy tables.
- Generic approval engine or approval policy tables.
- My-Chat delivery worker.
- Payment/receipt/cash journal entities.

Implemented T-003 backend-first slice:
- Persisted `WorkItem`, `WorkItemEvent`, and `OutboxEvent` tables.
- RLS policies requiring org scope, plus ledger scope for ledger-bound finance tasks.
- DB repositories returning plain entities from `packages/db`.
- Shared zod task/outbox contracts in `packages/contracts`.
- Platform workflow/task type declarations and CASL task actions in `packages/platform`.
- Work item list/detail/action API in `apps/api`.
- Voucher-backed adapter: submit creates a reviewer work item; direct voucher post and task complete both post the source voucher and complete active reviewer work items transactionally.

## Proposed layering

```text
apps/web
  role workbench views
  task queues and actions

apps/api
  task/workflow API
  finance action adapters

packages/platform
  module registry
  task kernel primitives
  approval primitives
  outbox envelope rules

packages/finance-domain
  finance invariants and state-machine guards

packages/db
  scoped repositories
  task/source entity transactions

prisma
  platform task/outbox tables
  finance source tables
```

## Boundary rules
- Platform task kernel MUST NOT import Prisma directly outside `packages/db` repository paths.
- Platform task kernel MUST NOT know finance account codes, debit/credit, voucher line shape, or cash account details.
- Finance module owns finance state machines and accounting invariants.
- Task records coordinate work; they do not replace voucher/payment source states.
- Workbench UX is individual-facing, but task authority is never individual-only: the signed-in user acts as an organization member with roles and permissions.
- Every persisted work item MUST carry `orgId`; finance work items MUST also carry `ledgerBookId` when their source entity is ledger-scoped.
- Every task query MUST carry org scope and, when finance-ledger scoped, ledger scope.
- High-sensitivity actions MUST retain operation-level authorization and SoD checks.
- My-Chat outbound events MUST carry metadata only and MUST NOT include financial details.

## Candidate concepts
- `WorkflowDefinition`: code-first, versioned declaration of a workflow family, owned by the registering module.
- `WorkflowPolicy`: DB-configured organization/ledger policy for assignment, approval thresholds, SLA, and notification behavior.
- `WorkItem`: one actionable item assigned to a role or user, linked to a source entity, always scoped by organization and optionally by ledger book.
- `WorkItem.status` / `subStatus`: user-facing processing state for the workbench. It explains whether an item is pending completion, pending confirmation, waiting for me, waiting for others, returned, completed, or overdue. It MUST NOT replace the source entity's business status.
- `WorkItemAction`: an allowed command from the current state.
- `WorkItemEvent`: append-only transition/audit history for work item lifecycle.
- `Assignment`: role/user ownership and optional claimed-by behavior; role assignment determines eligibility, while user assignment/claim makes the workbench personal.
- `ApprovalPolicy`: configurable policy for multi-level or amount-threshold approvals.
- `OutboxEvent`: transactional metadata-only event envelope for notification and callback integration.
- `ModuleCapability`: module registration unit that exposes workflows, nav entries, and permissions.

## WorkItem minimum data model

`WorkItem` is the current queue state. It is persisted, scoped, and safe to list in a personal workbench. It coordinates work but does not replace the source entity business state.

Minimum fields:
- `id`: uuid.
- `orgId`: uuid, required.
- `ledgerBookId`: uuid nullable; required for finance work items whose source entity is ledger-scoped.
- `moduleKey`: string, for example `finance`, `purchase`, `inventory`.
- `workflowKey`: string, for example `daily-accounting`, `payment-approval`.
- `workflowVersion`: string, from the code-first workflow definition.
- `workItemType`: string, for example `voucher.review`, `voucher.confirm`, `payment.approve`.
- `sourceType`: string, for example `JournalVoucher` or `Payment`.
- `sourceId`: uuid.
- `dedupeKey`: string, used to prevent duplicate active work items for the same source/type.
- `status`: enum, see below.
- `subStatus`: string, module-defined processing detail such as `pending_confirmation`.
- `priority`: enum, one of `low`, `normal`, `high`, `urgent`.
- `assignedRole`: string, such as `accountant`, `cashier`, or `supervisor`.
- `assigneeUserId`: string nullable.
- `claimedAt`: datetime nullable.
- `availableAt`: datetime.
- `dueAt`: datetime nullable.
- `completedAt`: datetime nullable.
- `canceledAt`: datetime nullable.
- `createdBy`: string.
- `completedBy`: string nullable.
- `version`: integer for optimistic concurrency.
- `createdAt`: datetime.
- `updatedAt`: datetime.
- `titleKey`: string for safe display text.
- `metadata`: JSON nullable; MUST NOT contain financial details.

`WorkItem.status` v1 values:
- `open`: actionable and unclaimed.
- `claimed`: assigned or claimed by a specific user.
- `waiting`: waiting for another role, system action, or external condition.
- `returned`: returned to a previous role for correction.
- `completed`: completed.
- `canceled`: no longer needed because the source business process ended or changed.

`WorkItem.subStatus` rules:
- `subStatus` explains why the item is in its current lifecycle state and what kind of next step is expected.
- `subStatus` is a stable machine key, not display text.
- Display labels are supplied by the workflow definition.
- `subStatus` MUST NOT carry financial amounts, account codes/lines, summaries, counterparties, attachments, OCR text, bank details, or approval comments.
- Platform defines a small common baseline; modules MAY add workflow-specific subStatus keys through their code-first `WorkflowDefinition`.

Platform common `subStatus` v1 values:
- `pending_completion`: the item needs missing fields or required preparation to be completed.
- `pending_confirmation`: the item was generated/imported/changed and needs a user to confirm it.
- `pending_review`: the item is waiting for review or approval-like human judgment.
- `pending_correction`: the item was returned or failed validation and needs correction.
- `pending_external`: the item is waiting for an external system, callback, or organization-external condition.
- `pending_system`: the item is waiting for internal async system processing.
- `blocked`: the item cannot progress without manual intervention or configuration/data repair.
- `ready`: the item is ready for its next action.
- `done`: the item is complete at the work-item layer.

Derived workbench states:
- "waiting for me" is derived from current user, `assigneeUserId`, `assignedRole`, membership, and permissions.
- "waiting for others" is derived when the user may view the task but is not currently eligible to act.
- "overdue" is derived from `dueAt < now()` while the item is not completed or canceled.

`WorkItemEvent` is append-only transition history. Minimum fields:
- `id`: uuid.
- `workItemId`: uuid.
- `orgId`: uuid.
- `ledgerBookId`: uuid nullable.
- `eventType`: string, such as `created`, `claimed`, `returned`, `completed`, `canceled`.
- `actionKey`: string nullable, such as `submit`, `post`, `return`, `confirm`.
- `fromStatus`: string nullable.
- `toStatus`: string nullable.
- `actorId`: string.
- `reason`: string nullable; ERP-internal only, never sent to My-Chat.
- `metadata`: JSON nullable.
- `createdAt`: datetime.

Model constraints:
- `orgId` is mandatory for all work items and events.
- Finance ledger-scoped work items and events carry `ledgerBookId`.
- `metadata` must remain display-safe and must not include amounts, account lines, summaries, counterparties, attachments, OCR text, bank details, or approval comments.
- `sourceType` / `sourceId` references the source entity; it must not duplicate source business status.
- A transition that changes both a work item and its source entity MUST run in one database transaction.
- `dedupeKey` prevents duplicate active tasks for the same source/type.
- `version` protects claim/complete/return actions from concurrent overwrites.

## Visibility vs actionability

Visibility and actionability are separate authorization decisions.

Visibility answers whether a user may see that a work item exists and view its safe context. A user may see a `WorkItem` only when:
- The user is a member of `workItem.orgId`.
- If `ledgerBookId` is present, the user can access that ledger book.
- At least one visibility basis applies:
  - user is `assigneeUserId`;
  - user has `assignedRole`;
  - user is `createdBy`;
  - user is a historical handler recorded in `WorkItemEvent`;
  - user has supervisor/admin/audit read permission;
  - workflow policy allows same-role queue visibility.

Supported queue/view intents:
- `my_tasks`: items assigned to me, or unclaimed items I may claim.
- `role_queue`: role-visible shared queue.
- `created_by_me`: items I initiated.
- `handled_by_me`: items I handled historically.
- `supervision`: items visible through supervisor/admin oversight.
- `audit_readonly`: read-only audit/checking view.

Actionability answers whether a user may execute a specific action on a visible work item. A user may execute an action only when all checks pass:
- `WorkItem.status` allows the action.
- The code-first `WorkflowDefinition` exposes the action for the current status/subStatus.
- The user has the required operation permission, such as `task.claim`, `task.complete`, or `voucher.post`.
- Assignment policy allows the user to act: assigned to the user, assigned to the user's role and unclaimed, or explicitly transferable/claimable.
- The source entity state allows the action.
- Source-domain invariants pass, including SoD checks.
- Optimistic concurrency version matches.

API responses MAY include backend-computed `availableActions`; frontend clients MUST NOT infer action permission themselves. A visible work item with `availableActions=[]` is valid, for example waiting-for-others, created-by-me, supervision, and audit-readonly views.

## My-Chat event boundary
Allowed outbox metadata:
- `eventId`
- `eventType`
- `orgId`
- `moduleKey`
- `workflowKey`
- `workItemId`
- `sourceType`
- `sourceId`
- `title`
- `status`
- `subStatus`
- `assignedRole`
- `assigneeUserId`
- `priority`
- `severity`
- `createdAt`
- `dueAt`
- `deepLink`

Forbidden in My-Chat outbound events:
- financial amounts
- account lines
- bank details
- counterparties
- voucher or payment summaries
- attachments
- OCR text
- approval comments
- audit-detail payloads

Detailed context MUST be fetched from ERP after authorization.

Implemented envelope behavior:
- `OutboxEvent` rows are appended transactionally with source/task transitions.
- Outbox payloads use `OutboxEventEnvelopeSchema`.
- Contract tests reject forbidden financial-detail keys such as amounts, account lines, summaries, attachments, OCR text, and comments.

## Finance first slice
Voucher-backed work items:
- Draft voucher completion: accountant/cashier.
- Pending voucher review/post: supervisor/accountant with SoD constraints. This is task-driven by default, not a standalone approval instance.
- Confirmation states for generated or imported voucher drafts: accountant confirms OCR/posting-rule output before submit.
- Reversal handling: accountant/supervisor.
- Period-close readiness: accountant/supervisor, later milestone.

M2 cashier extension:
- Payment draft and submit.
- Payment approval.
- Payment confirmation.
- Cash/bank journal entry.
- Voucher draft generation by posting rules.

## Decision points
- Persisted vs derived tasks: resolved. Use persisted tasks for assignment, SLA, history, and outbox; source entities remain authoritative for business state.
- Workflow definitions: resolved. Use a mixed model: workflow topology is code-first TypeScript registry; organization/ledger policy is DB-configured.
- Approval: resolved for vouchers. Voucher review/posting is task-driven by default; standalone approval instances are mandatory for payment workflows and optional for vouchers only when future policy explicitly enables multi-step voucher approval.
- Outbox: resolved. Event publication must be transactional with source changes and task transitions, and My-Chat outbound payloads are metadata-only envelopes.
- UI: workflow pages should use task queues; resource/detail pages remain for inspection and settings.
