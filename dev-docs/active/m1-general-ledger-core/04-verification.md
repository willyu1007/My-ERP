# 04 — Verification: M1 总账核心

> 记录每次验证：命令 + 预期 + 实际结果。

## 计划中的验证手段
- 单元测试（vitest）：借贷平衡不变式、红冲、RBAC 权限矩阵、金额 Decimal 边界。
- 集成测试（vitest + 测试库）：过账事务一致性、账套隔离（应用层 + RLS）、并发过账、期初平衡。
- 契约：OpenAPI 校验；`docs/context/db/schema.json` 与 Prisma 同步检查。
- CI：lint / test / build / security 绿。

## 验证记录

### P0a — 2026-06-06（Node 20.19 · pnpm 9 · 根目录执行）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 安装 | `pnpm install` | ✓ 含 postinstall `prisma generate` |
| 类型检查 | `pnpm typecheck` | ✓ 9/9 项目通过 |
| Lint | `pnpm lint` | ✓ 无告警 |
| 单测 | `pnpm test`（vitest，根级 alias→源码） | ✓ 5 passed（Money/借贷平衡 + Health）|
| 构建 | `pnpm build` | ✓ 全包 tsc + `next build`（`/` 动态路由）|
| 基础设施 | `pnpm infra:up`（compose project=my-erp） | ✓ Postgres(5433)+Redis(6379) healthy |
| 迁移 | `prisma migrate dev --name init` | ✓ `20260606045750_init` 建 `audit_record` |
| DB 契约 | `pnpm db:sync-context` | ✓ 刷新 `docs/context/db/schema.json` |
| API 健康 | `curl :8000/health` | ✓ `{"status":"ok",...}` HTTP 200（含 DB ping）|
| 端到端 | web(:3200) SSR → api(:8000) → PG(5433) | ✓ 页面渲染 `● ok — my-erp-api` |

注：CI 在 GitHub 上的“绿”需先提交 `pnpm-lock.yaml`（`--frozen-lockfile`）。本地等价命令已全绿。

### P0b — 2026-06-10（本机 PG17 :5432 验证 RLS）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `pnpm -r typecheck` | ✓ 9/9 |
| 单测 | `pnpm test` | ✓ 34 passed（CASL 能力矩阵 5、身份 4、AuthGuard 3、PermissionGuard 4 + 既有）|
| RLS 集成测试 | `vitest run packages/db/src/rls.integration.test.ts` | ✓ 3：作用域只见本账套行（A→2/B→1）、无作用域→0 行、作用域内写仅本作用域可见（以**非特权角色**连库，超级用户会绕过 RLS）|
| Lint / governance | `pnpm lint` · `ui:governance` · `lint-docs` | ✓ 无告警 / 23 token-only / 0 errors |
| 构建 | `pnpm build` | ✓ api + web Done |
| **端到端 HTTP** | 本机 PG 建库 + 以 `myerp_app` 角色起 api + curl | ✓ POST post-check：无 token **401** / viewer **403** / accountant **201**；GET ledger-books：无 token **401**、accountant **200** `{ledgerBookId,roles,recentAuditCount:1}`，二次调用 `recentAuditCount:2`（authn→CASL authz→withLedgerScope/RLS→append-only 审计累加，全链路打通）|

注：testcontainers 因无 Docker 未用，RLS 集成测试改用本机 PG，CI 无 PG 时自动跳过（`describe.skipIf`）。OTel 完整 SDK 推迟，本阶段为结构化日志 + tracing seam。
