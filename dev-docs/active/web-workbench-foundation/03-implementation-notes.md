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
