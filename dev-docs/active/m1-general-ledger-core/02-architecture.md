# 02 — Architecture: M1 总账核心

## 模块分解（monorepo, 全模块化 DDD）
```
apps/
  api      NestJS：REST + OpenAPI；认证(Logto)/授权(CASL)/事务/审计
  web      Next.js：财务后台（Tailwind+Radix+TanStack Table）
  workers  BullMQ（M1 仅占位：审计/导入异步；OCR/事件后续里程碑）
packages/
  platform        模块注册 · RBAC(CASL) · auth · 审计 · 审批引擎(后续)
  finance-domain  领域实体与不变式（账套/科目/凭证/余额）— 无 Prisma 依赖
  db              Prisma schema(SSOT) + 仓储实现（返回领域实体）
  contracts       共享类型 + 事件 schema（zod）
  api-client      OpenAPI 生成的 TS 客户端
  ui              morethan tokens + 共享组件
```

## 分层与边界（硬约束落地）
- **业务层禁止 import Prisma**：领域逻辑在 `finance-domain`；持久化在 `packages/db` 仓储，仓储返回领域实体。
- **领域不变式**（强制在领域层）：凭证借方合计 = 贷方合计；过账后余额恒等；红冲不可改原凭证。
- **事务边界**：过账、红冲、结账（后续）在单事务内完成；失败整体回滚。
- **金额**：`Decimal`（Prisma）/ `NUMERIC`（PG）/ decimal.js；金额 2 位、单价/汇率 4 位；禁止浮点运算。

## 多租户与授权（B1 + DP25）
- 每个请求解析出 `orgId` 与目标 `ledgerBookId`（令牌声明/请求头），注入请求作用域。
- **应用层**：仓储查询强制带 `ledgerBookId` 过滤；CASL 定义 RBAC + 操作级 + 条件（账套级行级）。
- **数据库层兜底**：Postgres RLS 按 `ledgerBookId`（会话变量 `app.current_ledger`）行级隔离。
- 高敏操作（过账/红冲/期初/邀请/授权）单独授权点 + 审计。

## 关键数据模型（M1 起步）
- 平台：`Organization` `Membership(role)` `Invitation(status)` `LedgerBook(baseCurrency, fiscalYear)` `AccountingPeriod` `AuditRecord(append-only)`
- 科目：`Account(code,name,category,direction,parentId,isLeaf,auxTypes,active)` `AuxiliaryItem`
- 凭证：`JournalVoucher(no,date,periodId,status)` `JournalEntryLine(accountId,dr/cr,amount,aux,cashFlowItem?)`
- 余额：`AccountBalance(ledgerBookId,accountId,periodId,opening,drTurnover,crTurnover,closing)` `OpeningBalance`
- ID：UUID 主键 + 业务序列号（凭证号按账套+期间生成）。

## 集成（M1 仅身份；其余里程碑）
- 身份：Logto/OIDC（web `@logto/next`，api 校验 JWT）；组织/成员/邀请映射 Logto Organizations（接入参数待对齐 → 先抽象 + mock）。
- 事件/审批/OCR：M1 不实现；`packages/contracts` 预留事件 schema 占位，不接生态。
- **强隔离红线**：财务数据不写入任何 My-Chat 生态存储/检索。

## 可观测与审计
- OTel（trace/metric）+ 结构化日志；关键业务指标占位（过账失败、越权拒绝、审计写入）。
- 审计 `append-only`，记录操作人/时间/前后值；会计档案归档策略在 M3（报表/导出）落地。

## 主要风险点
- 过账并发一致性 → 余额更新用事务 + 行锁/乐观锁；集成测试覆盖并发。
- RLS 与连接池/会话变量配合 → 在请求中间件设置会话变量，连接归还前清理。
- Logto Organizations 能力不确定 → 抽象 `IdentityProvider` 接口，mock 起步，便于后续替换。
