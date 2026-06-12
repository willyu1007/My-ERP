# 02 — Architecture: Web Workbench Foundation

## 分层（移植自 The-Education，去领域词汇）
```
ui/                         共享设计契约（已存在，与 The-Education 逐字节相同）
  contract/contract.json    角色/槽/属性词表
  tokens/ + styles/         morethan tokens + contract CSS
  patterns/                 list-with-filters · detail · form
  config/governance.json    Tailwind 仅布局 + 仅 token + approvals
@willyu1007/web-workbench   公共内容模板与样式（Scene/ListView/entity-* 等）
packages/ui/                host chrome + facade
  src/components/           AppShell·Sidebar·SidebarCreate·AccountMenu·toast·overlay·breadcrumb-context·copy-field
  src/model/nav.ts          ShellNav 配置类型
  src/index.ts              公共包 facade + host chrome 统一导出
apps/web/                   财务语义
  src/app/(workbench)/      外壳路由组 + 各角色场景页（薄页面）
  src/lib/finance/          VM 类型 + fixtures + data-source（demo→真）+ scene-config + format
  src/styles/               仅财务特有的少量样式（优先复用 packages/ui）
```

## 边界与原则（硬约束落地）
- **领域无关 ↔ 财务语义**：`packages/ui` 不得出现任何财务/教育词汇（scenario-agnostic，Scene「carries no domain vocabulary」）；财务 VM/标签/场景配置只在 `apps/web/src/lib/finance`。
- **样式纪律**：Tailwind 仅 `flex/grid/position/overflow/size/truncate`；color/typography/radius/shadow/spacing 一律走 token/contract CSS；禁 inline 视觉样式（inline `style` 仅布局微调）。由 `ui_specctl validate` + feature-code guard 强制。
- **数据流（demo→真）**：页面（server, force-dynamic）→ `data-source`（W1 为 fixtures，后续换 `@my-erp/api-client` 调 `/v1`）→ VM → client 组 `Scene/ListView/form`。**VM 形状是单一事实源**，切真接口不改页面与组件。
- **模板复用**：list-with-filters=`ListView<T>` + `present()`；detail=`grid(section+card)`；form=`form+field` + 前端不变式（借贷平衡）。

## packages/ui 分发
- Next 侧用 `transpilePackages: ['@my-erp/ui']` 直接吃 host chrome TS/TSX 源；内容模板与样式来自 `@willyu1007/web-workbench` dist，app 全局 import 公共包样式。RSC 友好：纯展示件 server-safe，交互件标 `"use client"`。

## governance 接入
- `ui_specctl validate` 校验 tokens/contract；`scripts/ui-governance-guard.mjs` 扫 feature 代码禁 inline 视觉和硬编码视觉值；`pnpm ui:governance` 汇总；CI `build` job 增步骤。

## 主要风险点
- packages/ui 的 RSC/"use client" 边界 → 展示件 server-safe，交互件显式 client。
- governance 误挡 → 先 baseline 现状（approvals auto-baseline），再逐步收紧。
- VM 与未来 `docs/context/api` 契约漂移 → W1 VM 命名对齐领域术语（凭证/分录/科目/账套）。
