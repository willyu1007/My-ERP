# 00 — Overview: Web Workbench Foundation

## Problem statement
My-ERP 的 `apps/web` 目前只是 P0a 骨架（且骨架页用了 inline 样式，违反 `ui/config/governance.json`）。需要一套可复用的 web 模板体系来承载「按角色组织的财务工作台 + 凭证/科目/账簿的 list/detail/form」。The-Education（同生态、同 `ui/` 契约）已有验证过的 workbench 套件，可移植。

## Status
- **W2b done / W2c next** —— W0、W1、W2a（科目树）、W2b（账簿：试算平衡 + 明细账）均完成并验证（见 04-verification）。在 `main` 上实现（沿用 P0a：不另开分支）。
- 架构修正（W1）：首页是 **ERP 整体**（模块化平台，财务是第一个模块），财务模块按 `/finance/` 命名空间；凭证二级导航按 **工作流动作**（制单/审核/过账/红冲）组织。
- W2a：`/finance/accounts` 科目树（多级 + 辅助核算 + 启停）；`AccountVM` 扩展 parentCode/level/auxTypes/active；凭证分录挂末级；制单下拉仅末级且启用。
- W2b：`/finance/ledger` 试算平衡表（期初/本期/期末三栏借贷平衡校验）+ `/finance/ledger/[code]` 科目明细账（运行余额、凭证号回链）；纯函数 `lib/finance/ledger.ts`（整数分、无浮点）经 data-source seam 暴露 `getTrialBalance`/`getAccountLedger`；加期初余额 fixture（借贷平衡）+ 5 项 `ledger.test.ts`。
- Next：W2c —— 角色工作台（出纳/主管/管理员/查看者）+ 待办队列。随 M1 P1–P5 把 `data-source` 从 fixtures 切到真实 `/v1`。

## Goal
领域无关 workbench 外壳进 `packages/ui`；Tailwind-仅布局 + 仅 token 的 governance 进 CI；fixture/demo 数据先行构建会计凭证首链路；data-source 预留切真 `/v1`。

## Non-goals
- 真实 API 接入（W1 用 demo；待 P1–P5）。
- 出纳/主管/管理员/查看者工作台、科目树、账簿、待办队列（W2+）。
- 移动端、审批交互面。

## High-level acceptance
- [ ] `packages/ui` 导出领域无关外壳 + 样式，`apps/web` 消费可起。
- [ ] governance（stylelint + eslint 仅布局 + ui/approvals）进 `pnpm lint`/CI 并绿。
- [ ] P0a 骨架页按 token 重写，零 inline 视觉。
- [ ] W1：凭证 列表/详情/制单 三页 demo 数据可用，全走模板，借贷平衡前端校验。

## Pointers
- 参照实现：`/Volumes/DataDisk/Project/The-Education/apps/web/src/{components/workbench,lib/workbench,styles}`
- 共享契约：`ui/contract/contract.json` · `ui/patterns/*` · `ui/tokens/*` · `ui/config/governance.json`
- 硬约束：根 `AGENTS.md`
