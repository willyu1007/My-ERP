import { EmptyState } from '@my-erp/ui/primitives';
import {
  getBalanceSheet,
  getCashFlowStatement,
  getIncomeStatement,
} from '@/lib/finance/data-source';
import { resolveRange } from '@/lib/finance/report-range';
import { ReportRangePicker } from './report-range-picker';
import { ReportTabs } from './report-tabs';

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
      <ReportRangePicker range={range} />

      {configured ? (
        <section className="wb-section" aria-label="财务报表">
          <ReportTabs range={range} bs={bs} income={income} cashflow={cashflow} />
        </section>
      ) : (
        <EmptyState
          title="未连接后端"
          desc="设置 API_BASE_URL / API_DEV_TOKEN 后查看报表；三表由后端从账务派生。"
        />
      )}
    </div>
  );
}
