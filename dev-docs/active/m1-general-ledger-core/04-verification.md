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
| **端到端 HTTP** | 本机 PG 建库 + 以 `myerp_app` 角色起 api + curl | ✓ POST post-check：无 token **401** / viewer **403** / accountant **200**；GET ledger-books：无 token **401**、accountant **200** `{ledgerBookId,roles,recentAuditCount:1}`，二次调用 `recentAuditCount:2`（authn→CASL authz→withLedgerScope/RLS→append-only 审计累加，全链路打通）；span 日志含 `traceId`（关联打通）|

注：testcontainers 因无 Docker 未用，RLS 集成测试改用本机 PG，CI 无 PG 时自动跳过（`describe.skipIf`）。OTel 完整 SDK 推迟，本阶段为结构化日志 + tracing seam。

### P0b 实施质量自审 — 2026-06-10（修复后重验全绿）

审查修复 3 处：① **边界违规**——controller 直接 `tx.auditRecord.findMany`（Prisma 查询入业务层，违背「仅 packages/db 碰 Prisma、仓储返回领域实体」）→ 抽出 `listAuditEntriesTx` 仓储函数（返回 `AuditEntry` 领域型）；② **可观测断点**——AuthGuard 生成的 `traceId` 未串入 `withSpan` 日志 → 加 `@TraceId()` 注入并入 span context（已验证日志含 traceId）；③ post-check 语义上是校验非创建 → `@HttpCode(200)`（OpenAPI 同步）。重验：typecheck 9/9 · test 34 · lint · build 全绿；e2e 复跑 401/403/200 + GET 审计累加 1→2 正常。
留待（非阻塞）：CASL 条件为实例级、Guard 为类型级（账套隔离由 token→scope→RLS 保障，符合设计）；读操作审计 LIST_LEDGER_BOOKS 为骨架演示；RLS 集成测试遗留全局测试角色（幂等，无害）。

### P1a — 组织/成员/账套 — 2026-06-10（本机 PG17 :5432）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `pnpm -r typecheck` | ✓ 9/9 |
| 单测 + 集成 | `pnpm test` | ✓ 39 passed（含 `org-rls.integration` 5：账套按组织隔离、成员角色仅本组织解析、`WITH CHECK` 阻跨组织写、组织内创建隔离、无作用域 0 行）|
| Lint / build / lint-docs | `pnpm lint · build · lint-docs` | ✓ 无告警 / api+web Done / 0 errors |
| **端到端 HTTP** | 本机 PG 建库 + seed 组织/成员 + 非特权角色起 api | ✓ GET `/v1/organization`（acct）→ 组织；no-member → **403**；POST `/v1/ledger-books`（accountant）→ **403**（无创建权）；（admin）→ **201** 返回账套；GET（acct）→ 列出该账套（org 作用域读）；日志 0 错误 |

要点：token→Membership 角色解析→CASL 鉴权→org 作用域 RLS 全链路打通；角色为 Membership 落库（非 token）；`ledger_book` `WITH CHECK` 防跨组织写已测。

### P1b — 邀请流 — 2026-06-10（本机 PG17 :5432）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `pnpm -r typecheck` | ✓ 9/9 |
| 单测 + 集成 | `pnpm test` | ✓ 46 passed（新增 invitation 状态机 4 单测 + `invitation-flow.integration` 3：建/按 token 查/跨组织不可见、accept 建成员并翻转状态、`WITH CHECK` 阻跨组织邀请）|
| Lint / build | `pnpm lint · build` | ✓ 无告警 / api+web Done |
| **端到端 HTTP**（全生命周期） | 本机 PG + seed admin + 非特权角色起 api | ✓ ① bob 接受前 GET org → **403**（非成员）② admin 邀请 bob(accountant) → pending+token ③ bob 接受（邮箱+token 匹配）→ 建 membership(accountant) ④ bob 接受后 GET org → **200**（角色现从新 membership 解析）⑤ bob(accountant) 发起邀请 → **403** ⑥ admin GET members → [admin:admin, bob:accountant] ⑦ bob 重复接受 → **400**（已是成员）；日志 0 错误 |

要点：禁止自助加入（membership 仅经 accept 创建）；`PrincipalGuard` 解鸡生蛋（被邀请人尚非成员）；token 秘密 + 邮箱匹配 + 状态机三重校验。

### P1 实施质量自审 — 2026-06-10（修复后重验全绿）

审查（多租户 RLS + 认证 + 邀请安全）。修复 1 处：**`GET /v1/invitations` 返回了秘密 token**（凡有 read-Membership 者可见所有 pending token，纵深防御缺口；虽邮箱匹配已挡冒用）→ 列表剥离 token（仅 create 响应保留，演示用；OpenAPI token 改非必需）。e2e 复核：create 含 token、list 不含（10 字段）。
复核确认无问题：JWT 锁 HS256（防算法混淆）；token 携 orgId 必须对上真实 membership 否则 403（claim 不可越权）；accept = 秘密 token + **token 签发的 email** 匹配（攻击者无签名密钥无法伪造 email）+ 状态机；各表 `WITH CHECK` 防跨组织写；membership 无 UPDATE/DELETE 策略（默认拒，append-向）；GUC 用 `NULLIF`、审计用 `createMany`（沿用 P1a 修复）。
留待（非阻塞）：create 响应在真实流程也应只经邮件投递 token；Prisma 唯一/WITH CHECK 违例未全局映射为 4xx（并发重复 accept→500，@@unique 兜底正确性）；邮箱格式未校验；每请求 2 次事务（AuthGuard 解析 + handler）；过期邀请惰性（停留 pending）。

### P1 残留债务清理 — 2026-06-10（避免技术债）

已解决 3 项并重验：① **Prisma 异常全局过滤器** `PrismaExceptionFilter`（P2002 唯一冲突→409、P2025→404、其余记日志→500）—— 并发重复 accept 等不再裸 500；② **邮箱格式校验**（邀请 email 走正则，非法→400）；③ **过期邀请惰性生效状态**（`invitationEffectiveStatus` 纯函数 + 单测；列表里过期的 pending 显示 expired，无需后台 job）。重验：typecheck 9/9 · test 49（+3）· lint · build；e2e：非法 email→400、合法→201、seed 的过期邀请列表显示 expired。
有意保留（非债务）：create 响应返回 token（真实投递=邮件，属 My-Chat 触达面 M5；mock 阶段必需，list 已剥离）；每请求 2 次事务（AuthGuard 独立解析身份是有意分层，合并会耦合 auth 与 handler）。
