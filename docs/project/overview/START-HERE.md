<!-- INIT:START-HERE:LLM-TEMPLATE -->

# START-HERE（项目意图速记）

> 友好的需求记录 + 笔记本。阶段机制与下一步命令请看 `init/INIT-BOARD.md`。

## 当前焦点
- ✅ **初始化完成**（Stage A/B/C 全部批准）。下一步：实现 M1（总账核心）；可选收尾：术语迁移到 `docs/context/glossary.json`、退役 `init/`。

## 当前结论
- My-ERP = 可嵌入 **My-Chat 生态**的**智能化 ERP 平台**（模块化/可插拔）；**财务是第一个模块**，未来可扩展（采购/库存/销售/HR…）并与 My-Chat 联动。
- **v1 聚焦财务**，服务对象 = **会计（总账核算）** + **出纳（资金管理）**。
- 集成（已确认）：**独立服务 + 独立 PostgreSQL**，复用 **Logto SSO** 身份与组织/工作区，经 **outbox 事件 / API** 与 My-Chat 双向联动。
- 技术栈（已确认）：**对齐 My-Chat** —— TypeScript + pnpm monorepo + NestJS(API) + Prisma + PostgreSQL。
- 露出（已确认）：**独立财务后台 Web** + 关键事件经 My-Chat **推送通知/审批**。

## 关键输入（保持精简）

| Key | Value | Status |
|---|---|---|
| Project name | my-erp（智能 ERP 平台，财务为首个模块） | confirmed |
| One-line purpose | 为 My-Chat 生态提供可嵌入、可扩展的 ERP，v1 聚焦财务（会计+出纳） | confirmed |
| Primary users | 会计、出纳、财务主管/管理员 | confirmed |
| Must-have scope | 总账（科目/凭证/账簿/结账/报表）+ 出纳（资金账户/收付款/日记账/对账）+ 主数据 + 集成 | confirmed |
| Out-of-scope | 非财务模块、自动划款、工资/税务/合并报表、AI 记账(仅预留)、原生 App | confirmed |
| Constraints | 可嵌入 My-Chat：Logto 身份、Postgres/Prisma(SSOT)+outbox、morethan 设计语言；独立库；v1 不实际划款 | confirmed |
| Success metrics | 核算闭环可用、借贷必平、审批联动可达、账套隔离；详见 NFR | confirmed |
| Tech stack preference | TS + pnpm monorepo + NestJS + Prisma + PostgreSQL | confirmed |
| Timeline / deadline | 待定（可在 Stage B 细化里程碑） | tbd |

## AI 待问（下一步）
- [ ] 待你**审批 Stage A**；若需调整范围（如银行对账是否纳入 v1、账套与组织映射粒度、是否内置标准科目模板），见 `risk-open-questions.md` 的开放问题。

## 本轮笔记
- My-Chat 勘察：pnpm monorepo、NestJS API、Next.js web、Convex 只读投影、BullMQ workers、Postgres+Prisma 为 SSOT、DDD `packages/domain/*`、outbox/saga、Logto/OIDC、Purpose-Based 权限层；财务仅 `subscription_tier`/配额占位。
- Stage A 4 份文档已写就并 `check-docs --strict` 通过；must-ask 8/8。
- 已逐点对齐 32 个决策点（DP1–DP32）。要点补充：
  - **核算运作**（DP27–DP30）：期初建账（启用期+期初余额录入/导入）；收付款单按规则自动生成凭证草稿（出纳↔会计衔接）；可配置多级+金额阈值审批；凭证/账簿/报表导出(Excel/PDF)+打印+凭证导入。
  - **期间/税额**（DP31/DP32）：自然年 12 期+年结期；凭证记税额（价税分离）但不申报。
