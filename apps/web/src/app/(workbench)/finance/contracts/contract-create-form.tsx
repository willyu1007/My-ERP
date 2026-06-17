'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui';
import { CONTRACT_TYPE } from '@/lib/finance/contract-display';
import { createContractAction } from './actions';
import styles from './contracts.module.css';

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** 新建合同 — drafts a Contract (code auto-assigned), then routes to its detail/timeline. */
export function ContractCreateForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'sales' | 'purchase' | 'service' | 'other'>('sales');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [summary, setSummary] = useState('');

  const amountOk = amount === '' || AMOUNT_RE.test(amount);
  const canSubmit = !pending && title.trim() !== '' && amountOk;

  function create(): void {
    start(async () => {
      const res = await createContractAction({
        title: title.trim(),
        type,
        counterparty: counterparty.trim(),
        amount: amount === '' ? null : amount,
        summary: summary.trim(),
      });
      if (res.ok && res.id) {
        toast.notify('success', '已创建', res.code ?? '');
        router.push(`/finance/contracts/${res.id}`);
      } else if (!res.ok && res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可创建）');
      } else if (!res.ok) {
        toast.notify('error', '创建失败', res.message);
      }
    });
  }

  return (
    <div className="mt-card wb-stack wb-stack--md">
      <h2 className="wb-card__title">新建合同</h2>
      <div className={styles.formGrid}>
        <label className="mt-field">
          <span className="mt-label">合同名称</span>
          <input className="mt-input" value={title} placeholder="如：年度供货合同" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="mt-field">
          <span className="mt-label">类型</span>
          <select
            className="mt-select"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            {Object.entries(CONTRACT_TYPE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-field">
          <span className="mt-label">对方单位</span>
          <input className="mt-input" value={counterparty} placeholder="客户 / 供应商" onChange={(e) => setCounterparty(e.target.value)} />
        </label>
        <label className="mt-field">
          <span className="mt-label">合同金额（可选）</span>
          <input
            className={`mt-input${amount !== '' && !amountOk ? ' mt-input--error' : ''}`}
            inputMode="decimal"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="mt-field">
          <span className="mt-label">摘要</span>
          <input className="mt-input" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
      </div>
      <div className="wb-row">
        <button
          type="button"
          className={`mt-btn mt-btn--primary${canSubmit ? '' : ' mt-btn--disabled'}`}
          disabled={!canSubmit}
          onClick={create}
        >
          {pending ? '创建中…' : '创建合同'}
        </button>
      </div>
    </div>
  );
}
