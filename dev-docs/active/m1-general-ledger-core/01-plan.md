# 01 — Plan: M1 总账核心（阶段与验收）

每个阶段独立 PR；进入下一阶段前必须满足其验收并 CI 绿。贯穿要求：金额 Decimal、关键操作审计、OpenAPI 契约同步、单元+集成测试。

> P0 拆为 P0a（可运行骨架 + CI 绿）与 P0b（认证/授权/隔离底座），各自独立 PR，更快拿到反馈。

## P0a — 平台骨架 + CI 绿
**做什么**
- 实体化 monorepo：`apps/{api(NestJS),web(Next.js),workers(BullMQ 占位)}`、`packages/{platform,finance-domain,db,contracts,api-client,ui}`；各包最小 `package.json`+`tsconfig`。
- 根脚本实体化：`dev/build/lint/typecheck/test`（pnpm `-r`）。
- Prisma 接入 Postgres：SSOT 为 **root `prisma/schema.prisma`**（对齐 `docs/project/db-ssot.json`）；最小 append-only `AuditRecord` 表起步；`packages/db` 提供 PrismaClient 单例 + 仓储样例（仅 `packages/db` import Prisma）；首个迁移跑通；`ctl-db-ssot sync-to-context` 刷新 `docs/context/db/schema.json`。
- 本地基础设施：`docker-compose`（Postgres + Redis）；`.env.example` 对齐 `env/` 契约。
- `apps/api`：`/health`（含 DB ping）；`apps/web`：morethan 风格占位首页。

**验收**
- [ ] `pnpm dev` 可同时起 api/web；`/health` 通（含 DB ping）。
- [ ] `prisma migrate` 在本地 Postgres 跑通；DB 契约已 sync。
- [ ] `pnpm -r lint/typecheck/test/build` 全绿；CI 构建 job 绿。

## P0b — 认证 / 授权 / 隔离底座
**做什么**
- `IdentityProvider` 抽象 + mock 实现；api JWT 校验中间件，解析 `orgId`/`ledgerBookId` 注入请求作用域（Logto 先 mock，后接真实租户）。
- CASL 授权骨架（一个受保护接口示例）。
- Postgres RLS 基线策略（按 `ledgerBookId`/`orgId`）：请求中间件设/清 `app.current_ledger` 会话变量，连接归还前清理（`$transaction` + `SET LOCAL`）。
- 审计写入封装（append-only）；OTel + 结构化日志；集成测试库（testcontainers）。

**验收**
- [ ] mock 身份注入 → 受保护接口经 CASL 鉴权。
- [ ] RLS 基线在 DB 层生效（越权查询返回空/拒绝）+ 集成测试覆盖。
- [ ] 关键操作写 append-only 审计；OTel 有 trace；CI 绿。

## P1 — 组织 / 账套 / 邀请 / 权限
**做什么**
- 模型：Organization、Membership、Role、Invitation、LedgerBook。
- 邀请流：管理员/主管发起 → 接受 → 入组织授角色；禁止自助加入；邀请状态机（待接受/已接受/撤销/过期）。
- RBAC：会计/出纳/主管/管理员/只读查看者 + 操作级权限。
- 账套 CRUD（本位币、会计期间结构、启用年度）；账套级隔离（作用域 + RLS）。

**验收**
- [ ] 建组织 → 邀请 → 接受 → 授角色全链路通。
- [ ] 非邀请用户无法加入；越权访问他账套被拒（应用层 + RLS 双重）。
- [ ] 角色权限矩阵单测覆盖（含操作级高敏点）。

## P2 — 科目体系
**做什么**
- 模型：Account（编码/名称/类别/借贷方向/parentId/isLeaf/辅助核算标记/启停）。
- 《小企业会计准则》科目模板种子（幂等可重跑）；建账套时可选用。
- 科目 CRUD + 多级树 + 辅助核算（往来/部门/项目）配置。

**验收**
- [ ] 从模板初始化标准科目；可增删改、停用末级校验。
- [ ] 多级科目树正确；辅助核算维度可挂接。

## P3 — 记账凭证
**做什么**
- 模型：JournalVoucher、JournalEntryLine（科目/借贷/金额/辅助核算/现金流量项目占位）、附件元数据。
- 借贷平衡校验（服务层不变式 + DB 约束）。
- 状态机：草稿 → 审核（制单人 ≠ 审核人，SoD）→ 过账（事务，更新余额）→ 红冲（反向凭证，留痕）。

**验收**
- [ ] 借贷不平不可提交/过账（单测 + 集成测试）。
- [ ] 制单人不能审核自己凭证；单人模式需显式开启 + 二次确认 + 留痕。
- [ ] 过账走事务：中断不留半成品；红冲生成反向凭证且双向可追溯。

## P4 — 余额与账簿
**做什么**
- AccountBalance（期初/本期借贷发生/期末）随过账更新。
- 试算平衡表；总账 / 明细分类账查询（按期间/科目/辅助核算）。

**验收**
- [ ] 过账后余额正确；试算平衡（借=贷）。
- [ ] 账簿查询与凭证明细一致；并发过账无错账（事务/锁）。

## P5 — 期初建账
**做什么**
- 启用期间设定；期初余额录入 + 批量导入（科目；往来/资金账户占位接口）。
- 启用期试算平衡校验。

**验收**
- [ ] 可设启用期并录入/导入期初；不平衡给出明确校验错误。
- [ ] 启用后首期账簿/余额以期初为基线正确累计。

## 贯穿验收（全 M1）
- [ ] 关键操作（建/改科目、制单、审核、过账、红冲、邀请、授权、期初）写 append-only 审计。
- [ ] 金额全程 Decimal/NUMERIC；无浮点。
- [ ] OpenAPI 契约（`docs/context/api/openapi.yaml`）与实现同步；DB 契约经 `sync-db-schema-from-code` 刷新。
