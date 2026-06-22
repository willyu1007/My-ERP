# 00 — Overview: Finance workbench kernel rewire (web ↔ task kernel on web-workbench 0.6.1)

## Problem statement
The WorkItem task kernel (T-003) is intact and spec-compliant in the backend, but the **web layer no
longer consumes it**. The task-queue page `/finance/workbench` (我的工作台) — T-003 R2-UI's "first real
consumer of the kernel" — was deleted in commit `14930db` ("wip: snapshot ... before kit 0.4.0 migration")
and never restored through kit 0.5.0/0.6.0/0.6.1. Today the home 看板 (`(workbench)/page.tsx`) and the
sidebar badge (`(workbench)/layout.tsx`) re-derive 待办 from `listVouchers().filter(status)` — the exact
"static UI over voucher lists" anti-pattern T-003 set out to remove, and a regression against the
scene-workflow spec (README §核心原则#5 / AGENTS §4: 任务驱动、不得退化为硬编码线性管道).

The kernel client functions (`listWorkItems` / `getWorkItem` / `actOnWorkItem`) still exist in
`apps/web/src/lib/finance/data-source.ts` but are called by no page/component (orphaned). The backend
`/v1/work-items` list/detail/act endpoints and backend-computed `availableActions` are unchanged. This is
therefore a **purely additive frontend rewire**, rebuilt on the locked `@willyu1007/web-workbench@0.6.1`
kit, with no backend/kernel/contract change.

## Status
- State: in-progress
- Scope confirmed with user on 2026-06-22: **D1 (web ↔ kernel rewire) + D3 (drop dead workflow constant)**.
  IA: rebuild the dedicated 我的工作台 **Scene** page AND re-point the home 看板 attention + badge to the
  kernel (both surfaces read WorkItem).
- **D2 is explicitly out of scope** (moving finance vocabulary out of `packages/platform` + a static
  isolation lint). It is a larger, higher-blast-radius refactor (touches `ability.ts`/`account.ts`/
  `cash-flow.ts`) and was already consciously deferred at T-008/R4 closure. Track separately.

## Goal
Make the web workbench task/queue-driven again on the kit: a 我的工作台 Scene with 待我处理 / 监督 /
我处理过 views whose actions render strictly from backend `availableActions`, plus a home 看板 and sidebar
badge that read the WorkItem kernel instead of filtering voucher lists. Remove the dead
`FINANCE_DAILY_ACCOUNTING_WORKFLOW` constant so the runtime adapter is the single source of finance
workflow topology.

## Non-goals
- No backend, kernel, prisma, RLS, or contract changes (`/v1/work-items` + `availableActions` are reused as-is).
- No D2: do not move finance vocabulary out of `packages/platform` and do not add the isolation lint here.
- No new work-item actions (`return`/`assign`) and no workflow policy tables.
- Do not touch other finance pages (payments / contracts / period-close / reports / settings) beyond what
  the shared nav + home 看板 require.
- No hand-rolled table/tab CSS: the page MUST use the kit's List paradigm + kit `Tabs` (the old page was
  dropped precisely because its local `workbench.module.css` + raw `wb-table` conflicted with kit convergence).

## High-level acceptance criteria
- [x] `/finance/workbench` renders real backend-backed work items via `listWorkItems`, built on the 0.6.1
      kit contract classes + `StatusBadge` (house pattern; structural token-only `module.css` for tabs).
- [x] Actions (领取 / 通过并过账 / 取消) come strictly from each item's `availableActions`; mutations go
      through version-guarded server actions; the frontend never infers permission.
- [x] Home 看板 attention + sidebar badge read the WorkItem kernel (`my_tasks`), not `listVouchers()` status.
- [x] Demo mode (no backend) degrades gracefully to an empty state via the existing data-source seam.
- [x] `FINANCE_DAILY_ACCOUNTING_WORKFLOW` is removed; `pnpm typecheck` + 94 DB-free tests stay green.
- [x] New code is B1-clean + `lint:css` passes; T-003 00-overview stale "Live" claim corrected.
      (`ui:guard` has one **pre-existing, unrelated** violation in `contracts/[id]/page.tsx`; `ui:validate`
      needs `python3`, absent in this env. Live browser walk deferred to the user's backend.)

## Pointers
- Spec / constraints: `README.md` §核心原则#5, `AGENTS.md` §4, T-003 `02-architecture.md` (UI: workflow pages use task queues).
- Kit surface: `packages/ui/src/index.ts` (re-exports `@willyu1007/web-workbench@0.6.1`); locked rules in `.ai/skills/features/ui/ui-feature-delivery/references/`.
- Backend kernel: `apps/api/src/work-items/`, `/v1/work-items`; contracts in `packages/contracts`.
- Orphaned client seam: `apps/web/src/lib/finance/data-source.ts` (`listWorkItems`/`getWorkItem`/`actOnWorkItem`).
- Deleted reference page: `git show 14930db^:apps/web/src/app/(workbench)/finance/workbench/page.tsx`.
