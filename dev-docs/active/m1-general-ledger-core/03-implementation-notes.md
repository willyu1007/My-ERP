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

## P0b — 认证 / 授权 / 隔离底座（完成）

**决策（实现期落定）**
- 身份：mock 用 `jsonwebtoken`（HS256，CJS 原生）而非 jose（api 为 CommonJS）；`IdentityProvider` 抽象，真实 Logto/JWKS 后替换。
- 可观测：本阶段**结构化 JSON 日志 + tracing seam（`withSpan`）**；完整 `@opentelemetry/sdk-node` 推迟到 ARMS/SLS 就绪（用户确认）。
- 集成测试：无 Docker → **testcontainers 推迟**，RLS 集成测试用本机 PG（:5432），无 PG 时 `describe.skipIf` 跳过（CI 需 PG service container，留 TODO）。
- RLS 基线表 = `audit_record`（已有 ledger_book_id），真实业务表 RLS 随 P1。

**改了什么**
- `packages/platform`：`identity.ts`（`Identity`/`Role`/`IdentityProvider`/`MockIdentityProvider`/`signDevToken`）、`ability.ts`（CASL `defineAbilityFor`：RBAC + 操作级 post/reverse/approve + 账套级条件；SoD = 会计制单不可审核）、`logging.ts`（结构化日志 + `withSpan` + `newTraceId`）。依赖 `@casl/ability` + `jsonwebtoken`。
- `packages/db`：`withLedgerScope(ledgerBookId, fn)` = `$transaction` + `set_config('app.current_ledger', …, true)`（SET LOCAL，事务结束自动失效，杜绝连接池串租户）；`appendAuditRecordTx` 在作用域内写审计。
- 迁移 `20260610120000_p0b_rls_audit`：`audit_record` ENABLE RLS + SELECT 隔离策略（`ledger_book_id = current_setting('app.current_ledger', true)`）+ INSERT 放行（UPDATE/DELETE 无策略 = RLS 兜底 append-only）。
- `apps/api`：`auth/`（`AuthGuard` 401、`PermissionGuard`+`@RequirePermission` 403、`@CurrentIdentity`、`identityProviderFactory`、`AuthModule`）；示例受保护资源 `ledger-books`（GET=read LedgerBook 走 withLedgerScope+审计；POST post-check=post Voucher 操作级）。`.env.example` 加 `AUTH_DEV_SECRET`。新增 dep `@my-erp/platform`、`@types/express`。
- 契约：`docs/context/api/openapi.yaml` 补 `/health`+`/v1/ledger-books`+bearerAuth；`ctl-api-index generate` 刷新（3 endpoints）。

**遗留 TODO（P0b）**
- 完整 OTel SDK（spans→ARMS/SLS）；CI 的 PG service container（让 RLS 集成测试在 CI 跑而非跳过）。
- 生产 DB 角色分离落地（迁移用特权角色、应用用非特权 `myerp_app`）写入 env/部署文档。

## P1a — 组织/成员/账套 + 两级作用域（完成）

**决策（实现期落定）**
- **两级作用域**：平台表（organization/membership/ledger_book）按 `app.current_org` RLS；财务表（account/voucher，P2+）按 `app.current_ledger`。`withOrgScope` 与 `withLedgerScope` 并列。
- **角色落库（D2）**：token 只带 `userId/orgId/ledgerBookId`（+ 可选 email），**roles 从 Membership 解析**（RBAC SSOT）。platform `Identity` 拆为 `Principal`（token）+ `Identity`（+roles）；`IdentityProvider.verify → Principal`；apps/api `MembershipIdentityResolver`（`withOrgScope` 查 membership）；`AuthGuard` 验签→principal→解析 identity（无 membership → 403）。
- **org 创建归生态**：Organization/Membership 由特权 sync/seed 写入（My-Chat/Logto 拥有组织；成员经 P1b 邀请），故 app-facing 策略 organization/membership 仅 SELECT；`ledger_book` 为 ERP 自有 → 完整 CRUD 策略 + `WITH CHECK` 防跨组织写。
- 账套 CRUD 校验用手写 parse（不引 class-validator）。

