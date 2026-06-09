# 03 — Implementation Notes: Web Workbench Foundation

## W0 — 套件移植 + governance（完成）

**改了什么**
- `packages/ui` 从占位重配为 **React 源码库**：`exports` 指向 `src`（Next `transpilePackages` 直接吃源码）、`./styles.css` 暴露样式；tsconfig 改 React/JSX、`noEmit`（消费方按源码编译，无需 dist）。
- **样式层移植**（≈1500 行，建在共享 `ui/tokens` 上）：`app-tokens.css`（morethan 品牌色/字阶）+ `components.css`（`mt-*`）+ `workbench.css`（`wb-*`），`styles/index.css` 按层装配；头注去教育词汇。
- **组件套件移植**（领域无关）：
  - 直接港运：`icons·menu·overlay·tabs·toast·breadcrumb·copy-field·topbar-slot·primitives·scene/SceneNav·list-view·entity-table/row/card·table-cells·account-menu`（仅改 `lib/workbench/*` → `../model/*` 路径）。
  - 通用模型搬入 `packages/ui/src/model`：`card-model·table-model·row-model` + 新增 `nav.ts`（ShellNav 配置类型）。
  - **改造（去领域）**：`AppShell`/`Sidebar` 的导航 `GROUPS/SECTIONS/badges` → 改成 `nav: ShellNav` + `badges: Record<string,number>` props（财务侧注入）；`status-badge` → 通用 `<Badge tone>`（领域 status→tone 映射移交 app）；`AccountMenu` 退出登录改 `signOutHref` prop；`SidebarCreate` 改 `items` 配置。去掉 `ScenarioSwitcher`。
  - `src/index.ts` 统一 barrel 导出。
- **apps/web 接线**：`next.config` 加 `transpilePackages:['@my-erp/ui']`；`layout` `import '@my-erp/ui/styles.css'` 并去掉 body inline style；首页 `page.tsx` 按 token 重写（`wb-*` 布局 + `<Badge>`，零 inline 视觉）；加 `@my-erp/ui` workspace 依赖。
- **governance 落地**：`pnpm ui:validate`（`ui_specctl.py` 校验 tokens/contract）+ `pnpm ui:guard`（`scripts/ui-governance-guard.mjs` 扫 feature 代码禁 inline-style/hex）+ `pnpm ui:governance` 汇总，已接入 CI build job。

**决策（实现期落定）**
- 套件按**源码**经 transpilePackages 消费（不产 dist），typecheck 即 build。
- B1/token 强制 = `ui_specctl validate` + feature-code guard + `ui-feature-delivery` 技能/评审（对齐生态；生态未用 stylelint，故不引）。kit 自身的布局 inline-style 属基础设施层，不在 guard 范围（仅扫 `apps/web/{app,src}`）。
- `app-tokens.css` 保留外部 **Google Fonts `@import`** 以对齐视觉。

**遗留 TODO**
- 字体本地化（去外部 CDN @import；财务后台隐私/离线）。
- W1：`apps/web/src/lib/finance`（VM + fixtures + data-source）+ 会计 scene-config + 凭证 list/detail/form。

## 代码质量清理（W0 收尾）
- **双轨修复**：`apps/web/app` → `apps/web/src/app`（对齐生态 + W1 计划，消除 app 根 / src 双根隐患）；guard 扫描范围改 `apps/web/src`。
- **死代码（CSS）**：移除未移植教育组件的孤儿样式 `wb-insight*`、`wb-channel-banner`、`wb-sidebar__brand*`（已核验 0 引用）；语义漂移注释（assignment/student/insight/教育等）全部去除，`packages/ui` 教育词 grep = 0。
- **死依赖**：删 root `tsx`、`apps/api` 与 `finance-domain` 的 `vitest`（测试统一走根 vitest）；`apps/api` 补 `@swc/helpers` 消除 peer 告警。
- **prettier 加固**：`.prettierignore` 根锚定，排除生成/SSOT/脚手架与 vendored kit（`packages/ui/src` 保留上游风格便于 re-sync），`pnpm format` 不再误伤 `.ai`/docs/scaffold。
- 全门禁绿：typecheck / lint / ui:governance / test / build / lint-docs。

