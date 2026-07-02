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
  - `data-source.ts` — API 优先的数据访问层；未配置 `API_BASE_URL`/`API_DEV_TOKEN` 时保留 fixture fallback 便于本地只读预览。
  - `scene-config.tsx` — 财务 `ShellNav` 初版（`home`=ERP 总览；后续 W2c 已调整为工作流/功能/设置）。
- **路由组 `app/(workbench)/`**（薄页面）：
  - `layout.tsx` — `AppShell` 外壳（注入 financeNav + 日常待处理 badge，mock 身份）。
  - `page.tsx`（`/`）— **ERP 总览**：财务本期 StatStrip + 模块卡（财务「已上线」/采购·库存·销售·人力「敬请期待」），落实「模块化平台、财务是首个模块」。
  - `finance/vouchers/` — W1 初版为凭证列表；W2c 后已并入 `/finance/daily-accounting`，`/finance/vouchers` 仅保留 redirect。`[id]/` 详情只渲染非草稿凭证的只读分录与元信息；草稿凭证进入快录编辑器，避免非持久化动作。`new/` 制单保留为工作流内部深链。
  - `finance/accounts`·`finance/ledger` — 可点空状态页（W2 占位）；`system/health` — P0a 探活页迁入（带 force-dynamic）。

**决策（实现期落定）**
- **首页升级为 ERP 整体**（用户修正）：删 `app/page.tsx`（health），`/` 改由 `(workbench)/page.tsx` 承载平台总览；财务按 `/finance/` 命名空间，为未来模块留位。
- **凭证二级导航 = 工作流动作**：用 `wb-segmented` 客户端分段（local state，按状态分桶 + 计数），而非 `SceneNav`（其 active 仅认 pathname，单页 query 无法驱动）。审核/过账/红冲 同时作为**详情页动作**（贴合「按角色组织工作流」）。
- **零浮点不引外包**：前端校验自带整数分实现，不动后端 `finance-domain` 打包。
- **tsconfig 加 `@/*`→`src/*` 别名**（Next 原生支持），lib 导入清爽。

**遗留 TODO**
- 随 M1 P1–P5：`data-source` 切真 `/v1`；VM 命名与 `docs/context/api` 契约对齐核对。
- （沿用 W0）字体本地化去外部 CDN @import。

## W2a — 会计科目体系（完成）

**改了什么**（全部在 `apps/web/src`）
- `lib/finance/types.ts`：`AccountVM` 扩展 `parentCode`/`level`/`auxTypes`/`active`；新增 `AuxType`（往来=客户/供应商·部门·项目）+ `AUX_TYPE_LABELS`。
- `lib/finance/fixtures.ts`：`ACCOUNTS` 重建为《小企业准则》多级科目表（`1002 银行存款`→`100201 工商银行`/`100202 建设银行`（停用）；`2221 应交税费`→`222101 应交增值税`；新增 `5001 生产成本`），经 `ACCOUNT_SEEDS` 派生；**3 条凭证分录改挂末级科目**（v-001/v-002→工商银行，v-003→应交增值税），金额不变仍借贷平衡。
- `app/(workbench)/finance/accounts/`：占位 → `page.tsx`（server, force-dynamic, `listAccounts`）+ `accounts-client.tsx`（`Scene`：类别分段 + `EntityTable` 层级表 + 概览 `StatStrip`）。层级用名称缩进（编码升序=树前序），编码列**不可排序**以守树序。
- `new-voucher-client.tsx`：科目下拉仅列**末级且启用**（`a.isLeaf && a.active`），accounting 正确性。

**决策**
- 不引树组件（kit 无）：用「编码=树序 + 名称缩进标识」呈现层级，零改 `packages/ui`、governance-safe（缩进用全角空格，非 inline-style）。
- 科目走 data-source seam（同凭证）；W2a 未做科目详情/CRUD（读视图先行）。

