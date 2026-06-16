import { EmptyState, Section, Tabs } from '@my-erp/ui';
import {
  getBalanceSheet,
  getCashFlowStatement,
  getIncomeStatement,
} from '@/lib/finance/data-source';
import { resolveRange } from '@/lib/finance/report-range';
import { ReportRangePicker } from './report-range-picker';
import { BalanceSheetView, CashFlowView, IncomeStatementView } from './statement-views';

export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * 财务报表 (T-006 M3c) — 资产负债表 / 利润表 / 现金流量表 over a 月/季/年/自定义 range.
 * The statements are derived server-side (post → balances → mapping + CF tags);
 * there is no fixture path, so without a backend the page shows a notice.
 */
export default async function ReportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const todayPeriod = new Date().toISOString().slice(0, 7);
  const range = resolveRange(
    {
      mode: first(sp.mode),
      p: first(sp.p),
      y: first(sp.y),
      q: first(sp.q),
      from: first(sp.from),
      to: first(sp.to),
    },
    todayPeriod,
  );

  const [bs, income, cashflow] = await Promise.all([
    getBalanceSheet(range.to),
    getIncomeStatement(range.from, range.to),
    getCashFlowStatement(range.from, range.to),
  ]);
  const configured = bs !== null && income !== null && cashflow !== null;

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <div className="wb-stack wb-stack--sm">
        <h1 className="wb-section__title">财务报表</h1>
        <p className="wb-muted">
          资产负债表 · 利润表 · 现金流量表 —— 从已过账凭证 + 现金流量打标派生。
        </p>
      </div>

      <ReportRangePicker range={range} />

      {configured ? (
        <Section title={range.label}>
          <Tabs
            items={[
              { key: 'bs', label: '资产负债表', content: <BalanceSheetView bs={bs} /> },
              { key: 'is', label: '利润表', content: <IncomeStatementView is={income} /> },
              { key: 'cf', label: '现金流量表', content: <CashFlowView cf={cashflow} /> },
            ]}
          />
        </Section>
      ) : (
        <EmptyState
          title="未连接后端"
          desc="设置 API_BASE_URL / API_DEV_TOKEN 后查看真实报表（三表由后端从账务派生，不走演示数据）。"
        />
      )}
    </div>
  );
}
