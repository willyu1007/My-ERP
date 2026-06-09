# Roadmap — Web Workbench Foundation（财务后台 web 基座）

> 宏观规划。决策来源：与用户的 UIUX 讨论（2026-06-09，5 项决策）。参照实现：`/Volumes/DataDisk/Project/The-Education`（同生态、同 `ui/` 契约）。硬约束见根 `AGENTS.md`，UI 规范见 `ui/config/governance.json` 与 `ui/patterns/`。

## 目标
把 The-Education 已验证的 **workbench 模板体系**移植为 My-ERP 的 web 基座：领域无关外壳进 `packages/ui` + governance（Tailwind 仅布局 + 仅 token）落地到 CI；并用 **fixture/demo 数据先行**构建财务工作台的首条核心链路（会计 · 凭证 list→detail→form），与 M1 后端（P0b/P1–P5）并行，后续切真 `/v1` 接口。

## 范围（In）
- **W0 套件移植 + governance**：`packages/ui` 领域无关外壳（AppShell/Scene/ListView/primitives/entity-*/status-badge/menu/toast/tabs/breadcrumb/icons）+ 样式层（wb-*/mt-*/app tokens，建在共享 `ui/tokens`）；stylelint + eslint「仅布局」+ ui/approvals 进 CI；按 token 重写 P0a 骨架页。
- **W1 会计 · 凭证三件套**：`(workbench)` 外壳 + 会计 scene-config；`lib/finance` VM + fixtures + 可插拔 data-source；凭证列表（list-with-filters）→ 凭证详情（detail）→ 制单（form，前端借贷平衡校验）。

## 非范围（Out → 后续）
- 真实 API 接入（待 M1 P1–P5；W1 用 demo data-source，预留切换点）。
- 其它角色工作台（出纳/主管/管理员/查看者）、科目树、账簿、待办队列 → W2+。
- 移动端（生态 My-Chat 承担）、审批交互面。

## 里程碑内阶段
| 阶段 | 主题 | 退出标准（概要） |
|---|---|---|
| W0 | 套件移植 + governance | packages/ui 可用；governance 进 CI；骨架页 token 化；lint/build 绿 |
| W1 | 会计 + 凭证三件套 | 列表/详情/制单 demo 数据可用，走 Scene/ListView/form 模板，借贷平衡前端校验 |

## 关键风险与对策
- **governance 误挡正常代码** → 移植时严守 wb-*/mt-* + token；先 baseline 现状，再逐步收紧。
- **品牌/教育词汇耦合** → 移植时去 `@the-educator/*` 依赖与教育语义，外壳保持领域无关。
- **demo ↔ 真 API 形状漂移** → VM 类型为单一事实源，data-source 仅换实现不改形状；VM 对齐 `docs/context/api` 契约演进。
- **与 M1 后端并行的双轨** → web 走 demo，不阻塞后端；切真接口作为独立阶段。

## 回滚策略
- 每阶段独立 PR；packages/ui 为新增包，回滚不影响 api；骨架页改动可还原。

## 开放问题
- W1 首链路确认：会计·凭证三件套 vs 角色无关「待办工作台」首页（待用户拍板）。
- packages/ui 的样式分发方式（Next `transpilePackages` vs 预编译 CSS）——W0 内定。
