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
| 运行时渲染 | `next start` → `curl :3200` | ✓ 全部 200；`/` ERP 总览（模块卡：财务「已上线」+ 采购/库存/销售/人力「敬请期待」）；`/finance/vouchers` 6 张凭证 + 工作流分段导航；`/finance/vouchers/v-003` 详情（价税分离分录 + 借贷平衡）；`/finance/vouchers/new` 制单（借贷不平指示 + 保存草稿禁用）；坏 id → 404 |

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
