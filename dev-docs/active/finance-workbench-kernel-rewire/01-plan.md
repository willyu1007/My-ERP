# 01 — Plan

Phases mirror the roadmap milestones; each step lists the file(s) and an acceptance check. Backend is
untouched throughout — every read goes through the existing `data-source` seam.

## Phase M0 — Install + pin kit types
1. `pnpm install` (node_modules is empty); ensure the private `@willyu1007/web-workbench@0.6.1` resolves
   (GitHub Packages auth via `.npmrc`). If auth is unavailable, stop and surface it — the rest depends on it.
2. Verify the kit exports referenced below against the installed `.d.ts`: `Scene`, `EntityTable` /
   `EntityRow` (+ cell kit), `Tabs`, `StatusBadge`, `EmptyState`, `Hub` / `WorkflowModule`, `useToast`.
   Record exact names/signatures in `03-implementation-notes.md`.
- Accept: `pnpm typecheck` green on the unmodified tree.

## Phase M1 — Work-item server actions
1. Create `apps/web/src/app/(workbench)/finance/workbench/actions.ts` (`'use server'`): `claimTaskAction`,
   `completeTaskAction`, `cancelTaskAction`, each `(id, expectedVersion)` → calls
   `actOnWorkItem(id, key, { expectedVersion })` via the data-source.
2. Result mapping: `ok` (carry `postedNo` for complete when present) / `unconfigured` (demo) / `conflict`
   (409/version) / `error` (message). Mirror the deleted `actions.ts` contract so the client stays simple.
- Accept: typecheck; demo path returns `unconfigured` without throwing.

## Phase M2 — 我的工作台 Scene page
1. `apps/web/src/app/(workbench)/finance/workbench/page.tsx` (server, `force-dynamic`): read `view` from
   `searchParams` (default `my_tasks`; allow `supervision`, `handled_by_me`); `listWorkItems(view)` with a
   403 → "监督仅主管可见" branch; enrich rows with source summary + sourceType-aware deep link
   (`/finance/vouchers/:id` | `/finance/payments/:id`) via `listVouchers()` + `listPayments()`.
2. `workbench-tasks.tsx` (client): render with kit **List paradigm** — `EntityTable`/`EntityRow` + cell
   kit, `StatusBadge` for status/subStatus, `EmptyState` for empty/forbidden. View switch uses kit `Tabs`
   (NOT a local module.css). Buttons rendered only from `availableActions`; `[]` → 查看 link; wire to M1
   actions with `useTransition` + `useToast` + `router.refresh()`.
3. Status/subStatus/title/action label maps: reuse the label dictionaries from the deleted component.
- Accept: 3 views render against a configured backend; 监督 403 path shows notice; demo → empty state;
  `pnpm ui:guard` reports no B1/contract violations; no `*.module.css` under the route.

## Phase M3 — Nav + badge
1. `apps/web/src/components/workbench-shell.tsx`: add `{ href: '/finance/workbench', label: '我的工作台',
   match: ['/finance/workbench'] }` to the 工作流 group (placement: first item, above 凭证处理).
2. Badge: add a data-source helper (e.g. `countMyOpenTasks()` → `listWorkItems('my_tasks').length`, `0` in
   demo). Update `apps/web/src/app/(workbench)/layout.tsx` to feed the sidebar badge from it instead of
   `vouchers.filter(v => v.status === 'draft' || 'pending')`. Decide whether the badge keys the workbench
   entry or stays on 凭证处理 (record in notes).
- Accept: active nav highlight on `/finance/workbench`; badge = kernel open count (0 in demo).

## Phase M4 — Home 看板 re-point
1. `apps/web/src/app/(workbench)/page.tsx`: replace `attentionFor` (currently `listVouchers().filter`)
   with attention items built from `listWorkItems('my_tasks')` (title from titleKey, deep link from
   sourceType, tone from priority/subStatus). Keep the voucher stat tiles (legitimate read-model counts).
2. Keep the `WorkflowModule` shape the kit `Hub` expects; only the `attention` source changes.
- Accept: 看板 待办 list sourced from kernel; demo mode renders empty attention without error.

## Phase M5 — D3 + docs + governance + verification
1. Delete `FINANCE_DAILY_ACCOUNTING_WORKFLOW` from `packages/platform/src/workflow.ts` and its
   `packages/platform/src/index.ts` re-export; keep `WorkflowDefinition`/`WorkItemTypeDefinition` types.
   Grep to confirm zero non-doc importers first.
2. Edit `dev-docs/active/workflow-task-kernel-finance-pipeline/00-overview.md`: correct the R2-UI
   "Live + browser verified" line to note the page was removed at kit convergence and restored under T-009.
3. `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` then
   `... lint --check --project main`.
4. Verification: `pnpm typecheck`, `pnpm test`, `pnpm ui:governance`, `pnpm lint`, `pnpm lint:css`; route
   smoke; record every run in `04-verification.md`.
- Accept: all green; T-009 registered in the hub; no stale doc claim remains.

## Open questions (resolve during M0–M1)
- Exact kit export names/signatures (confirmed at M0).
- Does the badge attach to 我的工作台 or remain on 凭证处理? (lean: move to 我的工作台.)
- `.npmrc` GitHub Packages auth available in this environment for `pnpm install`? (blocks M0 if not.)
