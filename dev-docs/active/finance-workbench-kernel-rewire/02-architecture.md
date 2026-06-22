# 02 — Architecture

## Baseline (unchanged by this task)
- Backend WorkItem kernel: `apps/api/src/work-items/` exposes `/v1/work-items` (list/detail/act) with
  backend-computed `availableActions`, org+ledger scope, RLS, SoD, transactional source+work-item
  transitions, metadata-only outbox. **Not touched here.**
- Contracts: `WorkItem`, `WorkItemAction`, `WorkItemView` in `packages/contracts`; `WorkItem` is generic
  (no finance fields). **Not touched.**
- Client seam: `apps/web/src/lib/finance/data-source.ts` already has `listWorkItems(view)`,
  `getWorkItem(id)`, `actOnWorkItem(id, key, body)` over `@my-erp/api-client` (`/v1/work-items`), with the
  demo fallback (`[]`/`null`) when `API_BASE_URL`/`API_DEV_TOKEN` are unset.

## Template package surface (web-workbench 0.6.1)
`@my-erp/ui` is a pure re-export of the kit (`packages/ui/src/index.ts`). The kit ships **two paradigms**:
- **Scene** (`Scene` / `SceneNav`) — the page-level scene container.
- **List** (`ListView`, `EntityTable` / `EntityRow` / `EntityCard`, cell kit) — tabular/record rendering.
Plus shell (`AppShell`, scenario switcher, `ShellNav`), `Tabs`, `StatusBadge`, `InsightCard`, `Drawer`,
`EmptyState`, `Hub` / `WorkflowModule`, Toast (`ToastProvider` / `useToast`), icons, primitives.

Confirmed-real exports (used in current code): `AppShell`, `ShellNav`, `ToastProvider`, `useToast`
(`workbench-shell.tsx`); `Hub`, `EntityRow`, `WorkflowModule`, icons (`page.tsx`); `EmptyState`,
`StatusBadge`, `CardTone` (deleted workbench page). Exact signatures for `Scene`/`EntityTable`/`Tabs`
are pinned at M0 after `pnpm install`.

## Locked constraints (must pass `ui:governance`)
From `.ai/skills/features/ui/ui-feature-delivery/references/`:
- Only `data-ui` contract roles (`tabs`/`tab`, `table`/`list`, `badge`, `empty-state`, `button`, …).
- Tokens-only visual values; **Tailwind B1 boundary**: no `bg-*`/`text-*`/`font-*`/`rounded-*`/`shadow-*`/
  `border-*`/`p-*`/`m-*` in feature code.
- Feature CSS = structural layout only (grid/areas/container queries); MUST NOT set color/background,
  font/line-height, border-radius, box-shadow, margin/padding.
- Consequence: the rebuilt page carries **no `workbench.module.css` for tabs/table** (the old page's
  drift source). View switching = kit `Tabs`; rows = kit List paradigm; any feature CSS is structural only.

## Target layering

```text
apps/web/src/app/(workbench)/finance/workbench/
  page.tsx            server: read view → listWorkItems(view) → enrich rows → render Scene + Tabs
  workbench-tasks.tsx client: kit EntityTable/Row + StatusBadge + EmptyState; actions from availableActions
  actions.ts          'use server': claim/complete/cancel → actOnWorkItem (version-guarded)

apps/web/src/app/(workbench)/
  page.tsx            home 看板: WorkflowModule.attention sourced from listWorkItems('my_tasks')
  layout.tsx          sidebar badge from countMyOpenTasks() (kernel), not vouchers.filter

apps/web/src/components/workbench-shell.tsx   工作流 group gains 我的工作台 entry
apps/web/src/lib/finance/data-source.ts       reuse listWorkItems/actOnWorkItem (+ countMyOpenTasks helper)

packages/platform/src/workflow.ts             D3: remove FINANCE_DAILY_ACCOUNTING_WORKFLOW (keep types)
```

## Data flow (task queue)
1. `page.tsx` resolves `view` (`my_tasks` default | `supervision` | `handled_by_me`).
2. `listWorkItems(view)` → `/v1/work-items?view=`; backend returns items incl. `availableActions`
   (frontend never infers permission). 403 on 监督 for non-supervisors → `EmptyState`.
3. Rows enriched with source summary (voucher/payment) + sourceType-aware deep link.
4. Client renders List paradigm; buttons strictly from `availableActions` (`[]` → 查看 link).
5. Action → server action → `actOnWorkItem(id, key, { expectedVersion })`; ok / unconfigured / conflict /
   error → toast + `router.refresh()`. Demo mode (no backend) → `unconfigured` notice, empty queues.

## Boundary rules (preserve scene-workflow spec)
- Frontend MUST NOT compute action permission; it renders backend `availableActions` only.
- Mutations are version-guarded (`expectedVersion`) — optimistic concurrency stays server-authoritative.
- Visibility/actionability, SoD, scope, transactionality all remain in the backend service — this task adds
  no business rules to the web layer.
- No finance vocabulary is added to `packages/platform`/`packages/contracts` (D3 only removes some).
- 看板/badge stop deriving 待办 from source business status (`voucher.status`); the WorkItem layer is the
  single source of "what's on my plate", per T-003 D3 (work item status ≠ source business status).

## Key risks
- Private-registry install (M0) is a hard dependency; without it, types can't be pinned and the kit can't render.
- Kit export-name drift vs this plan (mitigated at M0).
- Accidentally re-introducing local color/spacing CSS → B1 failure (mitigated by List-paradigm-only rule).
