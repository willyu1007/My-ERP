import {
  EntityRow,
  Hub,
  IconBook,
  IconClipboard,
  type WorkflowModule,
} from '@my-erp/ui';
import { listVouchers } from '@/lib/finance/data-source';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { VOUCHER_STATUS_LABELS, type VoucherVM } from '@/lib/finance/types';

function attentionFor(voucher: VoucherVM) {
  if (voucher.status === 'draft') {
    return {
      id: voucher.id,
      title: `${voucher.no} 待补全`,
      detail: `${formatDate(voucher.date)} · ${voucher.summary} · ${formatMoney(voucher.totalDebit)} CNY`,
      tone: 'warning' as const,
      href: `/finance/vouchers/${voucher.id}`,
      cta: '补全凭证',
      workflow: '凭证',
    };
  }
  if (voucher.status === 'pending') {
    return {
      id: voucher.id,
      title: `${voucher.no} 待审核`,
      detail: `${formatDate(voucher.date)} · ${voucher.summary} · ${formatMoney(voucher.totalDebit)} CNY`,
      tone: 'accent' as const,
      href: `/finance/vouchers/${voucher.id}`,
      cta: '去审核',
      workflow: '凭证',
    };
  }
  return null;
}

function financeModule(vouchers: readonly VoucherVM[]): WorkflowModule {
  const draft = vouchers.filter((v) => v.status === 'draft');
  const pending = vouchers.filter((v) => v.status === 'pending');
  const posted = vouchers.filter((v) => v.status === 'posted');
  const reversed = vouchers.filter((v) => v.status === 'reversed');
  const attention = vouchers.map(attentionFor).filter((item): item is NonNullable<typeof item> =>
    Boolean(item),
  );

  return {
    key: 'finance-vouchers',
    label: '凭证',
    accent: 'accent',
    stats: [
      { label: '待处理', value: draft.length + pending.length },
      { label: '待补全', value: draft.length },
      { label: '待审核', value: pending.length },
      { label: '本期已过账', value: posted.length },
    ],
    attention,
    highlights: [
      {
        title: '本期概览',
        link: { href: '/finance/daily-accounting', label: '进入凭证处理' },
        body: (
          <div className="wb-list wb-list--framed">
            <EntityRow
              model={{
                href: '/finance/daily-accounting',
                title: '凭证队列',
                note: '从待补全和待审核队列继续处理，不展示静态流程说明。',
                metrics: [{ label: '待处理', value: draft.length + pending.length }],
                status: { tone: 'warning', label: '待处理' },
              }}
            />
            <EntityRow
              model={{
                href: '/finance/ledger',
                title: '账簿查询',
                note: '查看本期已过账凭证形成的账簿与余额。',
                metrics: [{ label: '已过账', value: posted.length }],
                status: { tone: 'success', label: VOUCHER_STATUS_LABELS.posted },
              }}
            />
            <EntityRow
              model={{
                title: '纠错留痕',
                note: '纠错只通过作废或红冲保留痕迹，不提供物理删除入口。',
                metrics: [{ label: '已红冲', value: reversed.length }],
                status: {
                  tone: reversed.length > 0 ? 'danger' : 'muted',
                  label: VOUCHER_STATUS_LABELS.reversed,
                },
              }}
            />
          </div>
        ),
      },
    ],
    quickActions: [
      { href: '/finance/vouchers/new', label: '录入凭证', icon: <IconClipboard size={15} /> },
      { href: '/finance/ledger', label: '账簿查询', icon: <IconBook size={15} /> },
    ],
  };
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const vouchers = await listVouchers();
  return <Hub modules={[financeModule(vouchers)]} />;
}
