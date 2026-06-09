# 02 — Architecture: Web Workbench Foundation

## 分层（移植自 The-Education，去领域词汇）
```
ui/                         共享设计契约（已存在，与 The-Education 逐字节相同）
  contract/contract.json    角色/槽/属性词表
  tokens/ + styles/         morethan tokens + contract CSS
  patterns/                 list-with-filters · detail · form
  config/governance.json    Tailwind 仅布局 + 仅 token + approvals
packages/ui/                领域无关 workbench 套件（W0 移植目标）
  src/components/           AppShell·Sidebar·Scene/SceneNav·ListView·primitives·entity-*·status-badge·menu·toast·tabs·breadcrumb·icons
  src/styles/               workbench.css(wb-*) · components.css(mt-*) · tokens.css（app 层，建在 ui/tokens 上）
  src/index.ts              统一导出
apps/web/                   财务语义（W1）
  src/app/(workbench)/      外壳路由组 + 各角色场景页（薄页面）
  src/lib/finance/          VM 类型 + fixtures + data-source（demo→真）+ scene-config + format
  src/styles/               仅财务特有的少量样式（优先复用 packages/ui）
```

## 边界与原则（硬约束落地）
- **领域无关 ↔ 财务语义**：`packages/ui` 不得出现任何财务/教育词汇（scenario-agnostic，Scene「carries no domain vocabulary」）；财务 VM/标签/场景配置只在 `apps/web/src/lib/finance`。
- **样式纪律**：Tailwind 仅 `flex/grid/position/overflow/size/truncate`；color/typography/radius/shadow/spacing 一律走 token/contract CSS；禁 inline 视觉样式（inline `style` 仅布局微调）。由 stylelint + eslint 强制（governance.json）。
- **数据流（demo→真）**：页面（server, force-dynamic）→ `data-source`（W1 为 fixtures，后续换 `@my-erp/api-client` 调 `/v1`）→ VM → client 组 `Scene/ListView/form`。**VM 形状是单一事实源**，切真接口不改页面与组件。
- **模板复用**：list-with-filters=`ListView<T>` + `present()`；detail=`grid(section+card)`；form=`form+field` + 前端不变式（借贷平衡）。

## packages/ui 分发
- Next 侧用 `transpilePackages: ['@my-erp/ui']` 直接吃 TS/TSX 源 + CSS；样式经全局 `import '@my-erp/ui/styles'`（或 app 内 `@import`）。RSC 友好：纯展示件 server-safe，交互件标 `"use client"`。

## governance 接入
- `stylelint`（feature CSS 禁属性集）+ eslint flat 增一条「Tailwind 仅布局」检查（依据 governance.json 的 `disallowed_prefixes`/`allowed_utility_whitelist`）+ `ui/approvals` baseline；`pnpm ui:governance` 汇总；CI `build` job 增步骤。

## 主要风险点
- packages/ui 的 RSC/"use client" 边界 → 展示件 server-safe，交互件显式 client。
- governance 误挡 → 先 baseline 现状（approvals auto-baseline），再逐步收紧。
- VM 与未来 `docs/context/api` 契约漂移 → W1 VM 命名对齐领域术语（凭证/分录/科目/账套）。
