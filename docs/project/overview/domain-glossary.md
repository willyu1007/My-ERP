<!-- INIT:STAGE-A:GLOSSARY -->

# Domain Glossary

## Purpose
Define domain terms used across requirements and implementation.

## Terms

### 账套 (Ledger Book)
- Definition: 一套独立、自成体系的会计账簿与核算规则集合（本位币、会计期间、科目体系），是财务数据的隔离边界（多租户单元）。
- Synonyms: 账簿主体、Account Set
- Non-examples: 不是单个会计科目，也不是组织本身。
- Notes: v1 中账套与 My-Chat 的组织/工作区关联。

### 会计科目 (Account)
- Definition: 对资产、负债、所有者权益、成本、损益进行分类核算的项目，具编码、名称、类别与借贷方向。
- Synonyms: 科目、Chart of Accounts (CoA, 指整套科目)
- Non-examples: 不是凭证分录本身。
- Notes: 支持多级与辅助核算（往来/部门/项目）。

### 记账凭证 (Journal Voucher)
- Definition: 记录一笔经济业务、由若干借贷分录组成且借贷必相等的会计单据。
- Synonyms: 凭证、Voucher、Journal Entry（指整张）
- Non-examples: 不是收付款单（资金单据）。
- Notes: 状态：草稿/已审核/已过账/已红冲。

### 分录 (Journal Entry Line)
- Definition: 凭证中的一行，含科目、借/贷方向、金额与辅助核算。
- Synonyms: 分录行、Entry Line
- Notes: 同一凭证借方合计 = 贷方合计。

### 过账 (Posting)
- Definition: 将已审核凭证登记入总账/明细账并更新科目余额的动作。
- Synonyms: 记账、Post
- Notes: 过账后影响余额；纠错通过红冲。

### 红冲 (Reversal)
- Definition: 以反向凭证冲销已过账凭证以纠错，保留完整轨迹。
- Synonyms: 冲销、Reverse
- Non-examples: 不是物理删除。

### 科目余额 (Account Balance)
- Definition: 某科目在某会计期间的期初、本期借贷发生额与期末余额。
- Synonyms: 余额表、Trial Balance（试算平衡表，汇总形式）

### 会计期间 (Accounting Period)
- Definition: 财务核算的时间区间（通常按月），用于发生额归集与结账。
- Synonyms: 期间、Fiscal Period
- Notes: 结账后封闭，反结账可重开。

### 期末结账 (Period Closing)
- Definition: 期末校验并结转损益、封闭当期的处理；反结账为其逆操作。
- Synonyms: 结账、Closing
- Notes: 结转损益将损益类科目结转至本年利润。

### 出纳 (Cashier)
- Definition: 负责现金与银行资金收付、登记日记账与银行对账的岗位。
- Synonyms: Treasurer/Cashier
- Non-examples: 不负责制单审核（属会计职责，职责分离）。

### 会计 (Accountant)
- Definition: 负责会计科目维护、制单/审核/过账、结账与出报表的岗位。
- Synonyms: Accountant

### 资金账户 (Cash Account)
- Definition: 现金或银行存款账户，记录余额与收付流水。
- Synonyms: 现金账户/银行账户、Bank Account
- Notes: 银行账户含开户行、账号、币种。

### 收付款单 (Receipt / Payment Voucher)
- Definition: 出纳登记资金收入（收款单）或支出（付款单）的业务单据，关联往来单位与资金账户。
- Synonyms: 收款单/付款单、Receipt/Payment
- Notes: 状态：草稿/待审/已审/已收付/作废；付款需审批。

### 现金/银行日记账 (Cash & Bank Journal)
- Definition: 按时间顺序逐笔登记现金或银行账户收付的明细账。
- Synonyms: 日记账、Cash Journal

### 银行对账 (Bank Reconciliation)
- Definition: 将银行日记账与银行对账单逐笔勾对、识别未达账项并编制余额调节表的过程。
- Synonyms: 对账、Reconciliation
- Notes: 产物为银行存款余额调节表。

### 往来单位 (Business Partner)
- Definition: 与本单位发生资金/业务往来的对象，含客户、供应商、员工。
- Synonyms: 往来对象、Partner、客商
- Notes: 作为辅助核算与收付款对象。

### 审批 (Approval)
- Definition: 对付款/凭证等单据的多级审核动作；v1 与 My-Chat 通知/审批联动。
- Synonyms: Approval Flow

### Outbox 事件 (Outbox Event)
- Definition: 与业务写入同事务落库、再异步分发的领域事件，保证写入与对外通知一致（saga）。
- Synonyms: 发件箱事件
- Notes: 对齐 My-Chat 的 outbox/saga 模式。

### 模块 (ERP Module)
- Definition: ERP 平台中可独立演进的业务能力单元；v1 仅实现 finance 模块，并预留注册/扩展机制。
- Synonyms: 能力、Capability、Workflow（联动语境）
- Notes: 用户表述「财务是工作流之一」即指此。

### Logto SSO
- Definition: My-Chat 生态使用的 OIDC 身份提供方；ERP 复用其完成单点登录与身份来源。
- Synonyms: OIDC、统一身份