**改了什么**
- Prisma：`Organization`/`Membership(@@unique[orgId,userId])`/`LedgerBook(baseCurrency/fiscalYear/periodStructure)`；迁移 `20260610130000_p1a_org_membership_ledger`（migrate diff 生成 DDL + RLS 策略，org GUC 用 `NULLIF(current_setting(...),'')::uuid` 防空串）。`db:sync-context` 刷新。
- `packages/db`：`withOrgScope` + 仓储（`getOrganizationTx`/`listMembershipRolesTx`/`listLedgerBooksTx`/`createLedgerBookTx`，返回领域型）；`appendAuditRecord(Tx)` 改用 `createMany`（无 RETURNING，见 pitfalls）。
- `packages/platform`：`Principal`/`Identity` 拆分、`isRole`；ability 增 `Organization` subject + supervisor 可 create/update LedgerBook。
- `apps/api`：`identity-resolver.ts`（`IDENTITY_RESOLVER` + `MembershipIdentityResolver`）；`AuthGuard` 接 resolver；`OrganizationController`（GET 当前组织）；`LedgerBooksController` 重写为真实 CRUD（GET 列表 / POST 创建，审计）；app.module 接线。
- 契约：openapi 改为 organization + ledger-books CRUD（去 post-check）；api-index 刷新（4 endpoints）。

**遗留 TODO（P1a）**
- 生产/部署文档：DB 角色分离 + 各表 GRANT（迁移不含 GRANT，env 设置时执行）。
- AccountingPeriod 表（期间行）随 P3/P5 落地（当前 LedgerBook 仅存 periodStructure 字段）。

## P1b — 邀请流（完成）

**决策（实现期落定）**
- **接受邀请的鸡生蛋问题**：被邀请人接受时尚非成员，过不了 `AuthGuard`（要求 membership→403）。新增 `PrincipalGuard`（仅验签→Principal，不查 membership）+ `@CurrentPrincipal`，accept 端点专用。安全性靠 invitation token（随机 uuid，秘密）+ 邮箱匹配。
- `ledgerBookId` 放宽为**可选**（org 级操作如 accept 无需账套上下文；财务端点 P2+ 显式要求）。
- 邀请按 **email** 投递（D3）；mock 身份带 email 以匹配。
- 状态机校验抽为纯函数 `invitationAcceptError`（platform，单测）；accept 编排在 `InvitationService`（apps/api），repo 提供原语。

**改了什么**
- Prisma：`Invitation`（orgId/invitedEmail/role/token@unique/status/invitedBy/expiresAt/acceptedBy/acceptedAt）；迁移 `20260610140000_p1b_invitation`（DDL + invitation org-scoped RLS + 新增 `membership_insert_scope` 让 accept 能建成员）。
- `packages/platform`：`invitation.ts`（`InvitationStatus` + 标签 + `invitationAcceptError`）；`isRole`；`Principal.ledgerBookId` 可选。
- `packages/db`：`createInvitationTx`（生成 token + 7 天 expiresAt）/`listInvitationsTx`/`findInvitationBy{Token,Id}Tx`/`updateInvitationStatusTx`/`createMembershipTx`/`listMembershipsTx`（返回领域型）。
- `apps/api`：`PrincipalGuard` + `@CurrentPrincipal`；`InvitationService`（accept：找邀请→`invitationAcceptError`→查重→建 membership→标记 accepted→审计，单事务）；`InvitationsController`（POST 发起 / GET 列表 / POST `:id/revoke` = create Membership 权；POST `accept` = PrincipalGuard）；`MembersController`（GET 列表）。ability：supervisor 加 create/read Membership。
- 契约：openapi 增 invitations + members（9 endpoints）。

**遗留 TODO（P1b）**
- 过期清理（lazy：accept 时判过期；可加后台 job 批量标记 expired）。
- 邀请通知（My-Chat 触达面，M5）；当前 token 经创建响应返回（演示）。
