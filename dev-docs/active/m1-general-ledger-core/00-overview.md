# 00 — Overview: M1 总账核心

## Problem statement
My-ERP 已完成初始化（脚手架 + 契约），但尚无任何财务领域实现。M1 要落地**总账核心闭环**与平台底座，使会计能完成「建科目 → 制单 → 审核 → 过账 → 余额/账簿 → 期初建账」的最小可用闭环。

## Status
- **P0a done / P0b next** —— P0a（平台骨架 + CI 绿）已实现并本地验证通过（见 04-verification）。在 `main` 上实现（用户指示不另开分支）。
- Next concrete step：P0b —— `IdentityProvider` 抽象 + mock、JWT 中间件、CASL 授权骨架、Postgres RLS 基线（`SET LOCAL app.current_ledger`）、审计写入封装、OTel + testcontainers 集成测试。

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
