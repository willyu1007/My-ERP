import Link from 'next/link';
import { Badge, Section, Stat, StatStrip } from '@my-erp/ui';
import { listVouchers } from '@/lib/finance/data-source';
import { VOUCHER_STATUS_LABELS } from '@/lib/finance/types';

/** ERP-level overview. Finance is the first module; others are placeholders. */
interface ModuleCard {
  readonly key: string;
  readonly name: string;
  readonly desc: string;
  readonly href?: string;
  readonly active: boolean;
}

const MODULES: readonly ModuleCard[] = [
  { key: 'finance', name: '财务', desc: '会计总账 + 出纳资金。v1 首个模块。', href: '/finance/vouchers', active: true },
  { key: 'purchase', name: '采购', desc: '采购申请、订单与供应商管理。', active: false },
  { key: 'inventory', name: '库存', desc: '出入库、库存核算与盘点。', active: false },
  { key: 'sales', name: '销售', desc: '报价、订单与客户管理。', active: false },
  { key: 'hr', name: '人力', desc: '组织、人员与薪酬。', active: false },
];

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const vouchers = await listVouchers();
  const posted = vouchers.filter((v) => v.status === 'posted').length;
  const pending = vouchers.filter((v) => v.status === 'pending').length;
  const draft = vouchers.filter((v) => v.status === 'draft').length;

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <div className="wb-stack wb-stack--sm">
        <h1 className="wb-section__title">morethan · my-erp</h1>
        <p className="wb-muted">
          模块化智能 erp 平台。财务是第一个模块，后续按需扩展（采购 / 库存 / 销售 / 人力…）。
        </p>
      </div>

      <Section title="财务 · 本期概览" link={{ href: '/finance/vouchers', label: '进入财务' }}>
        <StatStrip>
          <Stat label="凭证总数" value={vouchers.length} />
          <Stat label={VOUCHER_STATUS_LABELS.posted} value={posted} />
          <Stat label={VOUCHER_STATUS_LABELS.pending} value={pending} />
          <Stat label={VOUCHER_STATUS_LABELS.draft} value={draft} />
        </StatStrip>
      </Section>

      <Section title="模块">
        <div className="wb-cardgrid">
          {MODULES.map((m) =>
            m.active && m.href ? (
              <Link key={m.key} href={m.href} className="wb-card">
                <div className="wb-card__head">
                  <h3 className="wb-card__title">{m.name}</h3>
                  <Badge tone="success">已上线</Badge>
                </div>
                <p className="wb-card__desc">{m.desc}</p>
              </Link>
            ) : (
              <div key={m.key} className="wb-card" aria-disabled="true">
                <div className="wb-card__head">
                  <h3 className="wb-card__title">{m.name}</h3>
                  <Badge tone="muted">敬请期待</Badge>
                </div>
                <p className="wb-card__desc wb-card__desc--muted">{m.desc}</p>
              </div>
            ),
          )}
        </div>
      </Section>
    </div>
  );
}
