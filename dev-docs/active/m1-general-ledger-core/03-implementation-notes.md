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

## P2 — 科目体系（完成）

**决策（实现期落定）**
- **账套级业务表绑定组织**：Account 按 `app.current_ledger` RLS（首张 ledger 级业务表）。但 token 的 ledgerBookId 可伪造，故新增 **`LedgerScopeGuard`**：校验该账套经 `withOrgScope` 在本组织可见（不可见→403），再 `withLedgerScope` 跑账套操作 —— 延续「应用层 + RLS」两层（应用层绑组织、RLS 绑账套）。`@LedgerBookId()` 注入已校验的 id。
- **域词表入 platform**：`account.ts`（category/direction/auxType + 校验器 + `STANDARD_CHART` 模板）；db 不依赖 platform，seed 函数收通用 `SeedAccountInput[]`，控制器传 `STANDARD_CHART`。
- **幂等种子**：`createMany({ skipDuplicates })`（按 `@@unique[ledgerBookId,code]` 跳过已存在）。
- 多级树：编码升序=树前序；建子级时父级 `isLeaf` 翻 false；停用末级校验=有活跃子级不可停。

**改了什么**
- Prisma：`Account`（ledgerBookId/code/name/category/direction/parentCode/level/isLeaf/auxTypes[]/active，`@@unique[ledgerBookId,code]`）；迁移 `20260610150000_p2_account`（DDL + ledger 级 RLS，`NULLIF(...)::uuid`）。
- `packages/platform`：`account.ts`（类型/标签/校验器/`STANDARD_CHART` 16 科目）。
- `packages/db`：`getLedgerBookByIdTx`（绑组织用）+ account 仓储（list/getByCode/create/update/setActive/setLeaf/countActiveChildren/seed）。
- `apps/api`：`LedgerScopeGuard` + `@LedgerBookId`；`AccountsController`（GET 列表 / POST 创建（算 level + 翻父 isLeaf）/ POST seed-standard / PATCH 改名·辅助核算 / POST `:code/deactivate`（末级校验）），审计。ability：read Account 全角色、create/update Account = 会计/管理员。
- 契约：openapi 增 accounts（14 endpoints）。

**遗留 TODO（P2）**
- 科目删除（仅作废/停用，不物理删，已遵循）；辅助核算项主数据（往来/部门/项目档案）随后续。
- 停用校验仅查活跃子级；有凭证发生的科目停用校验待 P3（有余额/分录不可停）。

## P3a — 凭证模型 + 草稿生命周期（完成）

**决策（实现期落定）**
- **借贷平衡分两层**：服务层 `finance-domain.voucherBalanceError`（草稿可不平、submit/post 必平）+ DB CHECK `status='draft' OR total_debit=total_credit`（非草稿必平兜底）。金额走 `Decimal/NUMERIC(18,2)` + `Money`（decimal.js，零浮点）。
- **凭证不可物理删**：journal_voucher 无 DELETE 策略；journal_entry_line 有 DELETE（草稿改单时整组替换，service 限草稿）；line 无 UPDATE（替换非改）。
- 行的 `accountName` 由科目表**反规范化**（服务端取，不信客户端）；制单校验每行科目存在·末级·启用。
- 凭证号 `记-{period}-{NNN}`（按 ledger+period 计数 + `@@unique[ledgerBookId,no]` 兜底并发）。

**改了什么**
- Prisma：`JournalVoucher`（no/date/period/status/summary/total_debit/total_credit/maker/checker/reversal_of/reversed_by/attachments）+ `JournalEntryLine`（ledger_book_id 反规范化用于 RLS、line_no/account_code/account_name/debit?/credit?/aux/cash_flow_item）；迁移 `20260610160000_p3_voucher`（DDL + 账套级 RLS + CHECK）。
- `finance-domain`：`voucherBalanceError`（≥2 行、每行单边、非零、借=贷）+ 7 单测。api 加 `@my-erp/finance-domain` 依赖。
- `packages/db`：voucher 仓储（create 含嵌套 lines、list/get、updateDraft 替换 lines、setStatus、countInPeriod；Decimal→2dp 字符串映射）。
- `apps/api`：`VouchersController`（GET 列表(状态筛选)/GET 详情/POST 创建(草稿)/PATCH 改(仅草稿)/POST submit(借贷必平校验)），均经 `LedgerScopeGuard`，审计。

**遗留 TODO（P3a）**
- 凭证号并发竞态（计数+unique 兜底→409，可改 per-ledger 序列）；附件上传（attachments 仅计数占位）。

## P3b — 过账 + 红冲（完成）

**决策（实现期落定）**
- **SoD 在 post**：过账人 ≠ 制单人（人级，非角色级）；违者 403。**单人模式**为显式例外：`LedgerBook.singlePersonMode` 开启 + 请求体 `confirmSinglePerson:true` 方可自过账，审计 action=`POST_VOUCHER_SINGLE_PERSON` + metadata。
- **红冲 = posted 反向凭证**：借贷互换（debit↔credit）的新凭证，直接 `status=posted`；原凭证 `status=reversed` + `reversedBy`，反向凭证 `reversalOf` 指原 —— 双向可追溯，单事务原子，原凭证不删不改（仅 status/reversedBy）。不可重复红冲（`reversedBy` 已设→400）。
- `LedgerScopeGuard` 改为挂**完整账套实体**到 `req.ledgerBook`（+ `@CurrentLedgerBook`），post 读 `singlePersonMode` 免再查。

