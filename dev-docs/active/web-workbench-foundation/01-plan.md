# 01 — Plan: Web Workbench Foundation（阶段与验收）

贯穿要求：Tailwind 仅布局；视觉全走 token/contract CSS；inline `style` 仅布局；组件领域无关者入 `packages/ui`，财务语义留 `apps/web`；demo data-source 不改 VM 形状即可切真接口。

## W0 — 套件移植 + governance 落地

**做什么**
- `packages/ui` 实体化（React 组件库）：移植领域无关外壳与样式
  - 组件：`AppShell`·`Sidebar`·`TopbarSlot`·`Scene`/`SceneNav`·`ListView`·`primitives`(Section/Stat/EmptyState/Meter/Breadcrumb)·`entity-table·row·card`·`status-badge`·`menu`·`toast`·`overlay`·`tabs`·`icons`
  - 样式：`workbench.css`(wb-*) + `components.css`(mt-*) + app `tokens.css`，建在共享 `ui/tokens` 之上；经 Next `transpilePackages` 或预编译分发
  - 去 `@the-educator/*` 依赖与教育词汇；外壳保持 scenario-agnostic
- governance：`ui_specctl validate` + feature-code guard（禁 inline 视觉与硬编码视觉值）+ `ui/approvals` baseline；`pnpm ui:governance` 脚本；接入 CI `build` job
- 按 token 重写 `apps/web/app/page.tsx`（消除 inline 视觉），改用 `packages/ui`

**验收**
- [ ] `pnpm --filter @my-erp/web dev` 用 packages/ui 起得来；首页 token 化、零 inline 视觉
- [ ] `pnpm lint` 含 ui governance 且绿；`pnpm typecheck/build` 绿
- [ ] `packages/ui` 不含任何财务/教育领域词汇（grep 校验）

## W1 — 会计工作台 + 凭证三件套（demo 数据）

**做什么**
- `apps/web/src/app/(workbench)/`：外壳 layout（AppShell）+ 财务 `scene-config`（W2c 后 sidebar 为工作流/功能/设置）
- `apps/web/src/lib/finance/`：`types.ts`(VoucherVM/VoucherLineVM/AccountVM + 中文标签：科目类别/凭证状态) + `fixtures.ts` + `data-source.ts`（demo 实现，接口预留真 API）+ `format.ts`（金额 2dp、日期、期间）
- 页面：
  - W1 初版凭证列表；W2c 后 canonical 队列入口为 `daily-accounting/page.tsx` + client（`ListView` + 状态筛选：待处理/待补全/待审核/已过账/已红冲）
  - 凭证详情 `vouchers/[id]/page.tsx`（detail 模板：分录表 + 摘要/状态/合计 card；借贷合计与平衡标识）
  - 制单 `vouchers/new/page.tsx`（historical form 模板：多分录、科目选择、借贷金额、**前端借贷平衡校验**、暂存）

**验收**
- [ ] 日常账务处理入口、凭证详情、制单在 demo 数据下可用，全部走 `ListView/detail/form` 模板与 token 样式
- [ ] 制单借贷不平时禁止提交并给出 field 级错误（前端不变式）
- [ ] 队列筛选/空状态可用；详情与队列数据一致
- [ ] governance + typecheck + build 绿；data-source 切换点有注释与 TODO（接 P1–P5）

## W2 — 科目体系 / 账簿 / 角色工作台（demo 数据，分片推进）

W1 后 `(workbench)` 外壳与 data-source seam 已就绪；W2 按片填充财务模块其余视图，全部沿用 W1 模板（Scene/分段导航/表格）与 seam。

### W2a — 会计科目体系（科目树）
**做什么**
- VM 扩展 `AccountVM`（`parentCode`/`level`/`auxTypes`/`active`）+ `AuxType` 标签；fixtures 重建为《小企业准则》多级科目表（银行存款/应交税费等含父子级）；凭证分录改挂**末级**科目。
- `/finance/accounts`：占位 → 科目树视图（按类别分段筛选 + 层级表：编码/名称含层级标识/方向/辅助核算/启停 + 概览 stats）。
- 制单科目下拉仅列**末级且启用**科目（accounting 正确性）。

**验收**
- [ ] 科目按编码=树序展示，父子层级清晰；类别分段 + 计数可用。
- [ ] 辅助核算（往来/部门/项目）标记正确；停用科目标识。
- [ ] 制单只能选末级科目；typecheck/lint/test/ui:governance/build 全绿。

### W2b — 账簿（试算平衡 + 总账/明细账）
- `/finance/ledger`：从已过账凭证派生科目余额 → 试算平衡表（借=贷校验）+ 总账/明细分类账查询。

### W2c — 财务入口工作流化
- `/finance/daily-accounting` 成为唯一日常工作流入口；`/finance/vouchers` redirect；凭证详情/录入保留为工作流内部深链。
- sidebar 后续收敛为「工作流 / 查询 / 设置」；期末结账已作为 `/finance/period-close` 工作流入口上线；科目与期初归入 `/finance/settings`。

### W2d — 角色工作台 + 待办队列
- 出纳/主管/管理员/查看者各自「待办/任务」工作台；跨角色任务流转（demo）。

## 贯穿验收
- [ ] 领域无关 ↔ 财务语义边界清晰（packages/ui vs apps/web/lib/finance）
- [ ] VM 类型为单一事实源，后续切真接口仅换 data-source 实现
