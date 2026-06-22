# 03 — Implementation Notes

## M0 (2026-06-22) — BLOCKED on private-registry auth
- `pnpm install` fails: `ERR_PNPM_FETCH_401 Unauthorized` fetching
  `@willyu1007/web-workbench@0.6.1` from `https://npm.pkg.github.com`.
- Root cause: the global `~/.npmrc` (`C:\Users\Administrator\.npmrc`) contains only
  `registry=https://registry.npmjs.org` — **no GitHub Packages auth token**. The project `.npmrc` maps the
  `@willyu1007` scope to GitHub Packages but (by design) does not hold the token; the comment says the token
  lives in the uncommitted global `~/.npmrc`, which is currently absent of it.
- Resolves open-question #3 in `01-plan.md`: auth is **not** currently configured in this environment.
- Required fix (user action — credential): add a GitHub PAT with `read:packages` scope (and access to the
  `@willyu1007` packages) to `~/.npmrc`:
  `//npm.pkg.github.com/:_authToken=<GITHUB_PAT>`
  e.g. `npm config set //npm.pkg.github.com/:_authToken <PAT>`.
- Until then M1–M5 are blocked (kit cannot be installed → no types, no render). No code changed yet.

### M0 retry (2026-06-22) — token now SENT but REJECTED (still 401)
- After the user configured `~/.npmrc`, pnpm now sends `Authorization: Bearer ghp_…` (classic PAT) — the
  `.npmrc` wiring is correct. But GitHub still returns **401** for `@willyu1007/web-workbench` specifically
  (public npm packages downloaded fine). So it is a **token authorization** problem, not config.
- Suspects, in order: (1) classic PAT missing `read:packages` scope; (2) org SAML SSO not authorized for
  the token ("Configure SSO" → Authorize); (3) the token's account lacks read access to the `@willyu1007`
  package; (4) token expired/mistyped. Token prefix `ghp_` = classic (not fine-grained), so the
  fine-grained/Packages incompatibility is ruled out.
- Self-test (user runs, token not shared): `npm whoami --registry=https://npm.pkg.github.com` should print
  the account; `curl -H "Authorization: Bearer <PAT>" https://npm.pkg.github.com/@willyu1007%2fweb-workbench`
  should return JSON, not 401.

### M0 DONE (2026-06-22)
- Resolved: user's classic PAT (`willyu1007`, scopes `repo, write:packages` — write implies read) now reads
  the package (HTTP 200). `pnpm install` completed (474 pkgs, 2m55s; api-client codegen ran in postinstall).
- `pnpm typecheck` green on the unmodified tree (M0 baseline).
- **Kit API surface (0.6.1), pinned from `dist/*.d.ts`** — six Scene paradigms: Hub / List / Queue /
  Record / Insight / Form. Host writes adapters mapping view-models → contracts; components carry no domain
  vocab. Key exports for this task:
  - `Queue<T>({items,rowKey,toRow,actionLabel,drawer,empty})` — single trailing action + drawer (for pure
    actionable lists).
  - `RowModel` (List/Queue rows) — 铁律 "chevron(`href`)=去看 / button(`trailing`)=去做"; has
    `title/sub/meta/note/metrics/status/leading/trailing/href/cta/emphasis`.
  - `Scene`/`SceneNav` (route-based segmented view tabs), `Tabs` (client), `ListView<T>`, `EntityRow`,
    `StatusBadge({tone,label,dot})`, `ActionButton({kind:'primary'|'ghost',href,onClick})`,
    `WorkflowModule`/`DashAttention` (Hub contract — what M4 maps WorkItem onto).
- **Design decision (house-consistency):** current post-0.6.1 pages (payments/contracts) do NOT use the
  Scene/ListView/Queue components yet — they render with kit CONTRACT CLASSES (`wb-scene`, `wb-table`,
  `mt-btn`, `wb-row`) + `StatusBadge` + a token-based structural `*.module.css` for tabs + a client actions
  component (`PaymentDetailActions`). To stay house-consistent (and because that is exactly what the deleted
  workbench page did and what `ui:guard` passes), the rebuild mirrors the payments pattern rather than
  introducing lone Scene/SceneNav pages. `WorkItemActionResult = { workItem; source?: Voucher }` (source
  carries the posted voucher for `complete`).

### M1–M5 DONE (2026-06-22)
- **M1** `finance/workbench/actions.ts` — `claim/complete/cancel` server actions over `actOnWorkItem`
  (version-guarded; ok/unconfigured/conflict/error mapping mirrors payments).
- **M2** `finance/workbench/page.tsx` (server) + `workbench-tasks.tsx` (client) + `workbench.module.css`
  (structural, token-only) + `lib/finance/work-item-display.ts` (labels/tones). 3 route-based `?view=` tabs
  (待我处理/监督/我处理过); rows enriched with voucher/payment summary + sourceType deep link; actions render
  strictly from `availableActions` (`[]` → 查看 link); 403 on 监督 → notice.
- **M3** nav + badge — `workbench-shell.tsx` gains 我的工作台 (first 工作流 item) with kernel badge; the
  voucher-derived badge was dropped from 凭证处理. `scene-config.tsx` `NAV_BADGE_DAILY_ACCOUNTING_OPEN` →
  `NAV_BADGE_MY_TASKS_OPEN`. `layout.tsx` badge now from `countMyOpenTasks()` (new data-source helper).
- **M4** home 看板 — `page.tsx` attention now mapped from `listWorkItems('my_tasks')` → `DashAttention`
  (kit Hub contract); voucher stat tiles kept (legit read-model counts); highlight row now points at 我的工作台.
- **M5** D3 — removed `FINANCE_DAILY_ACCOUNTING_WORKFLOW` from `packages/platform/src/workflow.ts` (generic
  `WorkflowDefinition` types kept; `export *` so no index edit needed); corrected T-003 `00-overview.md`
  stale "Live" claim.
- **Pre-existing issue surfaced (NOT T-009):** `ui:guard` flagged one inline style at
  `finance/contracts/[id]/page.tsx:79` — unrelated, baseline-red. Fixed out-of-band in the working tree
  (page + module.css, 6 lines); `ui:guard` now passes 0 violations. Commit it separately from T-009.

### Quality pass (2026-06-22)
- **Removed dead code:** `getWorkItem` wrapper in `data-source.ts` had zero callers repo-wide (the deleted
  workbench had no detail page — orphaned even before T-009). Removed. Kept the api-client `getWorkItem`
  binding (legit SDK surface for `GET /v1/work-items/:id`, not a compat shim).
- **Removed dual-track:** the voucher/payment ref-lookup + sourceType deep-link was duplicated in
  `workbench/page.tsx` AND home `page.tsx`. Extracted to `lib/finance/work-item-source.ts`
  (`resolveWorkItemRef` + `workItemDeepLink`); both pages now consume the single source — no per-page drift.
- **Semantic-drift check (clean):** `availableWorkItemActions` (work-item-rules.ts) gates `complete` to
  `JournalVoucher`/`voucher.review` only, so the "通过并过账" label never renders for payment tasks (they
  surface 领取/取消/查看). The backend's "complete not implemented for this source" path is unreachable from
  the UI. No mismatch.
- **Doc-staleness (accepted, not churned):** the closed T-004 bundle references
  `FINANCE_DAILY_ACCOUNTING_WORKFLOW` in present tense — a point-in-time historical record, left as-is.
- Re-verified after the pass: `typecheck` ✅, `eslint` ✅, `lint:css` ✅, `ui:guard` ✅ (0 violations).
