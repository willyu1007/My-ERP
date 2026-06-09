# 05 — Pitfalls: M1 总账核心

> 解决重大错误/死胡同后追加历史教训（append-only）。每条含：症状 · 根因 · 尝试过什么 · 修复 · 预防。

## do-not-repeat（速览）

### docker compose 工程名默认取父目录名 → 跨项目串台（P0a）
- 症状：`docker compose -f infra/docker-compose.yml up` 把本机另一个项目的 `wechatrag-postgres` 容器“Recreated”，其容器消失。
- 根因：Compose 默认 project name = compose 文件父目录名（这里是通用的 `infra`）；本机另一栈的 compose 也在某个 `infra/` 目录下，两者共享 project=`infra`，于是按 (project,service) 归并、改名重建了对方容器。
- 修复：compose 顶层显式 `name: my-erp` 隔离工程名；并把宿主端口避让到非默认（Postgres 5433、web 3200）。对方**数据卷未受影响**（我用独立的 `my-erp-pgdata`），重启对方 compose 即可恢复其容器。
- 预防：任何 compose 文件都写显式 `name:`；放在通用目录名（infra/docker/deploy）下时尤其如此。共享开发机上不要占用默认端口（5432/3000）。

### NestJS dev 用 tsx/esbuild → DI 注入 undefined → 运行时 500（P0a）
- 症状：`pnpm build` 后 `node dist/main.js` 的 `/health` 正常 200；但 `pnpm dev`（tsx watch）下 `/health` 必 500（`this.health` 为 undefined）。
- 根因：esbuild/tsx **不产出** `emitDecoratorMetadata`，Nest 按构造参数类型做 DI 时拿不到类型元数据 → 注入 undefined。tsc 会产出，故构建版正常。
- 修复：dev runner 换 **swc-node**（`node --watch -r @swc-node/register src/main.ts`），swc 读 tsconfig 的 `emitDecoratorMetadata`/`experimentalDecorators` 并产出元数据。
- 预防：用 Nest（或任何依赖装饰器元数据的库）时 dev 运行器必须支持 `emitDecoratorMetadata`——swc-node / `nest start` / ts-node 可，纯 esbuild/tsx 不可。验证 P0 骨架要 smoke 真实 `pnpm dev`，别只测构建产物。

### NestJS `@UseGuards` 守卫在「消费控制器所在模块」解析依赖（P0b）
- 症状：api 启动即崩 `Nest can't resolve dependencies of the AuthGuard (?) ... "IDENTITY_PROVIDER" ... available in the AppModule context`。AuthGuard 在 AuthModule provide+export，控制器在 AppModule 用 `@UseGuards(AuthGuard)`。
- 根因：`@UseGuards(GuardClass)` 的守卫由 Nest 在**控制器宿主模块（AppModule）**的注入器实例化，不是守卫声明所在的 AuthModule；只 export 守卫类不够，守卫的构造依赖（自定义 token `IDENTITY_PROVIDER`）也必须在宿主模块可见。
- 尝试过：只把 `AuthGuard`/`PermissionGuard` 放 AuthModule.exports —— 仍崩。
- 修复：AuthModule `exports` 里**一并导出 `IDENTITY_PROVIDER` token**；AppModule import 后该 token 在其上下文可见，守卫解析成功。
- 预防：跨模块经 `@UseGuards` 使用的守卫，把它**所有自定义注入 token** 一起 export（或把控制器与守卫/provider 放同一模块）。`Reflector` 等全局 provider 不受影响。

### Postgres RLS 对超级用户/属主无效（P0b）
- 症状：RLS 策略写好了，集成测试里仍能跨账套看到所有行。
- 根因：**SUPERUSER 绕过所有 RLS**；表**属主**默认也绕过（除非 `FORCE ROW LEVEL SECURITY`）。本机 PG 默认角色 `phoenix` 是超级用户。
- 修复：集成测试与生产都以**非特权、非属主**应用角色连库（`myerp_app`，仅 GRANT SELECT/INSERT）；迁移/seed 用特权角色。`ENABLE RLS`（非属主即受策略约束）即可，无需 FORCE。
- 预防：RLS 设计必须区分「迁移/管理特权角色」与「应用非特权角色」；验证 RLS 一定以应用角色连，别用 postgres/超级用户测。

### 自定义 GUC 在 SET LOCAL 结束后回落为空串而非 NULL → `::uuid` 报错（P1a）
- 症状：无作用域查询 org 表报 `invalid input syntax for type uuid: ""`；P0b 的 audit 表（按 TEXT 比较）却没事。
- 根因：自定义 GUC（`app.current_org`）一旦在会话里被 `set_config(...,true)`（SET LOCAL）设过，事务结束回落到 reset 值 = **空串 `''`**（不是 NULL）；策略里 `current_setting('app.current_org', true)::uuid` 遇到 `''::uuid` → 报错。TEXT 列比较 `= ''`（无匹配）则安全，所以 audit 表（ledger_book_id TEXT）没暴露。
- 修复：uuid 类型的作用域键一律 `NULLIF(current_setting('app.current_org', true), '')::uuid`（空串→NULL→比较为 NULL→隐藏行，无错）。
- 预防：RLS 策略里对 uuid 列做 GUC 比较必须 `NULLIF(...,'')`；别假设未设的自定义 GUC 是 NULL。

### Prisma `create`（INSERT…RETURNING）在 RLS 下写「读作用域外」的行 → RETURNING 被 SELECT 策略挡 → 报错（P1a）
- 症状：在 `withOrgScope`（未设 `app.current_ledger`）里写审计 → 500；同样的 `appendAuditRecordTx` 在 `withLedgerScope` 里却正常（P0b）。
- 根因：Prisma `.create()` 发 `INSERT … RETURNING`；RLS 下 RETURNING 受 **SELECT 策略**约束。审计的 SELECT 策略按 `app.current_ledger` 过滤，而 org 级动作里该 GUC 为空 → 刚插入的行（ledger_book_id=新账套 id）被 SELECT 策略隐藏 → RETURNING 取不到 → 报错。
- 修复：审计写入改用 `createMany`（`INSERT` 无 RETURNING，不触发 SELECT 策略）；审计本就不需要回读插入行。
- 预防：RLS 表上若可能在「读作用域外」写入，用无 RETURNING 的写法（createMany / `$executeRaw`）；凡 `INSERT…RETURNING` 都要确保插入行对当前作用域可见。

## 预判（来自硬约束，避免踩坑）
- 金额禁用浮点：聚合/比较一律走 Decimal；测试覆盖分/厘进位。
- RLS 会话变量必须在连接归还前清理，避免连接池串租户。
- 过账与余额更新必须同事务；切勿先写余额后写凭证。
- 制单人 ≠ 审核人在服务层强制；不要只靠前端禁用。
