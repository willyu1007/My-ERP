/**
 * Maps `@my-erp/api-client` `/v1` entities → finance view-models (VM). The VM
 * shapes are the data-source seam (see `data-source.ts`); pages/components depend
 * only on the VM, so the fixture path and the real `/v1` path stay interchangeable.
 */
import type {
  Account,
  AccountLedger as ApiAccountLedger,
  TrialBalance as ApiTrialBalance,
  Voucher,
} from '@my-erp/api-client';
import { toCents } from './money';
import type { AccountLedger, BalanceDir, LedgerBalance, TrialBalance } from './ledger';
import type { AccountVM, VoucherVM } from './types';

export function accountToVM(a: Account): AccountVM {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    direction: a.direction,
    isLeaf: a.isLeaf,
    parentCode: a.parentCode ?? null,
    level: a.level,
    auxTypes: a.auxTypes,
    active: a.active,
    defaultCashFlowItem: a.defaultCashFlowItem ?? null,
  };
}

/** `/v1` trial balance → the web VM shape (accountCode/Name → code/name; balanced defaults). */
export function trialBalanceToVM(tb: ApiTrialBalance): TrialBalance {
  return {
    rows: tb.rows.map((r) => ({
      code: r.accountCode,
      name: r.accountName,
      openingDebit: r.openingDebit,
      openingCredit: r.openingCredit,
      periodDebit: r.periodDebit,
      periodCredit: r.periodCredit,
      closingDebit: r.closingDebit,
      closingCredit: r.closingCredit,
    })),
    totals: tb.totals,
    balanced: {
      opening: tb.balanced.opening ?? false,
      period: tb.balanced.period ?? false,
      closing: tb.balanced.closing ?? false,
    },
  };
}

const toBalance = (b: ApiAccountLedger['opening']): LedgerBalance => ({
  debit: b.debit ?? '',
  credit: b.credit ?? '',
  balance: b.balance ?? '',
  balanceDir: (b.balanceDir ?? '平') as BalanceDir,
});

/** `/v1` account ledger → the web VM shape. */
export function accountLedgerToVM(l: ApiAccountLedger): AccountLedger {
  return {
    account: { code: l.accountCode, name: l.accountName },
    opening: toBalance(l.opening),
    closing: toBalance(l.closing),
    rows: l.rows.map((r) => ({
      date: r.date ?? '',
      voucherNo: r.voucherNo ?? '',
      voucherId: r.voucherId ?? '',
      summary: r.summary ?? '',
      debit: r.debit ?? '',
      credit: r.credit ?? '',
      balance: r.balance ?? '',
      balanceDir: (r.balanceDir ?? '平') as BalanceDir,
    })),
  };
}

export function voucherToVM(v: Voucher): VoucherVM {
  const debitCents = toCents(v.totalDebit);
  const creditCents = toCents(v.totalCredit);
  return {
    id: v.id,
    no: v.no,
    date: v.date,
    period: v.period,
    status: v.status,
    summary: v.summary,
    lines: v.lines.map((l, i) => ({
      id: `${v.id}:${i}`,
      accountCode: l.accountCode,
      accountName: l.accountName ?? '',
      summary: l.summary,
      debit: l.debit ?? null,
      credit: l.credit ?? null,
      cashFlowItem: l.cashFlowItem ?? null,
    })),
    totalDebit: v.totalDebit,
    totalCredit: v.totalCredit,
    balanced: debitCents !== null && debitCents === creditCents,
    maker: v.maker,
    checker: v.checker ?? null,
    attachments: v.attachments ?? 0,
    contractId: v.contractId ?? null,
  };
}
