# Roadmap — Finance workbench kernel rewire

## Goal
Restore the web layer as a real consumer of the WorkItem task kernel, rebuilt on the locked
`@willyu1007/web-workbench@0.6.1` kit, so SME daily accounting is task/queue-driven again instead of a
static worklist derived from voucher lists. Scope is **D1 (web ↔ kernel rewire) + D3 (drop the dead
`FINANCE_DAILY_ACCOUNTING_WORKFLOW` constant)**. D2 (platform finance-vocab isolation) is out and tracked
separately.

## Input trace
- This session's compliance check: backend kernel compliant; web layer regressed.
- D1 (major): `/finance/workbench` task queue deleted in `14930db` (kit 0.4.0 convergence snapshot), never
  restored; home 看板 + badge derive 待办 from `listVouchers().filter(status)`; `listWorkItems`/
  `actOnWorkItem` orphaned in `data-source.ts`.
- D3 (trivial): `FINANCE_DAILY_ACCOUNTING_WORKFLOW` exported from `packages/platform` but imported nowhere;
  runtime uses the inline `VOUCHER_REVIEW_WORKFLOW` in `apps/api/src/work-items/voucher-workflow.ts`.
- Backend `/v1/work-items` (list/detail/act) + backend-computed `availableActions` are intact → additive frontend.

## Core direction
Use the kit's two paradigms as intended. The workbench task queue is a **Scene** that hosts the **List
paradigm** (`EntityTable`/`EntityRow` + cell kit + kit `Tabs` + `StatusBadge` + `EmptyState`). No
hand-rolled table or local tab CSS — the old page was dropped at kit convergence precisely because its
`workbench.module.css` + raw `wb-table`/`mt-btn` fought the kit. Actions render strictly from backend
`availableActions`; mutations go through version-guarded (`expectedVersion`) server actions. Demo mode (no
backend) degrades to an empty state through the existing `data-source` seam (returns `[]`/`null`).

## Scope
In scope:
- Rebuild 我的工作台 task-queue Scene page on the 0.6.1 List paradigm (待我处理 / 监督 / 我处理过).
- Recreate work-item server actions (claim / complete / cancel) with demo fallback + optimistic version.
- Re-point home 看板 attention + sidebar badge to the WorkItem kernel.
- Nav entry under 工作流 in the finance ShellNav.
- D3: delete `FINANCE_DAILY_ACCOUNTING_WORKFLOW`.
- Docs/governance: correct the stale T-003 R2-UI "Live" claim; sync the project hub.

Out of scope:
- D2 (finance vocab out of `packages/platform` + static isolation lint) — separate task.
- Backend/kernel/contract/schema/RLS changes.
- New work-item actions (`return`/`assign`); workflow policy tables.
- Other finance pages beyond shared nav + home 看板.

## Milestones

### M0 — Install + pin kit types
- `pnpm install` (node_modules is currently empty) so the 0.6.1 kit `.d.ts` is available.
- Confirm exact exported names/signatures used below: `Scene`, `EntityTable`/`EntityRow` + cell kit,
  `Tabs`, `StatusBadge`, `EmptyState`, `Hub`/`WorkflowModule`.
- Exit: `pnpm typecheck` green on an unchanged tree; component names verified against types.

### M1 — Work-item server actions
- Recreate `(workbench)/finance/workbench/actions.ts`: `claimTaskAction` / `completeTaskAction` /
  `cancelTaskAction`, each calling `actOnWorkItem(id, key, { expectedVersion })`; map results to
  ok / unconfigured(demo) / conflict / error.
- Exit: actions typecheck; demo path returns `unconfigured` cleanly.

### M2 — 我的工作台 Scene page
- New `/finance/workbench` route: server component reads `listWorkItems(view)` for the active tab; client
  list renders rows via kit `EntityTable`/`EntityRow`, status via `StatusBadge`, empty via `EmptyState`,
  view switch via kit `Tabs`. Enrich rows with source voucher/payment summary + deep link (sourceType-aware).
- Actions rendered only from `availableActions`; `[]` → a 查看 link.
- Exit: 3 views render; 监督 403 → empty/notice; no local module.css; B1 guard clean.

### M3 — Nav + badge
- Add 我的工作台 entry to the 工作流 group in `workbench-shell.tsx`.
- Change `(workbench)/layout.tsx` badge from `vouchers.filter(draft|pending)` to a `my_tasks` open count
  via a data-source helper.
- Exit: nav highlights on the route; badge reflects kernel open count (0 in demo).

### M4 — Home 看板 re-point
- Change `(workbench)/page.tsx` `attentionFor` to build the attention list from WorkItem (`my_tasks`),
  not `listVouchers().filter(status)`. Keep voucher stats (those are legitimate read-model counts).
- Exit: 看板 待办 sourced from kernel; demo mode shows empty attention without error.

### M5 — D3 + docs + governance + verification
- Delete `FINANCE_DAILY_ACCOUNTING_WORKFLOW` from `packages/platform/src/workflow.ts` (+ index re-export);
  keep the generic `WorkflowDefinition` types.
- Correct T-003 `00-overview.md` R2-UI "Live + browser verified" line (point to this task).
- `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`.
- Full verification (see below).
- Exit: all checks green; hub registry shows T-009.

## Verification strategy
- `pnpm typecheck`, `pnpm test` (kernel/contract tests must stay green — backend untouched).
- `pnpm ui:governance` (ui:validate + B1 guard); `pnpm lint`, `pnpm lint:css`.
- Route smoke: 我的工作台 3 views, 监督 403, demo empty state; home 看板 attention from kernel.
- Optional browser walk (backend configured): submit → review task appears → 通过并过账 → posted → 我处理过.

## Risks
- **Kit lock**: writing colors/spacing/fonts or a local table/tab CSS fails `ui:governance` — mitigated by
  building on the List paradigm + kit `Tabs` (M2).
- **Type drift**: exact kit export names confirmed only after `pnpm install` (M0); plan names come from the
  `@my-erp/ui` barrel inventory + current usages and may need minor adjustment.
- **Demo/empty paths**: every kernel read must tolerate the no-backend seam (`[]`/`null`) — covered by M2/M4.

## Rollback
- Backend/kernel unchanged → revert is removing the route + restoring the two read-models (`page.tsx`
  attention, `layout.tsx` badge) and re-adding the D3 constant. No data migration, no contract impact.
