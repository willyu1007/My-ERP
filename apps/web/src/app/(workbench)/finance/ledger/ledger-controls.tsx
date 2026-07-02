'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatPeriod } from '@/lib/finance/format';
import type { AccountVM } from '@/lib/finance/types';
import { AccountPicker } from '../_components/account-picker';
import styles from './ledger.module.css';

type LedgerView = 'balances' | 'detail' | 'check';

function ledgerHref({
  view,
  account,
  period,
  currentPeriod,
}: {
  readonly view: LedgerView;
  readonly account?: string;
  readonly period: string;
  readonly currentPeriod: string;
}): string {
  const params = new URLSearchParams();
  if (view !== 'balances') params.set('view', view);
  if (account) params.set('account', account);
  if (period !== currentPeriod) params.set('period', period);
  const query = params.toString();
  return query ? `/finance/ledger?${query}` : '/finance/ledger';
}

export function PeriodPickerButton({
  period,
  currentPeriod,
  view,
  account,
}: {
  readonly period: string;
  readonly currentPeriod: string;
  readonly view: LedgerView;
  readonly account?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function openPicker(): void {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  }

  return (
    <span className={`mt-date-button-control ${styles.periodControl}`}>
      <button
        type="button"
        className={`mt-date-button ${styles.periodButton}`}
        aria-label={`会计期间 ${formatPeriod(period)}`}
        onClick={openPicker}
      >
        {formatPeriod(period)}
      </button>
      <input
        ref={inputRef}
        className="mt-date-button-native"
        aria-hidden="true"
        tabIndex={-1}
        type="month"
        value={period}
        onChange={(event) => {
          router.push(
            ledgerHref({
              view,
              account,
              period: event.target.value,
              currentPeriod,
            }),
          );
        }}
      />
    </span>
  );
}

export function LedgerControls({
  accounts,
  selectedAccountCode,
  view,
  period,
  currentPeriod,
}: {
  readonly accounts: readonly AccountVM[];
  readonly selectedAccountCode?: string;
  readonly view: LedgerView;
  readonly period: string;
  readonly currentPeriod: string;
}) {
  const router = useRouter();
  const selectedAccount = accounts.find((account) => account.code === selectedAccountCode);

  return (
    <div className={styles.controls}>
      <AccountPicker
        accounts={accounts}
        value={selectedAccount?.code ?? ''}
        displayName={selectedAccount?.name ?? ''}
        onSelect={(account) =>
          router.push(
            ledgerHref({
              view,
              account: account.code,
              period,
              currentPeriod,
            }),
          )
        }
        onClear={() =>
          router.push(
            ledgerHref({
              view,
              period,
              currentPeriod,
            }),
          )
        }
        ariaLabel="选择科目"
        name="account"
        placeholder="编码或名称"
        variant="compact"
        allOptionLabel="全部"
      />
    </div>
  );
}
