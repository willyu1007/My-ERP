'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui/feedback';
import type { AccountPreferences, BusinessPartner, Contract } from '@my-erp/api-client';
import type { AccountVM } from '@/lib/finance/types';
import { isCashAccountCode } from '@/lib/finance/account';
import { PAYMENT_DIRECTION } from '@/lib/finance/payment-display';
import { AccountPicker } from '../_components/account-picker';
import { ContractPicker } from '../_components/contract-picker';
import { PartnerPicker } from '../_components/partner-picker';
import { useAccountPreferences } from '../_components/use-account-preferences';
import { createAndSubmitPaymentAction, createPaymentAction } from './actions';
import styles from './payments.module.css';

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
type PersistMode = 'draft' | 'submit';

function PaymentSummaryEditor({
  value,
  placeholder,
  onChange,
}: {
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={styles.summaryEditor}
      onBlurCapture={(e) => {
        const nextTarget = e.relatedTarget;
        if (nextTarget instanceof Node && rootRef.current?.contains(nextTarget)) return;
        setOpen(false);
      }}
    >
      <label className={styles.headerLabel} htmlFor="payment-summary">
        摘要
      </label>
      <div className={styles.summaryControl}>
        <input
          id="payment-summary"
          className={`mt-input ${styles.headerInput}`}
          value={value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
      </div>
      {open ? (
        <textarea
          className={`mt-input ${styles.summaryPanel}`}
          tabIndex={-1}
          value={value}
          aria-label="摘要详情"
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * 新建收/付款单 (T-012 Phase 3). Forks by capability (D8): a cashier captures
 * business facts only → the doc enters 待补录 (pending_accounting) and an accountant
 * completes the subjects later; an accounting-capable caller fills subjects directly.
 */
export function PaymentCreateForm({
  accounts,
  contracts,
  partners,
  accountPreferences,
  canEnterAccounting,
  initialDate,
}: {
  readonly accounts: readonly AccountVM[];
  readonly contracts: readonly Contract[];
  readonly partners: readonly BusinessPartner[];
  readonly accountPreferences?: AccountPreferences;
  readonly canEnterAccounting: boolean;
  readonly initialDate: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [busyAction, setBusyAction] = useState<PersistMode | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [direction, setDirection] = useState<'receipt' | 'payment'>('receipt');
  const [date, setDate] = useState(initialDate);
  const [counterparty, setCounterparty] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [summary, setSummary] = useState('');
  const [amount, setAmount] = useState('');
  const [cashAccountCode, setCashAccountCode] = useState('');
  const [contraAccountCode, setContraAccountCode] = useState('');
  const [contractId, setContractId] = useState('');
  const openContracts = contracts.filter((c) => c.status !== 'closed');

  const { preferences, togglePin } = useAccountPreferences(accountPreferences);
  const postable = accounts.filter((a) => a.isLeaf && a.active);
  const cashAccounts = postable.filter((a) => isCashAccountCode(a.code));
  // The contra picker browses the subtree (branches included); only leaves select.
  const contraAccounts = accounts.filter((a) => a.active && !isCashAccountCode(a.code));
  const selectedCashAccount = cashAccounts.find((a) => a.code === cashAccountCode);
  const selectedContraAccount = contraAccounts.find((a) => a.code === contraAccountCode);

  const amountOk = AMOUNT_RE.test(amount) && Number(amount) > 0;
  const busy = pending || busyAction !== null;
  // Cashier path: business facts only; accounting subjects are filled at enrichment.
  const subjectsOk =
    !canEnterAccounting ||
    (cashAccountCode !== '' && contraAccountCode !== '' && cashAccountCode !== contraAccountCode);
  const canSubmit =
    !busy &&
    amountOk &&
    (partnerId !== '' || counterparty.trim() !== '') &&
    summary.trim() !== '' &&
    subjectsOk;
  const displayDate = date ? date.replaceAll('-', ' - ') : '选择日期';

  function openDatePicker(): void {
    dateInputRef.current?.showPicker?.();
  }

  const summaryPlaceholder = direction === 'receipt' ? '如：收回货款' : '如：支付货款';

  function persist(mode: PersistMode): void {
    setBusyAction(mode);
    start(async () => {
      try {
        const input = {
          direction,
          date,
          counterparty: counterparty.trim(),
          ...(partnerId ? { partnerId } : {}),
          summary: summary.trim(),
          amount,
          // D3: the cashier path sends no accounting subjects.
          ...(canEnterAccounting ? { cashAccountCode, contraAccountCode } : {}),
          ...(contractId ? { contractId } : {}),
        };
        const res =
          mode === 'submit'
            ? await createAndSubmitPaymentAction(input)
            : await createPaymentAction(input);
        if (res.ok && res.id) {
          const okTitle =
            mode === 'submit' ? '已提交审批' : canEnterAccounting ? '已暂存' : '已登记，待会计补录';
          toast.notify('success', okTitle, res.no ?? '');
          router.push(`/finance/payments/${res.id}`);
        } else if (!res.ok && res.reason === 'unconfigured') {
          toast.notify(
            'info',
            '演示模式',
            '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可创建）',
          );
        } else if (!res.ok) {
          toast.notify('error', mode === 'submit' ? '提交失败' : '保存失败', res.message);
        }
      } finally {
        setBusyAction(null);
      }
    });
  }

  return (
    <div className="mt-card wb-stack wb-stack--md">
      <div className={styles.paymentHeader}>
        <div className={styles.headerField}>
          <span className={styles.headerLabel}>类型</span>
          <div className={styles.seg}>
            {(['receipt', 'payment'] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.segBtn}${
                  direction === d
                    ? ` ${styles.segActive} ${
                        d === 'receipt' ? styles.segActiveReceipt : styles.segActivePayment
                      }`
                    : ''
                }`}
                onClick={() => setDirection(d)}
              >
                {PAYMENT_DIRECTION[d]}
              </button>
            ))}
          </div>
        </div>
        <span className={styles.fieldDot} aria-hidden="true" />
        <label className={`${styles.headerField} ${styles.amountField}`}>
          <span className={styles.headerLabel}>金额</span>
          <input
            className={`mt-input ${styles.headerInput}${
              amount !== '' && !amountOk ? ' mt-input--error' : ''
            }`}
            inputMode="decimal"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <span className={styles.fieldDot} aria-hidden="true" />
        <div className={styles.headerField}>
          <span className={styles.headerLabel}>业务日期</span>
          <button
            type="button"
            className={styles.dateButton}
            aria-label={`业务日期 ${displayDate}`}
            onClick={openDatePicker}
          >
            {displayDate}
          </button>
          <input
            ref={dateInputRef}
            className={styles.nativeDateInput}
            aria-hidden="true"
            tabIndex={-1}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <span className={styles.fieldDot} aria-hidden="true" />
        <PaymentSummaryEditor
          value={summary}
          placeholder={summaryPlaceholder}
          onChange={setSummary}
        />
      </div>

      <div className={styles.formGrid}>
        <div className="mt-field">
          <span className="mt-label">{direction === 'receipt' ? '付款方' : '收款方'}</span>
          <PartnerPicker
            partners={partners}
            partnerId={partnerId}
            text={counterparty}
            onSelect={(partner) => {
              setPartnerId(partner.id);
              setCounterparty(partner.name);
            }}
            onTextChange={(text) => {
              setPartnerId('');
              setCounterparty(text);
            }}
            ariaLabel={direction === 'receipt' ? '付款方' : '收款方'}
          />
        </div>
        {canEnterAccounting ? (
          <>
            <div className="mt-field">
              <span className="mt-label">
                {direction === 'receipt' ? '收款账户' : '付款账户'}（货币资金）
              </span>
              <AccountPicker
                accounts={cashAccounts}
                value={cashAccountCode}
                displayName={selectedCashAccount?.name ?? ''}
                onSelect={(account) => setCashAccountCode(account.code)}
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
                displayName={selectedContraAccount?.name ?? ''}
                onSelect={(account) => setContraAccountCode(account.code)}
                onClear={() => setContraAccountCode('')}
                ariaLabel="对方科目"
                name="contraAccountCode"
                preferences={preferences}
                onTogglePin={togglePin}
                recentKey="myerp.recentAccounts.payments"
              />
            </div>
          </>
        ) : (
          <div className="mt-field">
            <span className="mt-label">会计科目</span>
            <p className={styles.enrichHint}>由会计补录（提交后进入「待补录」）</p>
          </div>
        )}
        <div className="mt-field">
          <span className="mt-label">关联合同（可选）</span>
          <ContractPicker
            contracts={openContracts}
            value={contractId}
            onSelect={(contract) => setContractId(contract.id)}
            onClear={() => setContractId('')}
            ariaLabel="关联合同"
          />
        </div>
      </div>

      <div className={styles.actionGroup}>
        {canEnterAccounting ? (
          <>
            <button
              type="button"
              className={`mt-btn mt-btn--secondary ${styles.primaryAction}${
                canSubmit ? '' : ' mt-btn--disabled'
              }`}
              disabled={!canSubmit}
              onClick={() => persist('draft')}
            >
              {busyAction === 'draft' ? '暂存中…' : '暂存'}
            </button>
            <button
              type="button"
              className={`mt-btn mt-btn--primary ${styles.primaryAction}${
                canSubmit ? '' : ' mt-btn--disabled'
              }`}
              disabled={!canSubmit}
              onClick={() => persist('submit')}
            >
              {busyAction === 'submit' ? '提交中…' : '提交'}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`mt-btn mt-btn--primary ${styles.primaryAction}${
              canSubmit ? '' : ' mt-btn--disabled'
            }`}
            disabled={!canSubmit}
            onClick={() => persist('draft')}
          >
            {busyAction === 'draft' ? '登记中…' : '登记（转会计补录）'}
          </button>
        )}
      </div>
    </div>
  );
}
