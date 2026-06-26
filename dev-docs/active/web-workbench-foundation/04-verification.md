# 04 — Verification: Web Workbench Foundation

## W0 — 2026-06-09（根目录执行）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 套件类型检查 | `pnpm --filter @my-erp/ui typecheck` | ✓ 端口 kit 零类型错误 |
| 全量类型检查 | `pnpm typecheck` | ✓ 全部项目通过（含 packages/ui、apps/web）|
| Lint | `pnpm lint` | ✓ 无告警 |
| UI governance | `pnpm ui:governance` | ✓ validate OK + guard OK（feature 代码 token-only）|
| 单测 | `pnpm test` | ✓ 5 passed |
| 全量构建 | `pnpm build` | ✓ 全包 + `next build`（`/` 14.7kB）|
| 运行时渲染 | `next start` → `curl :3200` | ✓ HTTP 200；`<Badge>` 渲染为 `mt-badge--danger`（api 未起→fallback）；`wb-*` 布局；morethan 样式表已加载 |

注：CI 新增 `UI governance` 步骤（在 Lint 与 Typecheck 之间）。GitHub「绿」仍需先提交 `pnpm-lock.yaml`。

## W1 — 2026-06-09（根目录执行）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 全量类型检查 | `pnpm -r typecheck` | ✓ 9/9 项目通过（含 apps/web 新增 `@/` 别名）|
| 单测 | `pnpm test` | ✓ 10 passed（新增 `money.test.ts` 5 项：整数分/借贷平衡/0.1+0.2 无浮点漂移）|
| Lint | `pnpm lint` | ✓ 无告警 |
| UI governance | `pnpm ui:governance` | ✓ validate OK + guard OK（19 feature 文件 token-only，零 inline-style/hex）|
| 全量构建 | `pnpm build` | ✓ 全包 + `next build`；8 路由（`/`·accounts·ledger 静态，vouchers 三页 + health 为 `ƒ` force-dynamic）|
| 运行时渲染 | `next start` → `curl :3200` | ✓ W1 当时全部 200；`/` ERP 总览（模块卡：财务「已上线」+ 采购/库存/销售/人力「敬请期待」）；凭证队列、`/finance/vouchers/v-003` 详情（价税分离分录 + 借贷平衡）、historical `/finance/vouchers/new` 制单（借贷不平指示 + 暂存禁用）；坏 id → 404。W2c 后凭证队列 canonical 路由为 `/finance/daily-accounting`，`/finance/vouchers` 仅 redirect。 |

要点：领域无关 ↔ 财务语义边界守住（`packages/ui` 零财务词汇；VM/标签/fixtures/data-source 全在 `apps/web/src/lib/finance`）；前端借贷平衡用整数分精确计算（零浮点，镜像 `@my-erp/finance-domain` 的 `isBalanced`，服务层不变式留待 M1 P3）；data-source 为唯一 demo→真切换点（`TODO(P1–P5)` 注释在位）。

### W1 代码自审复核 — 2026-06-10

审查后修复 4 处并重验全绿：① overview + (workbench)/layout 直接 import fixtures **绕过 data-source seam** → 改走 `listVouchers()`（overview 转 force-dynamic）；② 草稿详情误导的「编辑」链到空白 `/new` → 移除；③ 空表单余额提示「借贷不平·差额 0.00」→ 中性态「尚未录入金额」；④ 摘要「请填写摘要」首屏即红（过早校验）→ 改 onBlur touched 后提示。重验：`typecheck`(9/9)·`test`(10)·`lint`·`ui:governance`(19 token-only)·`build`(8 路由，`/` 转 `ƒ`) 全绿；`next start` 复核：草稿详情无「编辑」、制单空表单显示「尚未录入金额」、overview 经 data-source 渲染、各路由 200。

## W2a — 会计科目体系 — 2026-06-10

| 验证项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `pnpm -r typecheck` | ✓ 9/9（AccountVM 扩展字段 + fixtures 派生）|
| 单测 | `pnpm test` | ✓ 10 passed（凭证分录改挂末级后仍平衡，未触动 money 单测）|
| Lint / governance | `pnpm lint` · `pnpm ui:governance` | ✓ 无告警；guard 20 feature 文件 token-only |
| 构建 | `pnpm build` | ✓ `/finance/accounts` 由静态占位转 `ƒ`（1.59 kB）|
| 运行时 | `next start` → `curl :3200` | ✓ 科目树渲染（银行存款▸工商/建设银行（停用）、应交增值税、生产成本、客户/部门 aux、科目总数/末级 stats）；`v-001` 改挂工商银行仍「借贷平衡」；accounts/vouchers/new 均 200 |

要点：层级表以「编码=树序 + 名称缩进」呈现，编码列不可排序以守树序；制单下拉仅末级且启用科目；科目读取走 data-source seam。

