# 00 — Overview: Web Workbench Foundation

## Problem statement
My-ERP 的 `apps/web` 目前只是 P0a 骨架（且骨架页用了 inline 样式，违反 `ui/config/governance.json`）。需要一套可复用的 web 模板体系来承载「按角色组织的财务工作台 + 凭证/科目/账簿的 list/detail/form」。The-Education（同生态、同 `ui/` 契约）已有验证过的 workbench 套件，可移植。

## Status
- **W0 done / W1 next** —— W0（套件移植 + governance + 骨架 token 化）完成并验证（见 04-verification）。在 `main` 上实现（沿用 P0a：不另开分支）。
- Next：W1 —— `apps/web/src/lib/finance`（VM + fixtures + data-source）+ 会计 `(workbench)` 外壳/scene-config + 凭证 list→detail→form（demo 数据，前端借贷平衡校验）。

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
