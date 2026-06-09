# 03 — Implementation Notes: M1 总账核心

> 每完成一个阶段（P0…P5）追加一段：改了什么、为什么、遗留 TODO。

## P0a — 平台骨架 + CI 绿（进行中）

**决策（实现期落定）**
- 目录命名按 `02-architecture.md` 重排：`apps/{api,web,workers}` + `packages/{platform,finance-domain,db,contracts,api-client,ui}`；删除脚手架占位 `apps/backend`、`apps/frontend`、`packages/shared`。
- Prisma SSOT 路径 = **root `prisma/schema.prisma`**（对齐 `docs/project/db-ssot.json` 的 `fixed-defaults-v1`，避免破坏 `ctl-db-ssot` 工具链）；`packages/db` 仅作客户端单例 + 仓储层（唯一 import Prisma 之处）。
- 首张表用 append-only `AuditRecord`（P0b 即用，避免一次性占位表）。
- 身份：P0a 不接 Logto；`IdentityProvider` 抽象 + mock 放 P0b。
- CI：新增可真正通过的 `build`（pnpm `-r` lint/typecheck/test/build）job；重型 newman/playwright/k6 模板留待后续里程碑（需运行态部署 + secrets）。

**改了什么（P0a 落地）**
- 结构：删除占位 `apps/backend·frontend`、`packages/shared`；建 `apps/{api,web,workers}` + `packages/{platform,finance-domain,db,contracts,api-client,ui}`。后端包/应用统一 CommonJS（Nest/Prisma 友好），`main→dist`、`types→src`（typecheck 免构建顺序，运行/构建经 pnpm `-r` 拓扑序）。
- 根配置：`tsconfig.base.json`（共享 strict）、`eslint.config.mjs`（flat，typescript-eslint recommended 非类型感知）、`.prettierrc`、`.npmrc`（auto-install-peers）、根脚本 `dev/build/typecheck/lint/test/db:*/infra:*` + `postinstall: prisma generate`。
- DB：root `prisma/schema.prisma`（SSOT，含 append-only `AuditRecord`）；`packages/db` 唯一 import Prisma，提供 `getPrisma/pingDatabase/appendAuditRecord`。首迁移 `20260606045750_init`。
- api：NestJS + `/health`（DB ping）+ `setGlobalPrefix('v1', exclude health)`；`dotenv` 从 `__dirname/../../..`/.env 载入（cwd 无关，兼容 dev 与 dist）。dev runner = **swc-node**（`node --watch -r @swc-node/register`），非 tsx——Nest 依赖 `emitDecoratorMetadata`，esbuild/tsx 不产出该元数据会导致 DI 注入为 undefined（见 05-pitfalls）。build/prod 用 tsc，二者均产出元数据。
- web：Next 14 App Router 占位首页（SSR 拉 `/health`，morethan 文案/`●`）。workers：BullMQ 占位（M2+）。
- 测试：根 `vitest.config.ts` 用 alias 把 `@my-erp/*` 解析到源码（免预构建）并开 decorators；`pnpm test` 集中跑。
- CI：`ci.yml` 保留 governance/api-context，新增 `build`（install→prisma validate→lint→typecheck→test→build）；重型 newman/playwright/k6 后置。
- 端口（共享机器避让）：Postgres 宿主 **5433**、web **3200**（3000/3100/5432 已被本机其它项目占用）；compose 显式 `name: my-erp` 隔离工程名。

**遗留 TODO**
- Prisma 6 提示 `package.json#prisma` 配置将于 v7 移除 → 迁移到 `prisma.config.ts`（择期）。
- `pnpm-lock.yaml` 需提交，CI 的 `--frozen-lockfile` 才会绿（用户提交时纳入）。
- P0b：把 `AuditRecord` 接上写入路径；RLS 会话变量中间件 + testcontainers 集成测试。
