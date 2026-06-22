# 04 — Verification

## 2026-06-22 — M1–M5 static + unit verification (no live backend / DB in env)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck (9 projects) | `pnpm typecheck` | ✅ green (apps/web, apps/api, packages/platform incl. D3 deletion) |
| ESLint | `pnpm lint` | ✅ clean |
| Stylelint (typography lock) | `pnpm lint:css` | ✅ green after fixing `.taskTitle` → `font-weight: var(--h3-weight)` |
| Unit/contract tests | `pnpm exec vitest run --exclude "**/*.integration.test.ts"` | ✅ 94 passed / 23 files (incl. `work-item.test.ts`, `work-item-rules.test.ts`, ability, contracts) |
| B1 boundary guard | `pnpm ui:guard` | ✅ OK — 61 feature files token-only (0 violations) |

### B1 guard detail
- `ui:guard` now passes (0 violations / 61 token-only feature files). All T-009 files introduce **zero** B1
  violations.
- The one pre-existing inline-style at `contracts/[id]/page.tsx:79` (surfaced during this task, NOT
  introduced by T-009) was fixed **out-of-band** in the working tree (`contracts/[id]/page.tsx` +
  `contracts.module.css`, 6 lines). It is a separate change from T-009 — commit it separately.

### First-CSS-lint failure (resolved)
- `.taskTitle { font-weight: 600 }` tripped the kit `declaration-property-value-allowed-list` (typography
  lock adopted in commits 3a2e7d5/7953291, AFTER the old workbench page was deleted, so the old page never
  faced it). Fixed to the house token `var(--h3-weight)` (matches `contracts.module.css` / `reports.module.css`).

### Not run in this environment (require user's stack)
- `pnpm test` full suite: integration tests (`*.integration.test.ts` — RLS, kernel-generic, payments/
  contracts service) need Postgres on `localhost:5433`. Backend code is untouched by T-009, and the 94
  DB-free tests (incl. all work-item contract/rules tests) pass, so no backend regression is expected.
- `pnpm ui:validate`: needs `python3` on PATH (absent here → exit 9009). The JS B1 guard (`ui:guard`) ran.
- Browser walk (submit → review task → 通过并过账 → posted → 我处理过): needs `API_BASE_URL` + `API_DEV_TOKEN`
  pointing at a running API. In demo mode (no backend) the queue + badge + 看板 attention correctly render
  empty via the data-source seam.

## Acceptance status
- [x] `/finance/workbench` consumes `listWorkItems`, built on kit contract classes + `StatusBadge` (house pattern).
- [x] Actions render strictly from `availableActions`; mutations via version-guarded server actions.
- [x] Home 看板 attention + sidebar badge read the kernel (`my_tasks`), not `listVouchers()` status.
- [x] Demo mode degrades to empty state via the data-source seam.
- [x] `FINANCE_DAILY_ACCOUNTING_WORKFLOW` removed; typecheck + 94 tests green.
- [x] `pnpm lint:css` passes; new code B1-clean; T-003 stale "Live" claim corrected.
- [ ] Live browser walk against a running backend (deferred to user's environment).