**遗留 TODO（W2a）**
- 科目详情页 / 增删改 / 停用末级校验（待真实 API，M1 P2）。

## W2b — 账簿（试算平衡 + 明细账）（完成）

**改了什么**（全部在 `apps/web/src`）
- `lib/finance/types.ts`：新增 `OpeningBalance`（期初余额）。
- `lib/finance/fixtures.ts`：新增 `OPENING_BALANCES`（启用期期初，借 285000 = 贷 285000，平衡）。
- `lib/finance/ledger.ts`（**纯函数，无 fixture 依赖、整数分、零浮点**）：`computeTrialBalance` + `computeAccountLedger`（仅 `status==='posted'` 计入；期末余额按净额符号定借/贷，不依赖声明方向）；导出派生 VM 类型。
- `lib/finance/ledger.test.ts`：5 项（三栏借=贷、totals 数值、非过账排除、工商银行运行余额 698800、未知科目返回 null）。
- `lib/finance/data-source.ts`：新增 `getTrialBalance()` / `getAccountLedger(code)`（seam：本地派生 → 后续后端 P4 同形状）。
- `app/(workbench)/finance/ledger/`：`page.tsx`（server, force-dynamic）= 试算平衡表（期初/本期/期末三栏 + 合计行 + 三栏平衡 Badge + stats；科目 → 明细账）；`[code]/page.tsx` = 科目明细账（期初/逐笔运行余额/期末，凭证号回链 voucher 详情）。

**决策**
- 账簿报表为**派生数据**，computation 留在纯 `ledger.ts`，由 data-source 包装暴露——切真接口时改为后端计算、前端只取（与凭证/科目同一 seam 纪律）。
- 试算平衡表/明细账为 server 组件（纯展示 + Link 钻取），无需 client。
- 期末余额按净额符号判借/贷（声明 direction 仅信息性），符合复式记账。

**遗留 TODO（W2b）**
- 期间筛选 / 总账（汇总账）视图 / 导出；期初建账录入（M1 P5）。

## 采用公共 web-workbench 包（替换 forked kit）— 2026-06-11

**背景**：`packages/ui` 原是 morethan workbench kit 的**仓内分叉**；改为消费官方公共包 `@willyu1007/web-workbench`（My-Workflow-Base，发布于 GitHub Packages），消除分叉。

**Phase A · 升级 Next15/React19**（公共包 peer `>=15/>=19`）
- `apps/web` + `packages/ui` deps 升级到 Next15/React19（+@types 19）。
- 修 Next 15 async `params`：`ledger/[code]`、`vouchers/[id]` 改 `await params`。
- eslint ignore `**/next-env.d.ts`（Next15 生成三斜线引用）。
- 现有 app（仍用旧 kit）在 15/19 上 typecheck/build/render 全绿——隔离升级风险与换包风险。

**Phase B · 换包**
- `.npmrc` 加 `@willyu1007:registry=https://npm.pkg.github.com`（auth 在全局 `~/.npmrc`）；`apps/web` + `packages/ui` 加 `@willyu1007/web-workbench@^0.1.0`。
- `packages/ui` **瘦身为 host chrome + facade**：删被公共包覆盖的 kit（scene/list-view/entity-*/table-cells/primitives/menu/tabs/icons/topbar-slot + model{card,table,row} + 全部 styles）；留宿主 chrome（app-shell/sidebar/sidebar-create/account-menu/breadcrumb-context/toast/overlay/copy-field/badge + model nav）；`index.ts` = `export * from '@willyu1007/web-workbench'` + chrome（单一 `@my-erp/ui` 导入面，`apps/web` 0 组件改动）。
- chrome 的 `icons`/`topbar-slot`/`CardTone` import 改自公共包——**关键集成点**：`AppShell` 用公共包的 `TopbarSlotContext`，`ListView` 顶栏筛选 portal 才能落进 AppShell 的 slot。
- `apps/web` 唯一改动：layout 样式 import → `@willyu1007/web-workbench/styles/index.css`。`transpilePackages:['@my-erp/ui']` 保留（facade 是源码）；公共包 ships dist，正常依赖。

