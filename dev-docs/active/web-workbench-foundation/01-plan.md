# 01 — Plan: Web Workbench Foundation（阶段与验收）

贯穿要求：Tailwind 仅布局；视觉全走 token/contract CSS；inline `style` 仅布局；组件领域无关者入 `packages/ui`，财务语义留 `apps/web`；demo data-source 不改 VM 形状即可切真接口。

## W0 — 套件移植 + governance 落地

**做什么**
- `packages/ui` 实体化（React 组件库）：移植领域无关外壳与样式
  - 组件：`AppShell`·`Sidebar`·`TopbarSlot`·`Scene`/`SceneNav`·`ListView`·`primitives`(Section/Stat/EmptyState/Meter/Breadcrumb)·`entity-table·row·card`·`status-badge`·`menu`·`toast`·`overlay`·`tabs`·`icons`
  - 样式：`workbench.css`(wb-*) + `components.css`(mt-*) + app `tokens.css`，建在共享 `ui/tokens` 之上；经 Next `transpilePackages` 或预编译分发
  - 去 `@the-educator/*` 依赖与教育词汇；外壳保持 scenario-agnostic
- governance：`stylelint`(feature CSS 禁 color/font/spacing/radius/shadow) + eslint「Tailwind 仅布局」规则（governance.json 的 disallowed_prefixes）+ `ui/approvals` baseline；`pnpm ui:governance` 脚本；接入 CI `build` job
- 按 token 重写 `apps/web/app/page.tsx`（消除 inline 视觉），改用 `packages/ui`

**验收**
- [ ] `pnpm --filter @my-erp/web dev` 用 packages/ui 起得来；首页 token 化、零 inline 视觉
- [ ] `pnpm lint` 含 ui governance 且绿；`pnpm typecheck/build` 绿
- [ ] `packages/ui` 不含任何财务/教育领域词汇（grep 校验）

## W1 — 会计工作台 + 凭证三件套（demo 数据）

**做什么**
- `apps/web/src/app/(workbench)/`：外壳 layout（AppShell）+ 会计 `scene-config`（凭证：制单/审核/过账/红冲 二级导航）
- `apps/web/src/lib/finance/`：`types.ts`(VoucherVM/VoucherLineVM/AccountVM + 中文标签：科目类别/凭证状态) + `fixtures.ts` + `data-source.ts`（demo 实现，接口预留真 API）+ `format.ts`（金额 2dp、日期、期间）
- 页面：
  - 凭证列表 `vouchers/page.tsx` + client（`ListView` + 状态筛选：草稿/待审/已过账/已红冲）
  - 凭证详情 `vouchers/[id]/page.tsx`（detail 模板：分录表 + 摘要/状态/合计 card；借贷合计与平衡标识）
  - 制单 `vouchers/new/page.tsx`（form 模板：多分录、科目选择、借贷金额、**前端借贷平衡校验**、保存草稿）

**验收**
- [ ] 三页在 demo 数据下可用，全部走 `Scene/ListView/form` 模板与 token 样式
- [ ] 制单借贷不平时禁止提交并给出 field 级错误（前端不变式）
- [ ] 列表筛选/空状态/加载更多可用；详情与列表数据一致
- [ ] governance + typecheck + build 绿；data-source 切换点有注释与 TODO（接 P1–P5）

## 贯穿验收
- [ ] 领域无关 ↔ 财务语义边界清晰（packages/ui vs apps/web/lib/finance）
- [ ] VM 类型为单一事实源，后续切真接口仅换 data-source 实现
