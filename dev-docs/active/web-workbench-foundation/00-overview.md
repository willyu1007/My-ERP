# 00 — Overview: Web Workbench Foundation

## Problem statement
My-ERP 的 `apps/web` 目前只是 P0a 骨架（且骨架页用了 inline 样式，违反 `ui/config/governance.json`）。需要一套可复用的 web 模板体系来承载「按角色组织的财务工作台 + 凭证/科目/账簿的 list/detail/form」。The-Education（同生态、同 `ui/` 契约）已有验证过的 workbench 套件，可移植。

## Status
- **W1 done / W2 next** —— W0（套件移植 + governance）与 W1（ERP 总览首页 + 财务模块凭证 列表/详情/制单，demo 数据）均完成并验证（见 04-verification）。在 `main` 上实现（沿用 P0a：不另开分支）。
- 架构修正（W1）：首页是 **ERP 整体**（模块化平台，财务是第一个模块），财务模块按 `/finance/` 命名空间；凭证二级导航按 **工作流动作**（制单/审核/过账/红冲）组织；科目/账簿为可点空状态页（W2 占位）。
- Next：W2 —— 科目树、账簿（试算平衡/总账/明细账）、其余角色工作台（出纳/主管/管理员/查看者）+ 待办队列；并随 M1 P1–P5 把 `lib/finance/data-source` 从 fixtures 切到真实 `/v1`（`@my-erp/api-client`）。

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
