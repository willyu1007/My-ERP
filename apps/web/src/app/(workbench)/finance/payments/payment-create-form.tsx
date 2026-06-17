'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui';
import type { Contract } from '@my-erp/api-client';
import type { AccountVM } from '@/lib/finance/types';
import { PAYMENT_DIRECTION } from '@/lib/finance/payment-display';
import { createPaymentAction } from './actions';
import styles from './payments.module.css';

const isCash = (code: string): boolean =>
  code.startsWith('1001') || code.startsWith('1002') || code.startsWith('1012');
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** 新建收/付款单 — drafts a PaymentDoc, then routes to its detail for submit/approve/confirm. */
export function PaymentCreateForm({
  accounts,
  contracts,
  initialDate,
}: {
  readonly accounts: readonly AccountVM[];
  readonly contracts: readonly Contract[];
  readonly initialDate: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [direction, setDirection] = useState<'receipt' | 'payment'>('receipt');
  const [date, setDate] = useState(initialDate);
  const [counterparty, setCounterparty] = useState('');
  const [summary, setSummary] = useState('');
  const [amount, setAmount] = useState('');
  const [cashAccountCode, setCashAccountCode] = useState('');
  const [contraAccountCode, setContraAccountCode] = useState('');
  const [contractId, setContractId] = useState('');
  const openContracts = contracts.filter((c) => c.status !== 'closed');

  const postable = accounts.filter((a) => a.isLeaf && a.active);
  const cashAccounts = postable.filter((a) => isCash(a.code));
  const contraAccounts = postable.filter((a) => !isCash(a.code));

  const amountOk = AMOUNT_RE.test(amount) && Number(amount) > 0;
  const canSubmit =
    !pending &&
    amountOk &&
    counterparty.trim() !== '' &&
    summary.trim() !== '' &&
    cashAccountCode !== '' &&
    contraAccountCode !== '' &&
    cashAccountCode !== contraAccountCode;

  function create(): void {
    start(async () => {
      const res = await createPaymentAction({
        direction,
        date,
        counterparty: counterparty.trim(),
        summary: summary.trim(),
        amount,
        cashAccountCode,
        contraAccountCode,
        ...(contractId ? { contractId } : {}),
      });
      if (res.ok && res.id) {
        toast.notify('success', '已创建', res.no ?? '');
        router.push(`/finance/payments/${res.id}`);
      } else if (!res.ok && res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可创建）');
      } else if (!res.ok) {
        toast.notify('error', '创建失败', res.message);
      }
    });
  }

  return (
    <div className="mt-card wb-stack wb-stack--md">
      <div className="wb-row wb-row--wrap">
        <h2 className="wb-card__title">新建收付款单</h2>
        <div className={styles.seg}>
          {(['receipt', 'payment'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`${styles.segBtn} ${direction === d ? styles.segActive : ''}`}
              onClick={() => setDirection(d)}
            >
              {PAYMENT_DIRECTION[d]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.formGrid}>
        <label className="mt-field">
          <span className="mt-label">日期</span>
          <input className="mt-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="mt-field">
          <span className="mt-label">{direction === 'receipt' ? '付款方' : '收款方'}</span>
          <input
            className="mt-input"
            value={counterparty}
            placeholder="对方单位 / 个人"
            onChange={(e) => setCounterparty(e.target.value)}
          />
        </label>
        <label className="mt-field">
          <span className="mt-label">金额</span>
          <input
            className={`mt-input${amount !== '' && !amountOk ? ' mt-input--error' : ''}`}
            inputMode="decimal"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="mt-field">
          <span className="mt-label">{direction === 'receipt' ? '收款账户' : '付款账户'}（货币资金）</span>
          <select className="mt-select" value={cashAccountCode} onChange={(e) => setCashAccountCode(e.target.value)}>
            <option value="">选择账户</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-field">
          <span className="mt-label">对方科目</span>
          <select
            className="mt-select"
            value={contraAccountCode}
            onChange={(e) => setContraAccountCode(e.target.value)}
          >
            <option value="">选择科目</option>
            {contraAccounts.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-field">
          <span className="mt-label">摘要</span>
          <input
            className="mt-input"
            value={summary}
            placeholder={direction === 'receipt' ? '如：收回货款' : '如：支付货款'}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <label className="mt-field">
          <span className="mt-label">关联合同（可选）</span>
          <select className="mt-select" value={contractId} onChange={(e) => setContractId(e.target.value)}>
            <option value="">不关联</option>
            {openContracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="wb-row">
        <button
          type="button"
          className={`mt-btn mt-btn--primary${canSubmit ? '' : ' mt-btn--disabled'}`}
          disabled={!canSubmit}
          onClick={create}
        >
          {pending ? '创建中…' : '创建草稿'}
        </button>
      </div>
    </div>
  );
}
