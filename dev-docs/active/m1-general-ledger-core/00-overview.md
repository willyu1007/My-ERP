# 00 — Overview: M1 总账核心

## Problem statement
My-ERP 已完成初始化（脚手架 + 契约），但尚无任何财务领域实现。M1 要落地**总账核心闭环**与平台底座，使会计能完成「建科目 → 制单 → 审核 → 过账 → 余额/账簿 → 期初建账」的最小可用闭环。

## Status
- **P3a done / P3b next** —— P0a/P0b/P1/P2/P3a 均实现并验证（见 04-verification）。在 `main` 上实现（不另开分支）。P3 切 P3a（草稿生命周期）+ P3b（过账/红冲）两片。
- P0b：mock 身份、`AuthGuard`/CASL `PermissionGuard`、`audit_record` RLS、审计、结构化日志（OTel SDK/testcontainers 推迟）。
- P1：组织/成员/账套（两级作用域 org+ledger）+ 角色落库（Membership=RBAC SSOT）+ 账套 CRUD + 邀请流（发起/接受/撤销，禁止自助，`PrincipalGuard` 解鸡生蛋）+ 成员管理。
- P2：`Account` 多级科目（编码=树序、辅助核算、借贷方向）；**首张账套级业务表接 RLS**（`app.current_ledger`）；**`LedgerScopeGuard`** 校验账套属本组织（防伪造 ledgerBookId 跨组织）；《小企业准则》模板**幂等种子**；科目 CRUD（建子级翻转父级 isLeaf；停用末级校验=有活跃子级不可停）；`ledgerBookId` 优化为可选（org 级操作免）。
- P3a：`JournalVoucher` + `JournalEntryLine`（账套级 RLS）；借贷平衡不变式 `finance-domain.voucherBalanceError`（服务层）+ DB CHECK（非草稿必平）；草稿生命周期 create/list/detail/update(仅草稿)/submit；制单校验科目存在·末级·启用 + 行单边 + 凭证号按期间生成。凭证不可物理删（无 DELETE 策略）。
- Next concrete step：P3b —— 过账（pending→posted，**SoD 过账人≠制单人**，事务）+ 红冲（posted→reversed，生成反向凭证、双向链接、留痕）。余额/账簿（试算平衡、总账/明细账，由已过账凭证派生）= P4。

## Goal
组织/账套/邀请权限底座 + 会计科目体系 + 记账凭证（借贷平衡/审核/过账/红冲）+ 期初建账 + 科目余额与试算平衡，全程合规可审计。

## Non-goals (M1)
- 出纳资金、收付款、记账规则自动生成凭证（M2）
- 财务报表 BS/IS/CF（M3）、银行对账（v1.1）
- 票据 OCR（M4）、My-Chat 事件/审批联动（M5）
- 多币种/合并报表/税务申报/自动划款（OUT）

## High-level acceptance criteria
- [ ] 可建组织 → 邀请成员（邀请制）→ 授角色 → 建账套；跨账套数据**不可越权访问**（应用层作用域 + Postgres RLS 双保险）。
- [ ] 可从《小企业会计准则》模板初始化科目体系，并维护多级科目与辅助核算标记。
- [ ] 凭证录入**借贷不平不可提交**；制单人 ≠ 审核人；过账走事务并更新科目余额；可红冲且全程留痕。
- [ ] 可设启用期间并录入/导入期初余额，启用期**试算平衡**。
- [ ] 可生成试算平衡表与总账/明细账，数据与凭证一致。
- [ ] 关键操作写 append-only 审计日志；金额全程 Decimal，无浮点。
- [ ] 单元 + 集成测试覆盖借贷平衡、过账事务、账套隔离；CI 绿。

## Pointers
- 需求/蓝图 SSOT：`docs/project/overview/`
- 契约：`docs/context/`（api/openapi.yaml · db/schema.json · glossary.json）
- 硬约束：根 `AGENTS.md` → Hard constraints
