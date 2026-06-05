# AI Assistant Instructions

**My-ERP** — 可嵌入 **My-Chat 生态**的模块化智能 ERP 平台；v1 聚焦财务模块（会计总账 + 出纳资金）。

> 技术栈、目录、依赖请直接扫仓库（`package.json` / `prisma/` / `docs/context/`）；本文件只写**扫仓库得不到的**全局策略与硬约束。

## Hard constraints (MUST — 不可违背)

读这些规则**先于**写任何代码。它们大多无法从代码反推，违背会造成财务/合规/安全事故。

### 1. 财务正确性与合规
- **借贷必平**：凭证借方合计必须等于贷方合计；不平不得提交/过账。
- **禁止静默删除**：凭证/单据/账簿**不得物理删除**；纠错仅用**作废**或**红冲**，全程留痕。
- **事务边界**：过账、结账走数据库事务；期间结账后封闭，仅反结账可重开。
- **金额禁用浮点**：一律 `Decimal` / Postgres `NUMERIC`（+ decimal.js）；金额 2 位、单价/汇率 4 位。
- **留存分两类**：操作审计日志 ≥ 1 年；**会计档案**（凭证/账簿 ~30 年、年报永久、月/季报 10 年）`append-only` + 对象存储归档，**禁止删除会计档案**。
- **不实际划款**：v1 仅登记/审批/对账，**严禁**接入自动出款/支付通道。

### 2. 安全与多租户
- **组织级能力**：财务属**组织/团队**；账套归组织，个人仅以成员身份进入。
- **邀请制加入**：成员仅由管理员/主管邀请加入，**禁止自助加入**。
- **隔离双保险**：每个数据访问**必须带账套作用域**（CASL + 仓储），并由 **Postgres RLS** 兜底；严禁无账套作用域的查询。
- **严格授权**：RBAC + 最小权限 + **操作级授权**（过账/付款审批/结账等高敏操作单独授权）。
- **职责分离（SoD）**：制单 ≠ 审核、付款发起 ≠ 审批；**单人模式**必须显式开启且强制二次确认 + 全量留痕。

### 3. 责任边界（My-ERP vs My-Chat 生态）
- **My-Chat 是什么**：个人优先的 AI 聊天/协作生态（**独立产品与代码库**），提供统一身份与组织、以及聊天/通知/移动端等面向用户的触达面。My-ERP 是**可嵌入该生态的独立 ERP 服务**。
- **My-ERP 负责**：财务领域的**唯一真相源**（账套/科目/凭证/账簿/余额/资金/收付款/审批规则与状态机/报表/会计档案），以及自己的数据库、权限、审计与合规留存、后台 Web 与 API。
- **边界外（不负责）**：身份系统与面向用户的触达面（聊天、通知、移动端）由 **My-Chat 生态**承担；ERP **复用** Logto 身份，**不复制、不接管**，也不在 ERP 内重建这些触达面。
- **硬边界（红线）**：独立服务 + 独立数据库，**严禁直连 My-Chat 数据库**；**财务明细严禁进入生态的检索/推荐/论坛**——仅向生态暴露通知元数据与审批结果回写。

### 4. 架构与编排
- **模块化平台**：财务是首个模块；新增能力走**模块注册**，复用同一注册/编排范式，不得另起炉灶。
- **按角色组织工作流**（待办/任务驱动）：**不得退化为硬编码线性管道**；跨角色通过任务流转/事件衔接。
- **业务层禁止 import Prisma**（详见 DB-SSOT 段）：仓储返回领域实体。

### 5. 品牌与口径（对齐 My-Chat）
- 始终小写 **morethan**（不写 MoreThan/Morthan）；sentence case；不使用 emoji（仅允许 `●` U+25CF）；克制、专业的语气。

## Routing

| Task Type | Entry Point |
|-----------|-------------|
| **Skill authoring / maintenance** | `.ai/AGENTS.md` |
| **LLM engineering** | `.ai/llm-config/AGENTS.md` |
| **Project progress governance** | `.ai/project/AGENTS.md` |
| **Complex task documentation** | `dev-docs/AGENTS.md` |

## Global Rules

- Follow progressive disclosure: read only the file you are routed to
- On context reset for ongoing work, read `dev-docs/active/<task-name>/00-overview.md` first

## Coding Standards (RECOMMEND)

- **ESM (.mjs)**: All scripts in the repository use ES Modules with `.mjs` extension. Use `import`/`export` syntax, not `require()`.

## Coding Workflow (MUST)

- Before modifying code/config for a non-trivial task, apply the Decision Gate in `dev-docs/AGENTS.md` and create/update the dev-docs task bundle as required.
- If the user asks for planning artifacts (plan/roadmap/milestones/implementation plan) before coding:
  - If the task meets the Decision Gate, use `plan-maker` first, then ask for confirmation to proceed with implementation.
  - If the task is trivial (<30 min), provide an in-chat plan (do NOT write under `dev-docs/`).
  - If the task needs context preservation (multi-session, handoff) or qualifies as complex, follow `dev-docs/AGENTS.md` and use dev-docs workflows.

## Workspace Safety (MUST)

- NEVER create/copy/clone this repository into any subdirectory of itself (no nested repo copies).
- Create throwaway test repos **outside** the repo root (OS temp or a sibling directory) and delete them after verification.
- Keep temporary workspaces shallow: if a path is getting deeply nested or has exceeded **12 path segments** total;, stop and clean up instead of continuing.

<!-- DB-SSOT:START -->
## Database SSOT and schema synchronization

**Mode: repo-prisma** (SSOT = `prisma/schema.prisma`)

- SSOT selection file: `docs/project/db-ssot.json`
- DB context contract (generated, LLM-first): `docs/context/db/schema.json`
- If you need to change persisted fields / tables: use skill `sync-db-schema-from-code`.
- If you need to mirror an external DB: do NOT; this mode assumes migrations originate in the repo.

Rules:
- Business layer MUST NOT import Prisma (repositories return domain entities).
- Database workflows in this repo require `features.contextAwareness=true`.
- Refresh generated DB context via `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`.
<!-- DB-SSOT:END -->