## W2b — 账簿（试算平衡 + 明细账）— 2026-06-10

| 验证项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `pnpm --filter @my-erp/web typecheck` | ✓ 通过 |
| 单测 | `pnpm test` | ✓ 15 passed（新增 `ledger.test.ts` 5 项：三栏借=贷、totals、非过账排除、运行余额、未知科目）|
| Lint / governance | `pnpm lint` · `node scripts/ui-governance-guard.mjs` | ✓ 无告警；guard 23 feature 文件 token-only |
| 构建 | `pnpm --filter @my-erp/web build` | ✓ `/finance/ledger` 与 `/finance/ledger/[code]` 均 `ƒ` |
| 运行时 | `next start` → `curl :3200` | ✓ 试算平衡表渲染（工商银行/实收资本/管理费用，合计 785,000.00）；`/finance/ledger/100201` 明细账（期初/期末、运行余额 698,800.00、凭证号回链）；账簿各路由 200；坏科目码 → 404 |

要点：账簿报表为派生数据，computation 在纯 `ledger.ts`（整数分、无浮点），经 data-source seam 暴露；期末余额按净额符号定借/贷。

## 采用公共 web-workbench 包 — 2026-06-11

| 验证项 | 命令 | 结果 |
|---|---|---|
| 包可解析 | `npm view @willyu1007/web-workbench version` | ✓ 0.1.0（GitHub Packages，~/.npmrc auth）|
| Phase A 类型检查 | `pnpm typecheck` | ✓ 全绿（Next15/React19；修 async params）|
| Phase A 构建/渲染 | `next build` + `next start` | ✓ 8 路由 build；`/`·vouchers·ledger/[code]·vouchers/[id] 全 200 |
| Phase B 类型检查 | `pnpm typecheck` | ✓ 全绿（packages/ui chrome→包；apps/web facade→包）|
| Phase B 构建 | `pnpm build` | ✓ 全包 + `next build` 8 路由 |
| Lint / governance | `pnpm lint` · `pnpm ui:governance` | ✓ 无告警；feature 代码 token-only |
| 单测 | `vitest run --exclude '**/*.integration.test.ts'` | ✓ 51 passed |
| 渲染集成 | `next start` → curl | ✓ 各路由 200；My-ERP `AppShell`（wb-shell/sidebar/topbar）包裹**公共包**组件（wb-scene/wb-table/wb-segmented/mt-badge）；包样式表加载 |

注：ListView 顶栏筛选为 `createPortal`（客户端），SSR HTML 中不出现属预期；共享 `TopbarSlotContext` 接线类型正确。db RLS 集成测试（6 文件）因测试隔离（残留 role）失败，与本次无关。

## W2c — 财务入口工作流化 — 2026-06-12

| 验证项 | 命令 | 结果 |
|---|---|---|
| UI 类型检查 | `pnpm --filter @my-erp/ui typecheck` | ✓ 通过 |
| Web 类型检查 | `pnpm --filter @my-erp/web typecheck` | ✓ 通过 |
| Web 构建 | `pnpm --filter @my-erp/web build` | ✓ 新增 `/finance/daily-accounting` 与 `/finance/settings`；`/finance/vouchers` 为动态 redirect（121 B，无旧列表 bundle） |
| Lint | `pnpm lint` | ✓ 通过；清理后无 unused import |
| UI governance | `pnpm ui:governance` | ✓ validate OK + guard OK（25 feature files token-only；旧 `VouchersClient` 删除后减少 1 个 feature file）|
| 公共 UI suite | `node .ai/tests/run.mjs --suite ui` | ✗ 仓库缺 `.ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py`，suite 在 ui-governance-gate 启动前失败；最新证据 `.ai/.tmp/tests/ui/20260612-022512-74787b`；本轮可用 gate 已由 `pnpm ui:governance` 覆盖 |
| 路由 | `curl :3200` | ✓ `/`、`/finance/daily-accounting`、`/finance/vouchers/new`、`/finance/vouchers/v-003`、`/finance/ledger`、`/finance/ledger/100201`、`/finance/accounts`、`/finance/settings` 均 200；`/finance/vouchers` 307 → `/finance/daily-accounting` |
| 视觉 | Browser + Playwright | ✓ 桌面与移动 drawer 只显示「财务工作流 / 财务功能 / 财务设置」；`期末结账` 显示 `待上线`；不再出现「记账凭证 / 会计科目 / 账簿」同级入口 |
| 本地服务 | `env ... pnpm dev` | ✓ Web `:3200` 与 API `:8000` 已启动；API `/health` 为 `degraded`（当前未启 `localhost:5433` 开发库） |

要点：本轮只改变 Web 信息架构与 demo 页面表达；后端 API、Prisma schema、财务状态机均未变更。清理复查已删除旧资源列表双轨，金额排序不使用浮点。
