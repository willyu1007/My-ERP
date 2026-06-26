'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Section, Select, useToast } from '@my-erp/ui';
import type { CashFlowItem, UntaggedCashLine } from '@my-erp/api-client';
import { formatMoney } from '@/lib/finance/format';
import { tagCashFlowAction } from './actions';

const CF_GROUPS: readonly { readonly activity: string; readonly label: string }[] = [
  { activity: 'operating', label: '经营活动' },
  { activity: 'investing', label: '投资活动' },
  { activity: 'financing', label: '筹资活动' },
];

const rowKey = (l: UntaggedCashLine): string => `${l.voucherId}:${l.accountCode}`;
const amountOf = (l: UntaggedCashLine): string =>
  l.debit ? `借 ${formatMoney(l.debit)}` : l.credit ? `贷 ${formatMoney(l.credit)}` : '';

/**
 * Pre-close 现金流量打标 worklist (T-006 M3b). Lists the untagged non-cash lines of
 * the period's cash vouchers and tags them in place via POST /v1/cash-flow/tag —
 * the only way to fix an already-posted voucher (editing is closed). Pre-selects
 * the account's chart default; the CF statement ties out once the list is empty.
 */
export function CashFlowWorklist({
  lines,
  cashFlowItems,
  defaults,
}: {
  readonly lines: readonly UntaggedCashLine[];
  readonly cashFlowItems: readonly CashFlowItem[];
  /** accountCode → default CF item (auto-suggest source). */
  readonly defaults: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const cashFlowOptions = useMemo(
    () => [
      { value: '', label: '请选择' },
      ...CF_GROUPS.flatMap((g) =>
        cashFlowItems
          .filter((i) => i.activity === g.activity)
          .map((i) => ({ value: i.code, label: `${g.label} · ${i.name}` })),
      ),
    ],
    [cashFlowItems],
  );

  const valueFor = (l: UntaggedCashLine): string =>
    picked[rowKey(l)] ?? defaults[l.accountCode] ?? '';

  function tag(l: UntaggedCashLine): void {
    const cashFlowItem = valueFor(l);
    if (!cashFlowItem) {
      toast.notify('info', '请选择项目', '先选择一个现金流量项目再打标');
      return;
    }
    setBusyKey(rowKey(l));
    start(async () => {
      const res = await tagCashFlowAction({
        voucherId: l.voucherId,
        accountCode: l.accountCode,
        cashFlowItem,
      });
      setBusyKey(null);
      if (res.ok) {
        toast.notify('success', '已打标', `${l.voucherNo} · ${l.accountName}`);
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify(
          'info',
          '演示模式',
          '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可打标）',
        );
      } else {
        toast.notify('error', '打标失败', res.message);
      }
    });
  }

  return (
    <Section title={`现金流量打标 · 待处理 ${lines.length}`}>
      <p className="wb-muted">
        现金凭证的非现金（对方）分录需指定现金流量项目，否则现金流量表勾稽不平。已过账凭证可在此直接打标。
      </p>
      <div className="wb-table-wrap">
        <table className="wb-table">
          <thead>
            <tr>
              <th className="wb-table__th">凭证 / 日期</th>
              <th className="wb-table__th">科目</th>
              <th className="wb-table__th">摘要</th>
              <th className="wb-table__th wb-table__cell--end">金额</th>
              <th className="wb-table__th">现金流量项目</th>
              <th className="wb-table__th wb-table__cell--end">操作</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const k = rowKey(l);
              return (
                <tr key={k} className="wb-table__row">
                  <td>
                    <span className="wb-mono">{l.voucherNo}</span>
                    <span className="wb-muted"> · {l.date}</span>
                  </td>
                  <td>
                    <span className="wb-mono">{l.accountCode}</span> {l.accountName}
                  </td>
                  <td className="wb-muted">{l.summary}</td>
                  <td className="wb-table__cell--end wb-mono">{amountOf(l)}</td>
                  <td>
                    <Select
                      value={valueFor(l)}
                      ariaLabel="现金流量项目"
                      options={cashFlowOptions}
                      onChange={(value) => setPicked((p) => ({ ...p, [k]: value }))}
                    />
                  </td>
                  <td className="wb-table__cell--end">
                    <button
                      type="button"
                      className="mt-btn mt-btn--secondary mt-btn--sm"
                      disabled={pending && busyKey === k}
                      onClick={() => tag(l)}
                    >
                      {pending && busyKey === k ? '…' : '打标'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
