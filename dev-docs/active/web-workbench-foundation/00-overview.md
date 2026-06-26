# 00 — Overview: Web Workbench Foundation

## Problem statement
My-ERP 的 `apps/web` 从 P0a 骨架演进为可复用 web workbench。当前 IA 以「按角色组织的财务工作流」为主入口，凭证、科目、账簿只作为工作流、功能或设置内部视图，不作为 sidebar 同级资源入口。The-Education（同生态、同 `ui/` 契约）已有验证过的 workbench 套件，可移植。

## Status
- State: done
- 收尾关闭 2026-06-18。W0–W2c（外壳/IA/科目树/账簿/工作流化）早已完成；**W2d 也已落地**：`data-source`
  全面切到真实 `/v1`（凭证/科目/工作台/出纳/合同/报表/期末结账均走后端；本次补完**账簿试算平衡 + 明细账**的
  `/v1` 切换，删除最后一处 fixtures 双轨），角色待办经 **T-003 我的工作台** 提供。fixtures 仅作 demo 模式回退。
- 注：sidebar 分组在后续迭代改名为 **工作流 / 查询 / 设置**（早期文档写作「财务工作流/财务功能/财务设置」）；
  顶层「录入凭证」入口指向 `/finance/daily-accounting` 内联制单（旧 `/finance/vouchers/new` 演示表单已删）。
- **W2a–W2d done** —— 科目树 / 账簿（试算平衡 + 明细账，已切 `/v1`）/ 财务入口工作流化均完成并验证（见 04-verification）。在 `main` 上实现（沿用 P0a：不另开分支）。
- 架构修正（W1）：首页是 **ERP 整体**（模块化平台，财务是第一个模块），财务模块按 `/finance/` 命名空间；凭证二级导航按 **工作流动作**（制单/审核/过账/红冲）组织。
- W2a：`/finance/accounts` 科目树（多级 + 辅助核算 + 启停）；`AccountVM` 扩展 parentCode/level/auxTypes/active；凭证分录挂末级；制单下拉仅末级且启用。
- W2b：`/finance/ledger` 试算平衡表（期初/本期/期末三栏借贷平衡校验）+ `/finance/ledger/[code]` 科目明细账（运行余额、凭证号回链）；纯函数 `lib/finance/ledger.ts`（整数分、无浮点）经 data-source seam 暴露 `getTrialBalance`/`getAccountLedger`；加期初余额 fixture（借贷平衡）+ 5 项 `ledger.test.ts`。
- W2c：sidebar 从资源入口改为「财务工作流 / 财务功能 / 财务设置」；`/finance/daily-accounting` 成为日常账务处理唯一入口，凭证/科目/账簿保留为内部深链或功能/设置视图；旧凭证列表组件已删除，金额排序继续走整数分。
- Next：W2d —— 角色待办深化（出纳/主管/管理员/查看者）+ 随 M1 P1–P5 把 `data-source` 从 fixtures 切到真实 `/v1`。

## Goal
领域无关 workbench 外壳进 `packages/ui`；Tailwind-仅布局 + 仅 token 的 governance 进 CI；fixture/demo 数据先行构建会计凭证首链路；data-source 预留切真 `/v1`。

## Non-goals (W1 当时的边界 — 多数已在后续任务中完成)
- ~~真实 API 接入（W1 用 demo；待 P1–P5）~~ — **已完成**：data-source 全面切到真实 `/v1`（含账簿）。
- 出纳/主管/管理员/查看者真实权限工作台、真实审批流、真实待办队列。
- 移动端、审批交互面。

## High-level acceptance
- [ ] `packages/ui` 导出领域无关外壳 + 样式，`apps/web` 消费可起。
- [ ] governance（`ui_specctl validate` + feature-code guard + approvals）进 CI 并绿。
- [ ] P0a 骨架页按 token 重写，零 inline 视觉。
- [ ] W2c：日常账务处理作为唯一日常工作流入口；凭证详情/录入深链可用，借贷平衡前端校验保留。

## Pointers
- 参照实现：`/Volumes/DataDisk/Project/The-Education/apps/web/src/{components/workbench,lib/workbench,styles}`
- 共享契约：`ui/contract/contract.json` · `ui/patterns/*` · `ui/tokens/*` · `ui/config/governance.json`
- 硬约束：根 `AGENTS.md`
