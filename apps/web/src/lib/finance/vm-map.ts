/**
 * Maps `@my-erp/api-client` `/v1` entities → finance view-models (VM). The VM
 * shapes are the data-source seam (see `data-source.ts`); pages/components depend
 * only on the VM, so the fixture path and the real `/v1` path stay interchangeable.
 */
import type { Account, Voucher } from '@my-erp/api-client';
import { toCents } from './money';
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
