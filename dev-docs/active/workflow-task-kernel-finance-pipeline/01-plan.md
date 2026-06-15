# 01 - Plan

## Execution order

### Phase 0 - Scope and workspace hygiene
Purpose: prevent T-003 from absorbing unrelated UI work.

Steps:
- Confirm T-003 implementation is backend/contract/schema first.
- Keep current unrelated UI changes out of T-003 commits unless the user explicitly reopens UI work.
- Keep `.env`, `.env.local`, and local generated context artifacts out of committed scope unless explicitly requested.

Acceptance criteria:
- [x] Implementation branch/diff is scoped to task kernel docs/contracts/backend/schema.
- [x] UI files are not modified for T-003 unless D5 is reopened.

### Phase 1 - Contract freeze
Purpose: agree on the runtime shape before schema/API work.

Steps:
- Freeze `WorkItem` and `WorkItemEvent` fields.
- Freeze v1 `status` and platform common `subStatus` values.
- Freeze visibility/actionability semantics and `availableActions` response behavior.
- Confirm the first vertical slice: task kernel foundation plus voucher-backed adapter.

Acceptance criteria:
- [x] Decision D5 in `roadmap.md` is resolved or explicitly deferred.
- [x] Any deferred decision has a trigger for revisiting it.
- [x] `02-architecture.md` is updated to reflect confirmed decisions.

### Phase 2 - Database schema and RLS
Purpose: persist work items safely with organization and ledger isolation.

Steps:
- Use `sync-db-schema-from-code` workflow for persisted schema changes.
- Add `WorkItem` and `WorkItemEvent` to `prisma/schema.prisma`.
- Add migration SQL for RLS policies and any DB-level uniqueness strategy such as active-task dedupe.
- Add org + optional ledger scope helpers/repositories in `packages/db`.
- Regenerate DB context via `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`.

Acceptance criteria:
- [x] `WorkItem` cannot be read outside org scope.
- [x] Finance work items cannot be read outside ledger scope.
- [x] Duplicate active task creation for the same dedupe key is blocked.
- [x] `WorkItemEvent` history is append-only.

### Phase 3 - Platform contracts and authorization
Purpose: make task concepts explicit and permissioned before API exposure.

Steps:
- Add zod contracts in `packages/contracts` for task DTOs and safe metadata.
- Add platform workflow registry types for workflow keys, versions, statuses, subStatus labels, and action definitions.
- Extend CASL subjects/actions with `WorkItem` and task operations such as `claim`, `return`, `complete`, `assign`, and `cancel`.
- Keep finance-specific operations such as `voucher.post` in finance/action adapters.

Acceptance criteria:
- [x] Backend can compute `availableActions`.
- [x] Read-only visible tasks can return `availableActions=[]`.
- [x] Safe metadata schema rejects forbidden financial details.

### Phase 4 - Task API
Purpose: expose task queues without frontend-derived authorization.

Steps:
- Update `docs/context/api/openapi.yaml` contract-first.
- Regenerate `docs/context/api/API-INDEX.md` / `api-index.json`.
- Implement list/detail/action endpoints for work items.
- Support view intents such as `my_tasks`, `role_queue`, `created_by_me`, `handled_by_me`, `supervision`, and `audit_readonly`.

Acceptance criteria:
- [x] Task list is org/ledger scoped.
- [x] Task action endpoint rejects unauthorized, stale-version, and invalid-source-state operations.
- [x] API responses include backend-computed `availableActions`.

### Phase 5 - Voucher-backed adapter
Purpose: prove the kernel with existing M1 voucher state.

Steps:
- Register finance daily accounting workflow definitions in code.
- Create/maintain voucher work items from voucher lifecycle events.
- On voucher submit, create a reviewer work item.
- On task post action, call existing voucher post logic and complete the work item in one transaction.
- If return-to-maker is included, add the source voucher transition and audit trail contract-first.

Acceptance criteria:
- [x] Voucher source state remains authoritative.
- [x] SoD is enforced during task action execution.
- [x] Work item transition, source update, audit, and event append are transactional.

### Phase 6 - Outbox envelope skeleton
Purpose: preserve D4 now without building the full My-Chat worker yet.

Steps:
- Define `OutboxEvent` metadata-only envelope.
- Append outbox rows transactionally for task lifecycle events that need notification.
- Do not implement broad My-Chat delivery until the worker/integration milestone.

Acceptance criteria:
- [x] Outbox payloads include only allowed metadata.
- [x] Tests prove forbidden financial details are absent from outgoing event payloads.

### Phase 7 - Verification and documentation
Purpose: close the implementation with machine-checkable evidence.

Steps:
- Run `pnpm typecheck`.
- Run `pnpm test`.
- Run route-level smoke tests for task API.
- Run RLS tests for org and ledger-scoped work items.
- Run governance and context verification commands.
- Update `03-implementation-notes.md`, `04-verification.md`, and this plan with actual outcomes.

Acceptance criteria:
- [x] Typecheck and tests pass.
- [x] Context artifacts are regenerated and verified.
- [x] T-003 docs reflect implemented behavior and remaining deferred UI work.

## Implementation status

Backend-first slice completed on 2026-06-13:
- Schema/RLS/repository foundation is implemented for `WorkItem`, `WorkItemEvent`, and `OutboxEvent`.
- Shared contracts and platform authorization are implemented for task status, subStatus, views, actions, safe metadata, and metadata-only outbox envelopes.
- API endpoints are implemented for work item list/detail/action.
- Voucher submit creates reviewer tasks; voucher post and task complete share the same transactional post path.

Deferred:
- UI wiring remains deferred per D5.
- Payment approval and policy tables remain later milestones.
- My-Chat worker delivery remains later; only the metadata-only outbox envelope is implemented now.

## Risks and mitigations
- Risk: task state drifts from voucher/payment state. Mitigation: transitions must be transactional with source entity updates and append-only history.
- Risk: platform layer becomes too generic. Mitigation: implement only concepts required by finance daily accounting plus one future-module sanity check.
- Risk: My-Chat integration leaks details. Mitigation: define outbox metadata envelope and test/scan payload shape.
- Risk: UI becomes another resource list. Mitigation: workbench reads role queues and actions, not raw vouchers, for workflow screens.
