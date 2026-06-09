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
