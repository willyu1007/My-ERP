import Link from 'next/link';
import { Section, StatusBadge } from '@my-erp/ui';

export const dynamic = 'force-dynamic';

const SETTINGS: readonly {
  readonly key: string;
  readonly title: string;
  readonly desc: string;
  readonly href?: string;
}[] = [
  {
    key: 'accounts',
    title: '科目与期初',
    desc: '科目体系、启用期间与期初余额。',
    href: '/finance/accounts',
  },
  {
    key: 'periods',
    title: '账套与期间',
    desc: '账套参数、会计期间与封闭规则。',
  },
  {
    key: 'cash-accounts',
    title: '资金账户',
    desc: '现金、银行账户与资金日记账来源。',
  },
  {
    key: 'approval',
    title: '审批规则',
    desc: '职责分离、多级审批与金额阈值。',
  },
];

export default function FinanceSettingsPage() {
  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <Section title="设置项">
        <div className="wb-cardgrid">
          {SETTINGS.map((item) =>
            item.href ? (
              <Link key={item.key} href={item.href} className="wb-card">
                <div className="wb-card__head">
                  <h3 className="wb-card__title">{item.title}</h3>
                  <StatusBadge tone="success" label="已可用" />
                </div>
                <p className="wb-card__desc">{item.desc}</p>
              </Link>
            ) : (
              <div key={item.key} className="wb-card" aria-disabled="true">
                <div className="wb-card__head">
                  <h3 className="wb-card__title">{item.title}</h3>
                  <StatusBadge tone="muted" label="待上线" />
                </div>
                <p className="wb-card__desc wb-card__desc--muted">{item.desc}</p>
              </div>
            ),
          )}
        </div>
      </Section>
    </div>
  );
}
