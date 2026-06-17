# 07 — R2-UI design: WorkItem-backed personal workbench

Resumes the **D5-deferred** UI slice. The task kernel + voucher-review backend (R1/R2-backend) is
built, tested, and live-smoked, but **the web consumes none of it** — daily-accounting "queues" are
voucher-status filters, and `/v1/work-items` is never called. R2-UI wires the personal workbench
(roadmap P1/P2) onto the existing kernel. No backend/schema change.

## What already exists (consume, don't rebuild)
- `GET /v1/work-items?view&status&sourceType&sourceId&limit&cursor` → `WorkItem[]`, each carrying a
  backend-computed **`availableActions`** (frontends must not infer task permissions from role names).
- `GET /v1/work-items/{id}` → `WorkItem`.
- `POST /v1/work-items/{id}/actions/{actionKey}` body `{ expectedVersion (required), confirmSinglePerson?,
  reason? }` → `{ workItem, source? }` (`source` = the posted `Voucher` for `complete`).
- Views: `my_tasks` (default) · `role_queue` · `created_by_me` · `handled_by_me` · `supervision` ·
  `audit_readonly`. Statuses: `open|claimed|waiting|returned|completed|canceled`.
- Implemented actions today: **`claim`**, **`complete`** (`voucher.review` only → posts the voucher in
  one tx), **`cancel`** (supervisor/admin). `return`/`assign` are **not** implemented server-side.
- WorkItem carries `sourceType`/`sourceId` (UUID), `status`/`subStatus`, `priority`, `assignedRole`,
  `dueAt`, `titleKey` (e.g. `finance.voucher.review`), `version`, and metadata-only `metadata`
  (`{sourceEntity, origin, ...}` — no amounts; that rule is for the **outbox/My-Chat**, not this ERP UI).

## Decisions
- **DR1 — additive surface.** New page **`/finance/workbench`** ("我的工作台"), WorkItem-backed. The
  daily-accounting page stays the 制单 (fast-entry) + voucher browser; we do **not** rip out its tabs.
  Rationale: the genuine "待我处理 + 通过过账" belongs to a task queue; duplicating it as a voucher filter
  would confuse. This is the first real consumer of the kernel.
- **DR2 — view tabs (revised after readiness).** `待我处理` (`my_tasks`) · `监督` (`supervision`,
  shown only to supervision-capable users) · `我处理过` (`handled_by_me`). `role_queue` dropped (after the
  P0 fix it's ~redundant with supervision for admins); `created_by_me`/`audit_readonly` deferred.
- **DR3 — actions are data-driven.** Render buttons strictly from `availableActions`
  (`claim`→领取, `complete`→通过并过账, `cancel`→取消). Every action sends `expectedVersion = item.version`
  (optimistic concurrency; a stale version → 409, surfaced as a toast + refresh). `complete` also sends
  `confirmSinglePerson: true` (backend ignores it unless single-person self-post applies). `return`/`assign`
  are not rendered (no backend).
- **DR4 — readable rows.** Join `sourceId → Voucher` (via `listVouchers`) to show 凭证号 / 摘要 / 金额 / 日期;
  `titleKey` → a small Chinese label map. The ERP UI may show financial detail (only the outbox is
  metadata-only).
- **DR5 — deep link.** A task row links to `/finance/vouchers/{sourceId}` (the existing detail page).
- **DR6 — seam + actions.** api-client gains `listWorkItems/getWorkItem/actOnWorkItem`; data-source reads
  (empty in demo mode); `'use server'` actions `claimTaskAction/completeTaskAction/cancelTaskAction`
  (return `{ ok, … } | failure` like the other action modules). Nav: add **我的工作台** under 工作流.

## Readiness review (2026-06-17) — outcome
Verified assumptions against code. **Blocker found + resolved (chose B):** the list-view SQL
(`viewWhere`) matches `assignedRole IN roles` literally with **no** admin/supervisor elevation, while
`canViewWorkItem`/`availableActions` *do* elevate admin. So for the dev/SME single-admin user (role
`admin`), `my_tasks`/`role_queue` return nothing — review (`assignedRole=supervisor`) and confirm
(`assignedRole=accountant`) tasks only surface via `supervision`. **Resolution (B):** a small backend
fix elevates supervision-capable callers in `viewWhere` (their `my_tasks` includes unassigned active
tasks they may act on) + add the `监督` tab. Minor notes (handled in UI): `complete` works on unclaimed
tasks (claim optional); `voucher.confirm` has no work-item `complete` (deeplink to the editor); single
membership ⇒ only the single-person self-post path is demoable.

## Plan
- **P0 — backend (the readiness fix)**: `viewWhere` takes `supervisionCapable`; for `my_tasks` add
  `{assigneeUserId: null}` to the OR when capable; service passes it from `canUseSupervisionView(identity)`.
  + a db integration test. No schema/RLS change.
- **P1 — api-client**: 3 methods + type exports (the generated schema already has `WorkItem`,
  `WorkItemAction`, `WorkItemActionRequest`, `WorkItems` — no regen).
- **P2 — data-source + actions**: `listWorkItems(view)`, `getWorkItem`; `claim/complete/cancel` server
  actions taking `(id, expectedVersion)`.
- **P3 — page**: `/finance/workbench` server page (fetch the 3 views' counts + the active view's items,
  join vouchers) + a client island for the tab switch (URL `?view=`) and the action buttons + nav entry.
- **P4 — verify**: live e2e (submit a voucher → `voucher.review` task appears in 待领取 → 领取 → 通过并过账 →
  voucher posted, task → 我处理过) + a browser walkthrough; full gate (typecheck/lint/test).

## Non-goals (this slice)
- `return`/`assign` actions and the policy/threshold layer (no backend yet).
- Replacing daily-accounting's voucher tabs; the `voucher.confirm` capture surface (already handled by
  fast-entry confirm); supervision/audit dashboards.
- Outbox **dispatch** worker (My-Chat delivery) — needs an external endpoint; separate track.

## Verification
`pnpm typecheck` · `pnpm lint` · `pnpm test` · a fresh-DB `/v1` e2e of submit→claim→complete→posted ·
browser walkthrough of the three tabs + actions. UI governance: `pnpm ui:governance` if shell/nav rules apply.