### 组织/团队（Organization）
- Definition: 财务核算的所属主体与多租户单元；账套归属于组织，个人以组织成员身份进入财务。来源于 My-Chat / Logto Organization。
- Synonyms: 单位、团队、Org
- Non-examples: 不是个人 workspace；个人不直接持有账套（DP22）。

### 邀请制（Invitation-only Membership）
- Definition: 组织成员只能由管理员/主管发起邀请、被邀请人接受后加入并被授角色的加入方式；禁止自助加入（DP25）。
- Synonyms: 邀请加入
- Notes: 邀请有发起/接受/撤销/过期状态；经 Logto 承载身份接受。

### 角色工作流（Role-based Workflow）
- Definition: 以角色为中心、由「待办/任务」驱动的工作流组织方式；每个角色有其任务工作台与状态流转，区别于单一线性「财务管道」（DP26）。
- Synonyms: 角色任务流、待办工作台
- Non-examples: 不是把所有处理串成一条硬编码流水线。
- Notes: 作为可注册能力接入平台；跨角色通过任务流转/事件衔接。

### 待办/任务（Task）
- Definition: 角色工作流中分派给某角色/某人的待处理事项（如待提交、待审批、待过账、待确认收付、待处理邀请）。
- Synonyms: 工作项、待办

### 职责分离（SoD, Segregation of Duties）
- Definition: 同一笔业务的不同控制环节由不同人执行的内控原则，如制单≠审核、付款发起≠审批。
- Synonyms: 不相容职务分离
- Notes: 团队仅 1 人时可显式开启「单人模式」放宽。

### 单人模式（Solo Mode）
- Definition: 当组织财务团队只有 1 人、无法满足职责分离时，可显式开启的降级模式；放宽 SoD 但强制二次确认并全量留痕。
- Synonyms: 单操作员模式
- Non-examples: 不是默认状态；团队≥2 人时强制 SoD。

### 现金流量项目（Cash Flow Item）
- Definition: 用于编制现金流量表（直接法）的归类项目，在涉及现金/银行的分录或收付款上打标。
- Synonyms: 现金流量表项目
- Notes: 支撑 DP11 的现金流量表。

### 辅助核算（Auxiliary Accounting）
- Definition: 在会计科目之外，按往来单位/部门/项目等维度对发生额与余额进行的明细核算。
- Synonyms: 辅助核算项、核算维度
- Notes: v1 含往来单位 + 部门 + 项目三维（DP14）。

### 期初余额 / 启用期（Opening Balance / Go-live Period）
- Definition: 系统启用时设定的起始会计期间，及该时点各科目、往来、资金账户的起始余额；启用期需试算平衡（DP27）。
- Synonyms: 期初建账、初始余额
- Notes: 是既有组织迁入的前提；可手工录入或批量导入。

### 记账规则（Posting Rule）
- Definition: 将业务单据（如收付款单）映射为记账凭证的可配置规则，用于自动生成凭证草稿（DP28）。
- Synonyms: 凭证模板规则、自动凭证规则
- Notes: 规则不命中可回退手工制单；生成的凭证仍需会计复核过账。

### 审批策略（Approval Policy）
- Definition: 定义审批层级与金额阈值分级的可配置规则（DP29），应用于付款及可选凭证审批。
- Synonyms: 审批配置、分级审批规则
- Notes: 策略变更需留痕。

### 票据 OCR（Invoice/Receipt OCR）
- Definition: 对上传的票据图片/PDF 进行光学字符识别，提取金额、往来单位、日期等字段以预填凭证草稿。
- Synonyms: 票据识别、OCR 预填
- Notes: v1 试点（DP12），优先复用 My-Chat `packages/llm`（通义/Dashscope）。

### 集成隔离护栏（Integration Isolation Guardrail）
- Definition: 财务明细数据禁止进入 My-Chat 的 RAG/知识库/论坛/个性化管道，对外仅暴露通知元数据与审批回写的约束（DP24）。
- Synonyms: 数据隔离护栏

### 会计档案（Accounting Archives）
- Definition: 会计凭证、账簿、财务报告等需按法规长期保存的财务记录。
- Notes: 法定留存远超操作审计日志（凭证/账簿约 30 年、年报永久、月/季报 10 年）。

## Entity list (optional)
- Entity: LedgerBook（账套）— Key fields: id, orgId/workspaceId, baseCurrency, fiscalYear；Lifecycle: 创建→启用→归档。
- Entity: Account（会计科目）— Key fields: code, name, category, direction, parentId, isLeaf, auxTypes；Lifecycle: 启用/停用。
- Entity: JournalVoucher（记账凭证）— Key fields: no, date, periodId, summary, status；Lifecycle: 草稿→已审核→已过账→（红冲）。
- Entity: CashAccount（资金账户）— Key fields: type(cash/bank), bankName, accountNo, currency, balance。
- Entity: Receipt/Payment（收付款单）— Key fields: type, partnerId, cashAccountId, amount, status；Lifecycle: 草稿→待审→已审→已收付→（作废）。

## Verification
- All nouns used in `requirements.md` are defined here (or explicitly marked as common language).