**决策**
- **部分替换**：公共包「lock the chrome, vary the content」——app shell/toast/overlay/breadcrumb-context 不在包内，留宿主；`packages/ui` = chrome + facade，不消失。
- **保 facade**：`apps/web` 仍 `from '@my-erp/ui'`，最小改动；host `Badge`(children) 与公共包 `StatusBadge`(label) 并存。

**收尾清理（2026-06-11）**
- **CI registry auth**：`ci.yml` build job 加 `permissions: packages:read` + install 前写 `.npmrc` authToken（`secrets.PACKAGES_TOKEN || GITHUB_TOKEN`）。
- **修复 RLS 集成测试隔离**：7 个 `*.integration.test.ts` 并行争用全局 role `myerp_rls_app`（`IF NOT EXISTS … CREATE ROLE` 非原子，TOCTOU 竞态）→ 改 `CREATE ROLE … EXCEPTION WHEN duplicate_object THEN NULL`（并发安全）。全量 `pnpm test` 78 passed（含 7 集成）。
- **双轨/漂移清理**：① host `Badge`(children) 与公共包 `StatusBadge`(label) 双轨 → 迁移 8 处 `<Badge>`→`<StatusBadge>`、删 `packages/ui/badge.tsx`、`BadgeTone`→`CardTone`（单一 badge 源）；② `.prettierignore` 的 `/packages/ui/src` vendored-kit 忽略过时（kit 已外移）→ 取消并 `pnpm format` 规范化 chrome + 既有格式漂移（apps/api 等，纯格式）；③ 删 `packages/ui` 过时 `sideEffects:["*.css"]`（无 CSS）。

**收尾发现（已处理，commit `8709eb2`）**
- 7 个集成测试重复的 harness（psql/PORT/pgAvailable/migrationSql/role，~25 行×7）→ 已抽 `packages/db/src/test-pg.ts`（`createTestDb`/`dropTestDb`/`appDbUrl`/`ensureAppRole`），去冗余 net −184 行；7 文件统一 import。
- 集成测试 `PORT` 硬编码 → 改读 `TEST_PG_PORT ?? 5432`（可移植）。全量 `pnpm test` 78 passed。

## W2c — 财务入口工作流化（完成）

**改了什么**
- `ShellNav` 早期增加 `soon` 支持；后续导航已收敛为工作流/查询/设置，`期末结账` 已上线为可进入工作流。
- 财务 sidebar 从资源入口改为后续收敛后的「工作流 / 查询 / 设置」：
  - 工作流：`凭证处理` / `出纳收付` / `期末结账`。
  - 查询：`账簿查询` / `财务报表` / `合同台账`。
  - 设置：`账务设置`（包含科目与期初等设置类操作）。
- 新增 `/finance/daily-accounting` 作为唯一日常工作流入口；`/finance/vouchers` redirect 到该入口，凭证详情/录入保留为内部深链。
- 新增 `/finance/settings` 聚合设置页；`/finance/accounts` 保留为设置内部页面，不再作为 sidebar 一级入口。
- 首页财务入口、凭证录入取消按钮、凭证/账簿 breadcrumb 改到工作流/功能语义。
- 删除旧 `VouchersClient` 资源列表组件，避免 `/finance/vouchers` redirect 后仍遗留第二套凭证队列 UI。
- 日常账务处理队列金额排序复用 `toCents` 整数分，避免 UI 排序路径引入浮点金额。

**决策**
- `日常记账` 与 `资金收付` 不拆成两个一级工作流；资金收付后续作为日常账务处理里的资金来源/任务泳道。
- `账务核对` 不作为工作流入口；v1 先以账簿查询/试算平衡承载，未来银行对账具备状态流转后可单独建工作流。
- 建账、科目、期初、资金账户、审批规则归入设置类入口，不与日常工作流平级。
