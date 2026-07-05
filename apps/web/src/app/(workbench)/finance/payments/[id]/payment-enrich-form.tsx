'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui/feedback';
import { Select } from '@my-erp/ui/primitives';
import type { CashFlowItem } from '@my-erp/api-client';
import type { AccountVM, AuxType } from '@/lib/finance/types';
import { AUX_TYPE_LABELS } from '@/lib/finance/types';
import { isCashAccountCode } from '@/lib/finance/account';
import { AccountPicker } from '../../_components/account-picker';
import { enrichPaymentAction } from '../actions';
import styles from '../payments.module.css';

/**
 * 会计补录 (T-012 Phase 3, D3/D7): the accountant completes cash/bank + contra
 * subjects, the contra line's auxiliary dimensions, and the cash-flow item on a
 * 待补录 doc. No voucher — that happens at confirm. Partner-typed aux (customer/
 * supplier) is prefilled from the doc's 往来单位; department/project are free text.
 */
export function PaymentEnrichForm({
  id,
  version,
  direction,
  partnerId,
  counterparty,
  accounts,
  cashFlowItems,
}: {
  readonly id: string;
  readonly version: number;
  readonly direction: string;
  readonly partnerId: string | null;
  readonly counterparty: string;
  readonly accounts: readonly AccountVM[];
  readonly cashFlowItems: readonly CashFlowItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [cashAccountCode, setCashAccountCode] = useState('');
  const [contraAccountCode, setContraAccountCode] = useState('');
  const [cashFlowItem, setCashFlowItem] = useState('');
  const [auxText, setAuxText] = useState<Record<string, string>>({});

  const cashAccounts = accounts.filter((a) => a.isLeaf && a.active && isCashAccountCode(a.code));
  const contraAccounts = accounts.filter((a) => a.active && !isCashAccountCode(a.code));
  const selectedCash = cashAccounts.find((a) => a.code === cashAccountCode);
  const selectedContra = contraAccounts.find((a) => a.code === contraAccountCode);

  const cfOptions = useMemo(
    () => [
      { value: '', label: '未指定' },
      ...cashFlowItems.map((i) => ({ value: i.code, label: `${i.code} ${i.name}` })),
    ],
    [cashFlowItems],
  );

  // The contra line's aux dims come from the chosen contra account's auxTypes.
  const auxTypes: readonly AuxType[] = selectedContra?.auxTypes ?? [];

  function pickContra(account: AccountVM): void {
    setContraAccountCode(account.code);
    // Auto-suggest the cash-flow item from the contra account default (T-006 M3b).
    if (!cashFlowItem && account.defaultCashFlowItem) setCashFlowItem(account.defaultCashFlowItem);
  }

  function buildContraAux(): Record<string, unknown> | undefined {
    const aux: Record<string, unknown> = {};
    for (const t of auxTypes) {
      if ((t === 'customer' || t === 'supplier') && partnerId) {
        aux[t] = { id: partnerId, name: counterparty };
      } else if (t === 'department' || t === 'project') {
        const v = auxText[t]?.trim();
        if (v) aux[t] = v;
      }
    }
    return Object.keys(aux).length > 0 ? aux : undefined;
  }

  const canSubmit =
    !pending &&
    cashAccountCode !== '' &&
    contraAccountCode !== '' &&
    cashAccountCode !== contraAccountCode;

  function submit(): void {
    start(async () => {
      const contraAux = buildContraAux();
      const res = await enrichPaymentAction(id, {
        expectedVersion: version,
        cashAccountCode,
        contraAccountCode,
        ...(contraAux ? { contraAux } : {}),
        ...(cashFlowItem ? { cashFlowItem } : {}),
      });
      if (res.ok) {
        toast.notify('success', '已补录，转审批', res.no ?? '');
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端');
      } else if (res.reason === 'conflict') {
        toast.notify('info', '单据已变化', '已被处理或版本过期，正在刷新…');
        router.refresh();
      } else {
        toast.notify('error', '补录失败', res.message);
      }
    });
  }

  return (
    <div className="mt-card wb-stack wb-stack--md">
      <h3 className="wb-card__title">会计补录</h3>
      <div className={styles.formGrid}>
        <div className="mt-field">
          <span className="mt-label">
            {direction === 'receipt' ? '收款账户' : '付款账户'}（货币资金）
          </span>
          <AccountPicker
            accounts={cashAccounts}
            value={cashAccountCode}
            displayName={selectedCash?.name ?? ''}
            onSelect={(a) => setCashAccountCode(a.code)}
            onClear={() => setCashAccountCode('')}
            ariaLabel={direction === 'receipt' ? '收款账户' : '付款账户'}
            name="cashAccountCode"
            placeholder="编码或账户名"
            emptyLabel="无匹配账户"
            variant="compact"
          />
        </div>
        <div className="mt-field">
          <span className="mt-label">对方科目</span>
          <AccountPicker
            accounts={contraAccounts}
            value={contraAccountCode}
            displayName={selectedContra?.name ?? ''}
            onSelect={pickContra}
            onClear={() => setContraAccountCode('')}
            ariaLabel="对方科目"
            name="contraAccountCode"
            recentKey="myerp.recentAccounts.enrich"
          />
        </div>
        <div className="mt-field">
          <span className="mt-label">现金流量项目（可选）</span>
          <Select
            value={cashFlowItem}
            options={cfOptions}
            onChange={setCashFlowItem}
            ariaLabel="现金流量项目"
          />
        </div>
        {auxTypes.map((t) =>
          t === 'customer' || t === 'supplier' ? (
            <div key={t} className="mt-field">
              <span className="mt-label">辅助核算 · {AUX_TYPE_LABELS[t]}</span>
              <p className={styles.enrichHint}>{counterparty || '未录入往来单位'}</p>
            </div>
          ) : (
            <label key={t} className="mt-field">
              <span className="mt-label">辅助核算 · {AUX_TYPE_LABELS[t]}（可选）</span>
              <input
                className="mt-input"
                value={auxText[t] ?? ''}
                autoComplete="off"
                placeholder={AUX_TYPE_LABELS[t]}
                onChange={(e) => setAuxText((s) => ({ ...s, [t]: e.target.value }))}
              />
            </label>
          ),
        )}
      </div>
      <div className={styles.actionGroup}>
        <button
          type="button"
          className={`mt-btn mt-btn--primary ${styles.primaryAction}${
            canSubmit ? '' : ' mt-btn--disabled'
          }`}
          disabled={!canSubmit}
          onClick={submit}
        >
          {pending ? '补录中…' : '提交补录（转审批）'}
        </button>
      </div>
    </div>
  );
}