- Stage B 技术栈/功能选型已对齐（写入 `project-blueprint.json`）：
  - 技术栈：monorepo·NestJS·Next.js + **Tailwind+Radix+TanStack Table**·**REST+OpenAPI 生成客户端**·Postgres+Prisma(SSOT)·**金额 Decimal/NUMERIC**·BullMQ+Redis·Logto(+Organizations)·**CASL** 授权·zod·**OTel→ARMS/SLS**。
  - 功能选型：自研复式记账引擎·可配置报表模板·**OCR=通义/Dashscope 视觉+适配接口**·导入导出 exceljs/pdfmake。
  - 审批（F1 细化 DP9）：**ERP 拥有审批引擎+状态机；My-Chat 作审批交互面（Web+移动端+dashboard），回调写回**；事件传输变双向（Outbox+Webhook 出 / 审批回调 入）；强隔离下审批详情按需鉴权拉取。
  - ⚠️ 依赖：需 My-Chat 提供审批卡片 UI（含移动端）+ 事件摄入端 + 回调对接。
  - 架构决策（B1–B4）：多租户=**应用层作用域+Postgres RLS 双保险**；实时=**SSE/轮询（不用 Convex，守 DP24）**；服务间认证=**webhook HMAC + 回调 Logto M2M**；档案=**append-only + 对象存储归档（30年/永久）**。默认：plain pnpm、独立库+独立 Redis、金额 2 位、UUID 主键+业务序列号、`/v1`。
  - **组织级 + 邀请制 + 严格权限**（DP25）：数据库即组织级；成员仅邀请制加入，禁止自助；RBAC+最小权限+账套级+操作级授权。
  - **按角色组织工作流**（DP26）：每角色一套「待办/任务」工作流（出纳/会计/主管/管理员/查看者），而非线性财务管道；作为可注册能力接入平台。
  - **个人生态约束**：财务 = **组织/团队级**（DP22），账套属组织、一组织可多账套；个人以成员身份进入。
  - **职责分离**：默认强 SoD，团队仅 1 人可开**单人模式**（放宽+强留痕，DP23）。
  - **数据强隔离**（DP24）：财务明细不进 My-Chat RAG/知识库/论坛/个性化，仅走事件通知+审批回写。
  - 范围较初版扩展：含**现金流量表**（DP11）、**票据 OCR 试点**（DP12）、辅助核算**往来+部门+项目**（DP14）；**银行对账移 v1.1**（DP8）。
  - 合规：操作审计日志（≥1年）与**会计档案法定留存**（凭证/账簿~30年、年报永久、月季报10年）分列（DP21）。

---

<details>
<summary>Archive（追加写入；默认折叠）</summary>

----
### Stage C wrap-up - 2026-06-05
- Summary: 脚手架与契约落地并批准，初始化完成。生成通用 monorepo 骨架 + contextAwareness/db(repo-prisma)/env/ui/ci(github)/observability 契约脚手架。
- Decisions landed: 技能三轮精简（85→55，删 28）只留与技术栈贴合的高有用集；根 README/AGENTS 手写为差异化策略/硬约束（财务正确性·安全多租户·责任边界·架构编排·品牌），并明确 My-Chat 定义与职责边界（不写跨项目接线）。
- Next: 实现 M1 总账核心；可选术语迁移到 docs/context/glossary.json、退役 init/。

----
### Stage B wrap-up - 2026-06-05
- Summary: 蓝图定稿并批准。技术栈对齐 My-Chat，功能选型与架构决策（T1–T4、F1–F4、B1–B4）全部对齐。
- Decisions landed: monorepo·NestJS·Next.js+Tailwind/Radix/TanStack·REST+OpenAPI·Postgres+Prisma(SSOT)·金额 Decimal·BullMQ+Redis·Logto(+Org/邀请)·CASL·OTel→ARMS/SLS；自研记账引擎·可配置报表·OCR=通义/Dashscope+适配·exceljs/pdfmake；审批=ERP 引擎+My-Chat 交互面(含移动端)+回调；事件双向(Outbox+Webhook 出/M2M 回调入)；多租户=应用层+RLS 双保险；实时=SSE/轮询(不用 Convex)；档案=append-only+OSS 归档；模块=全模块化 DDD。features：context/db/ui/env/ci/observability（ops 后置）。
- Open dependency: My-Chat 审批卡片(Web+移动端)+事件摄入端+回调对接。

----
### Stage A wrap-up - 2026-06-05
- Summary: 完成 My-ERP 财务 v1 需求梳理；定位为可嵌入 My-Chat 的模块化智能 ERP，财务为首个模块（会计+出纳）。4 份 Stage A 文档 `check-docs --strict` 通过，已批准。
- Decisions landed: 逐点对齐 **DP1–DP32**。要点：独立服务+独立 Postgres+Logto SSO+outbox 事件；技术栈对齐 My-Chat；独立财务后台+聊天通知；组织级+邀请制+严格权限；按角色组织工作流（非线性管道）；财务数据强隔离于生态检索；范围含现金流量表+票据 OCR 试点+期初建账+单据自动生成凭证+多级金额阈值审批+导出打印导入；银行对账移 v1.1；操作审计与会计档案法定留存分列。
- Key input changes: 范围较初稿扩展（现金流量表、OCR、辅助核算三维、期初/导入导出）。
- Open questions（带入 Stage B）: Logto 邀请接入方式、角色工作流是否注册进 My-Chat workflow-runtime、OCR 通道选型、事件 schema、分阶段里程碑。

</details>
