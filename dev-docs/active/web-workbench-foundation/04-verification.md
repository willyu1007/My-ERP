# 04 — Verification: Web Workbench Foundation

## W0 — 2026-06-09（根目录执行）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 套件类型检查 | `pnpm --filter @my-erp/ui typecheck` | ✓ 端口 kit 零类型错误 |
| 全量类型检查 | `pnpm typecheck` | ✓ 全部项目通过（含 packages/ui、apps/web）|
| Lint | `pnpm lint` | ✓ 无告警 |
| UI governance | `pnpm ui:governance` | ✓ validate OK + guard OK（feature 代码 token-only）|
| 单测 | `pnpm test` | ✓ 5 passed |
| 全量构建 | `pnpm build` | ✓ 全包 + `next build`（`/` 14.7kB）|
| 运行时渲染 | `next start` → `curl :3200` | ✓ HTTP 200；`<Badge>` 渲染为 `mt-badge--danger`（api 未起→fallback）；`wb-*` 布局；morethan 样式表已加载 |

注：CI 新增 `UI governance` 步骤（在 Lint 与 Typecheck 之间）。GitHub「绿」仍需先提交 `pnpm-lock.yaml`。
