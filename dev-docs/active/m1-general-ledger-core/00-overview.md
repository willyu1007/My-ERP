# 00 — Overview: M1 总账核心

## Problem statement
My-ERP 已完成初始化（脚手架 + 契约），但尚无任何财务领域实现。M1 要落地**总账核心闭环**与平台底座，使会计能完成「建科目 → 制单 → 审核 → 过账 → 余额/账簿 → 期初建账」的最小可用闭环。

## Status
- **🎉 M1 总账核心闭环完成（P0–P5 全部实现并验证）** —— 见 04-verification。在 `main` 上实现（不另开分支）。每阶段独立提交 + 自审修复。后端总账闭环：组织/账套/邀请/权限 → 科目体系 → 凭证（借贷平衡/SoD/过账/红冲）→ 账簿（派生）→ 期初建账，全程合规可审计。
- P0b：mock 身份、`AuthGuard`/CASL `PermissionGuard`、`audit_record` RLS、审计、结构化日志（OTel SDK/testcontainers 推迟）。
- P1：组织/成员/账套（两级作用域 org+ledger）+ 角色落库（Membership=RBAC SSOT）+ 账套 CRUD + 邀请流（发起/接受/撤销，禁止自助，`PrincipalGuard` 解鸡生蛋）+ 成员管理。
- P2：`Account` 多级科目（编码=树序、辅助核算、借贷方向）；**首张账套级业务表接 RLS**（`app.current_ledger`）；**`LedgerScopeGuard`** 校验账套属本组织（防伪造 ledgerBookId 跨组织）；《小企业准则》模板**幂等种子**；科目 CRUD（建子级翻转父级 isLeaf；停用末级校验=有活跃子级不可停）；`ledgerBookId` 优化为可选（org 级操作免）。
- P3a：`JournalVoucher` + `JournalEntryLine`（账套级 RLS）；借贷平衡不变式 `finance-domain.voucherBalanceError`（服务层）+ DB CHECK（非草稿必平）；草稿生命周期 create/list/detail/update(仅草稿)/submit；制单校验科目存在·末级·启用 + 行单边 + 凭证号按期间生成。凭证不可物理删（无 DELETE 策略）。
- P3b：过账（pending→posted，**SoD 过账人≠制单人**，事务，DB CHECK 兜底平衡）+ **单人模式**（账套显式开启 + 二次确认 `confirmSinglePerson` 方可自过账，特殊审计）+ 红冲（posted→reversed，生成 posted 反向凭证：借贷互换、双向链接 reversalOf/reversedBy、不可重复红冲）。`LedgerScopeGuard` 改挂完整账套实体（读 singlePersonMode）。
- P4：账簿**由已过账凭证派生**（不物化 AccountBalance）：`finance-domain` 纯函数 `computeTrialBalance`/`computeAccountLedger`（Decimal 零浮点）+ db `getPostedEntriesTx`（含 posted+reversed，红冲净额归零留痕）+ `LedgerController`（GET trial-balance / accounts/:code）。派生天然规避并发过账错账。数值与 W2b 前端 demo 一致。
- P5：期初建账 —— `OpeningBalance` 表 + `LedgerBook.openingPeriod`；`PUT /v1/opening-balances`（启用期 + 期初余额，**启用期试算平衡校验** 借=贷、科目末级·启用、**须在使用前**）；派生账簿自动纳入期初（期初+本期=期末累计，已 e2e 验证 80000→85000）。
- M1 完成。后续：W2b 前端 data-source 切真（账簿/凭证）；M2 出纳资金。

## Goal
组织/账套/邀请权限底座 + 会计科目体系 + 记账凭证（借贷平衡/审核/过账/红冲）+ 期初建账 + 科目余额与试算平衡，全程合规可审计。

## Non-goals (M1)
- 出纳资金、收付款、记账规则自动生成凭证（M2）
- 财务报表 BS/IS/CF（M3）、银行对账（v1.1）
- 票据 OCR（M4）、My-Chat 事件/审批联动（M5）
- 多币种/合并报表/税务申报/自动划款（OUT）

## High-level acceptance criteria（M1 全部达成 ✅）
- [x] 可建组织 → 邀请成员（邀请制）→ 授角色 → 建账套；跨账套数据**不可越权访问**（应用层作用域 + Postgres RLS 双保险）。【P1】
- [x] 可从《小企业会计准则》模板初始化科目体系，并维护多级科目与辅助核算标记。【P2】
- [x] 凭证录入**借贷不平不可提交**；制单人 ≠ 审核人；过账走事务；可红冲且全程留痕。【P3】
- [x] 可设启用期间并录入/导入期初余额，启用期**试算平衡**。【P5】
- [x] 可生成试算平衡表与总账/明细账，数据与凭证一致（派生）。【P4】
- [x] 关键操作写 append-only 审计日志；金额全程 Decimal，无浮点。【贯穿】
- [x] 单元 + 集成测试覆盖借贷平衡、过账事务、账套隔离；本地全绿（CI 需 PG service container 跑集成测试）。【贯穿】

## Pointers
- 需求/蓝图 SSOT：`docs/project/overview/`
- 契约：`docs/context/`（api/openapi.yaml · db/schema.json · glossary.json）
- 硬约束：根 `AGENTS.md` → Hard constraints