**改了什么**
- Prisma：`LedgerBook.singlePersonMode`；迁移 `20260610170000_p3b_ledger_single_person`。
- `packages/db`：`LedgerBookEntity.singlePersonMode`；`createReversalVoucherTx`（互换行 + posted + reversalOf）；`getLedgerBookByIdTx` 带 singlePersonMode。
- `apps/api`：`@CurrentLedgerBook` 装饰器；`VouchersController` 加 `post`（SoD + 单人模式 + 事务 + 余额校验）+ `reverse`（红冲，返回 {original, reversal}）。
- 测试基建：集成测试改用 `migrationDirs()` **动态全量迁移**（避免后续迁移改表致旧测试漏列）；`apply-migrations.ts`（test-only，tsconfig 排除，import.meta）。voucher 集成测试加红冲用例。
- 契约：openapi 增 post/reverse（21 endpoints）。

**遗留 TODO（P3b）**
- 红冲期间：当前红冲落在原凭证期间；可改为当前期间（发现错误的期间）。
- 单人模式开关端点（当前经 DB/账套设置；可加 admin 切换 API）。

## P4 — 账簿（派生余额）（完成）

**决策（实现期落定）**
- **余额派生不物化**（P3 D1）：不建 AccountBalance 表；试算平衡表/明细账由**已过账凭证行**聚合得出。好处：① 与日记账永远一致 ② **并发过账无错账**（没有余额表可被并发更新弄脏）③ 复用 W2b 前端那套派生逻辑、数值一致。
- 派生纯函数放 `finance-domain`（领域逻辑，Decimal 零浮点），与凭证平衡不变式同层；db 只供原始 posted 行；api 薄编排。
- 期末余额按净额符号定借/贷；期初余额 P4 为空（P5 期初建账再注入，派生函数已接 openings 参数）。

**改了什么**
- `finance-domain`：`ledger.ts` —— `computeTrialBalance`/`computeAccountLedger`（PostedLine/OpeningLine → 试算平衡表/明细账，Decimal）+ 4 单测。
- `packages/db`：`getPostedEntriesTx`（`where voucher.status='posted'`、含科目名/凭证号/日期、按日期+凭证+行号排序；Decimal→2dp）。
- `apps/api`：`LedgerController`（GET `/v1/ledger/trial-balance`、GET `/v1/ledger/accounts/:code`，ledger-scoped、read Voucher）。
- 契约：openapi 增 ledger（23 endpoints）。

**遗留 TODO（P4）**
- 期间筛选（trial-balance/明细账按期间）；总账（汇总账）视图；导出（Excel/PDF，M3 范围）。
- 前端 data-source 后续已收敛为 API 优先路径；fixture 仅作本地只读 fallback。

## P5 — 期初建账（完成）

**决策（实现期落定）**
- 期初余额=可平衡集合，校验 `finance-domain.openingBalanceError`（空集=新账套合法；非空须借=贷、每项单边）。派生账簿（P4）的 `openings` 参数注入即纳入期初。
- **跨作用域**：`opening_balance` 账套级（RLS）；`ledger_book.openingPeriod` 组织级。`PUT` 处理器先 `withLedgerScope`（守卫「未使用」+ 校验科目末级·启用 + 整组替换 + 审计），再 `withOrgScope`（设启用期）。
- **期初建账须在使用前**：有 posted/reversed 凭证则拒（`countPostedVouchersTx>0 → 400`）。整组替换（delete+insert），无 UPDATE 策略。

**改了什么**
- Prisma：`OpeningBalance`（ledger-scoped，`@@unique[ledgerBookId,accountCode]`）+ `LedgerBook.openingPeriod`；迁移 `20260610190000_p5_opening_balance`（DDL + 账套级 RLS）。
- `finance-domain`：`openingBalanceError`（启用期试算平衡）+ 3 单测。
- `packages/db`：`OpeningBalanceEntity` + `getOpeningBalancesTx`/`replaceOpeningBalancesTx`（整组替换）/`countPostedVouchersTx`/`setLedgerOpeningPeriodTx`；`LedgerBookEntity.openingPeriod`。
- `apps/api`：`OpeningBalancesController`（GET / PUT，校验 + 守卫 + 双作用域）；`LedgerController` 派生改传 `getOpeningBalancesTx`（期初纳入）。
- 契约：openapi 增 opening-balances（25 endpoints）。

**遗留 TODO（P5）**
- 期初余额**批量导入**（Excel，exceljs，M3 范围；当前 PUT 整组录入已支持程序化导入）；往来/资金账户的辅助核算期初（账户级期初已支持，辅助维度待 M2/后续）。
- openingPeriod 与凭证期间的关系校验（凭证日期须 ≥ 启用期）可后续加。

## M1 收尾

P0a/P0b/P1/P2/P3/P4/P5 全部完成并验证。总账核心闭环打通：组织/账套/邀请/权限 → 科目 → 凭证（借贷平衡/SoD/过账事务/红冲）→ 账簿（派生）→ 期初建账。25 API、78 测试（7 套 RLS/派生集成）、全程 Decimal 零浮点、账套级 RLS + WITH CHECK、凭证不可物理删、append-only 审计。每阶段独立提交 + 自审修复（P0b 守卫 DI、P1 token 泄漏、P2 编码树序、P3 红冲并发、P4 红冲漏记 等真 bug 均在 review 抓出）。