## W1 — ERP 总览 + 财务模块凭证三页（完成）

**新增了什么**（全部在 `apps/web/src`，零改动 `packages/ui`）
- **财务语义层 `lib/finance/`**：
  - `types.ts` — VM 单一事实源（`AccountVM`/`VoucherLineVM`/`VoucherVM` + 中文标签 + `voucherStatusTone` 状态→Badge tone 映射，领域语义只在此层）。
  - `money.ts` + `money.test.ts` — 前端借贷平衡用**整数分**精确计算（`toCents`/`centsToString`/`sumCents`/`isBalanced`），零浮点；镜像 `@my-erp/finance-domain` 不变式（未引该包以保持零侵入：它是 commonjs+dist，不在 web 依赖/transpile 链）。5 项单测（含 0.1+0.2 漂移）。
  - `format.ts` — `formatMoney`（千分位 2dp）/`formatPeriod`。
  - `fixtures.ts` — 12 个《小企业准则》常用科目 + 6 张凭证（各状态全覆盖；总额与 `balanced` 由分录**派生**，fixtures 永不失衡）。
  - `data-source.ts` — `listVouchers`/`getVoucher`/`listAccounts`，**唯一 demo→真切换点**（`TODO(P1–P5)` 注释 + 形状不变即可换 `@my-erp/api-client`）。
  - `scene-config.tsx` — 财务 `ShellNav`（`home`=ERP 总览；财务模块 group：记账凭证/会计科目/账簿）。
- **路由组 `app/(workbench)/`**（薄页面）：
  - `layout.tsx` — `AppShell` 外壳（注入 financeNav + 待审 badge，mock 身份）。
  - `page.tsx`（`/`）— **ERP 总览**：财务本期 StatStrip + 模块卡（财务「已上线」/采购·库存·销售·人力「敬请期待」），落实「模块化平台、财务是首个模块」。
  - `finance/vouchers/` — 列表（server→`VouchersClient`：`ListView`+`EntityTable`，工作流分段导航 制单/审核/过账/红冲 + 计数）；`[id]/` 详情（detail 模板 `wb-grid--sidebar`：分录表 + 摘要/状态/合计 card；审核/过账/红冲 演示动作 toast）；`new/` 制单（form 模板：多分录 + 科目下拉 + **前端借贷平衡校验**，不平/分录错禁止提交 + field 级错误）。
  - `finance/accounts`·`finance/ledger` — 可点空状态页（W2 占位）；`system/health` — P0a 探活页迁入（带 force-dynamic）。

**决策（实现期落定）**
- **首页升级为 ERP 整体**（用户修正）：删 `app/page.tsx`（health），`/` 改由 `(workbench)/page.tsx` 承载平台总览；财务按 `/finance/` 命名空间，为未来模块留位。
- **凭证二级导航 = 工作流动作**：用 `wb-segmented` 客户端分段（local state，按状态分桶 + 计数），而非 `SceneNav`（其 active 仅认 pathname，单页 query 无法驱动）。审核/过账/红冲 同时作为**详情页动作**（贴合「按角色组织工作流」）。
- **零浮点不引外包**：前端校验自带整数分实现，不动后端 `finance-domain` 打包。
- **tsconfig 加 `@/*`→`src/*` 别名**（Next 原生支持），lib 导入清爽。

**遗留 TODO**
- W2：科目树 + 账簿（试算平衡/总账/明细账）+ 其余角色工作台 + 待办队列。
- 随 M1 P1–P5：`data-source` 切真 `/v1`；VM 命名与 `docs/context/api` 契约对齐核对。
- （沿用 W0）字体本地化去外部 CDN @import。
