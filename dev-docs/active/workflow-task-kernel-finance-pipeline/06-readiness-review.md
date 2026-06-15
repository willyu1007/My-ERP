# 06 - Implementation readiness review

Date: 2026-06-13

## Readiness summary
T-003 is ready to enter implementation planning and contract/schema work, but not ready for broad UI or My-Chat integration work. The first implementation should be backend/contract first: task kernel schema, scoped repositories, platform permission extensions, API contract, then a voucher-backed adapter.

Current baseline is healthy:
- `pnpm typecheck` passed.
- `pnpm test` passed: 17 files, 78 tests.
- Project governance lint passed with one existing non-blocking T-001 warning.

## Findings

### High priority

1. No WorkItem persistence or API exists yet.
Impact: the workbench cannot be task-backed, and all task decisions are still documentation-only.
Required action: add `WorkItem` and `WorkItemEvent` through Prisma schema/migration and contract-first API changes before feature wiring.

2. Authorization model does not yet include task-specific subjects/actions.
Evidence: `packages/platform/src/ability.ts` currently has subjects such as `Voucher`, `LedgerBook`, and `Membership`, but no `WorkItem`; actions do not include `claim`, `return`, `complete`, `assign`, or `cancel`.
Required action: extend platform authorization before exposing task endpoints.

3. RLS design must handle mixed org-only and ledger-scoped tasks.
Evidence: current DB helpers support `withOrgScope`, `withLedgerScope`, and `withScope`, but task rows need mandatory `orgId` and nullable `ledgerBookId`.
Required action: design RLS so org membership is always required, and ledger filtering applies when `ledgerBookId` is present. Tests must prove org-only tasks do not leak and ledger-scoped finance tasks respect `app.current_ledger`.

4. `dedupeKey` needs a DB-level strategy.
Impact: duplicate active work items can create double approvals/posts or conflicting queue entries.
Required action: use either a unique active-task key strategy or a raw SQL partial unique index in migration. Prisma schema alone may not express the desired partial uniqueness.

5. Current working tree contains unrelated UI changes.
Impact: task-kernel implementation can accidentally mix with UI adjustment work.
Required action: keep T-003 changes path-scoped to task-kernel docs/contracts/backend/schema unless the user explicitly reopens UI work.

### Medium priority

6. `metadata` safety must be enforceable.
Impact: D4 metadata-only My-Chat boundary can be violated accidentally.
Required action: define zod schemas / DTOs for safe task metadata and add tests or scans that reject financial details in outbox payloads.

7. Actionability must be backend-computed.
Impact: frontend-derived permissions would be unsafe.
Required action: task list/detail APIs should return backend-computed `availableActions`; controller tests should cover read-only visible tasks with no actions.

8. Source transition coupling must be transactional.
Impact: task state can drift from voucher/payment source state.
Required action: implement task transition helpers in `packages/db` or service layer that update source entity, append `WorkItemEvent`, append audit, and optionally enqueue outbox in the same transaction.

9. Concurrency needs explicit implementation.
Impact: two users could claim/complete the same task.
Required action: use `version` in conditional updates and test stale version failures.

## Non-blocking notes
- UI changes may lag behind backend task-kernel work per D5.
- Payment approval should remain a later slice after voucher-backed task flow proves the kernel.
- My-Chat delivery worker can be delayed, but the outbox envelope contract should be shaped early.

## Recommended implementation stance
Proceed with a backend-first slice:
1. contract/schema foundation,
2. platform authorization and workflow registry types,
3. task repositories and RLS tests,
4. task API,
5. voucher-backed adapter,
6. outbox skeleton,
7. later UI wiring.

Do not start with UI, payment workflow, or My-Chat worker integration.
