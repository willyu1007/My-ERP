/**
 * Ledger derivation — pure functions that compute account balances, the trial
 * balance, and per-account subsidiary ledgers from POSTED vouchers + opening
 * balances. Exact integer-cents math, never float (hard constraint). Pure: data
 * is passed in (no fixture import) so it stays testable and the data-source seam
 * owns the demo→real wiring. The real system computes these server-side (P4).
 */
import { centsToString, toCents } from './money';
import type { AccountVM, OpeningBalance, VoucherVM } from './types';

export type BalanceDir = '借' | '贷' | '平';

function dirOf(netDebitCents: number): BalanceDir {
  if (netDebitCents > 0) return '借';
  if (netDebitCents < 0) return '贷';
  return '平';
}

const cents = (amount: string | null): number => (amount ? (toCents(amount) ?? 0) : 0);

interface Movement {
  drCents: number;
  crCents: number;
}

function openingByCode(openings: readonly OpeningBalance[]): Map<string, Movement> {
  const map = new Map<string, Movement>();
  for (const o of openings) {
    map.set(o.accountCode, { drCents: cents(o.debit), crCents: cents(o.credit) });
  }
  return map;
}

/** Per-account debit/credit movement from POSTED vouchers only (过账更新余额). */
function postedByCode(vouchers: readonly VoucherVM[]): Map<string, Movement> {
  const map = new Map<string, Movement>();
  for (const v of vouchers) {
    if (v.status !== 'posted') continue;
    for (const l of v.lines) {
      const m = map.get(l.accountCode) ?? { drCents: 0, crCents: 0 };
      m.drCents += cents(l.debit);
      m.crCents += cents(l.credit);
      map.set(l.accountCode, m);
    }
  }
  return map;
}

/* ---------- Trial balance ---------- */

export interface TrialBalanceRow {
  readonly code: string;
  readonly name: string;
  readonly openingDebit: string;
  readonly openingCredit: string;
  readonly periodDebit: string;
  readonly periodCredit: string;
  readonly closingDebit: string;
  readonly closingCredit: string;
}

export interface TrialBalanceTotals {
  readonly openingDebit: string;
  readonly openingCredit: string;
  readonly periodDebit: string;
  readonly periodCredit: string;
  readonly closingDebit: string;
  readonly closingCredit: string;
}

export interface TrialBalance {
  readonly rows: readonly TrialBalanceRow[];
  readonly totals: TrialBalanceTotals;
  /** 借=贷 校验，分别对期初/本期/期末三栏。 */
  readonly balanced: { readonly opening: boolean; readonly period: boolean; readonly closing: boolean };
}

export function computeTrialBalance(
  accounts: readonly AccountVM[],
  vouchers: readonly VoucherVM[],
  openings: readonly OpeningBalance[],
): TrialBalance {
  const opening = openingByCode(openings);
  const period = postedByCode(vouchers);
  const nameByCode = new Map(accounts.map((a) => [a.code, a.name]));
  const codes = [...new Set([...opening.keys(), ...period.keys()])].sort((x, y) =>
    x < y ? -1 : x > y ? 1 : 0,
  );

  let tOpD = 0;
  let tOpC = 0;
  let tPeD = 0;
  let tPeC = 0;
  let tClD = 0;
  let tClC = 0;

  const rows = codes.map((code) => {
    const o = opening.get(code) ?? { drCents: 0, crCents: 0 };
    const p = period.get(code) ?? { drCents: 0, crCents: 0 };
    const netDebit = o.drCents + p.drCents - o.crCents - p.crCents;
    const closeDr = Math.max(netDebit, 0);
    const closeCr = Math.max(-netDebit, 0);

    tOpD += o.drCents;
    tOpC += o.crCents;
    tPeD += p.drCents;
    tPeC += p.crCents;
    tClD += closeDr;
    tClC += closeCr;

    return {
      code,
      name: nameByCode.get(code) ?? code,
      openingDebit: centsToString(o.drCents),
      openingCredit: centsToString(o.crCents),
      periodDebit: centsToString(p.drCents),
      periodCredit: centsToString(p.crCents),
      closingDebit: centsToString(closeDr),
      closingCredit: centsToString(closeCr),
    };
  });

  return {
    rows,
    totals: {
      openingDebit: centsToString(tOpD),
      openingCredit: centsToString(tOpC),
      periodDebit: centsToString(tPeD),
      periodCredit: centsToString(tPeC),
      closingDebit: centsToString(tClD),
      closingCredit: centsToString(tClC),
    },
    balanced: { opening: tOpD === tOpC, period: tPeD === tPeC, closing: tClD === tClC },
  };
}

/* ---------- Subsidiary (account) ledger ---------- */

export interface LedgerBalance {
  readonly debit: string;
  readonly credit: string;
  /** 余额绝对值（2dp）。 */
  readonly balance: string;
  readonly balanceDir: BalanceDir;
}

export interface LedgerRow {
  readonly date: string;
  readonly voucherNo: string;
  readonly voucherId: string;
  readonly summary: string;
  /** 借/贷方金额，空方为 ''。 */
  readonly debit: string;
  readonly credit: string;
  /** 行后累计余额绝对值（2dp）。 */
  readonly balance: string;
  readonly balanceDir: BalanceDir;
}

export interface AccountLedger {
  readonly account: AccountVM;
  readonly opening: LedgerBalance;
  readonly rows: readonly LedgerRow[];
  readonly closing: LedgerBalance;
}

export function computeAccountLedger(
  code: string,
  accounts: readonly AccountVM[],
  vouchers: readonly VoucherVM[],
  openings: readonly OpeningBalance[],
): AccountLedger | null {
  const account = accounts.find((a) => a.code === code);
  if (!account) return null;

  const o = openingByCode(openings).get(code) ?? { drCents: 0, crCents: 0 };
  let runningDebit = o.drCents - o.crCents;
  const opening: LedgerBalance = {
    debit: o.drCents ? centsToString(o.drCents) : '',
    credit: o.crCents ? centsToString(o.crCents) : '',
    balance: centsToString(Math.abs(runningDebit)),
    balanceDir: dirOf(runningDebit),
  };

  const postings = vouchers
    .filter((v) => v.status === 'posted')
    .flatMap((v) =>
      v.lines
        .filter((l) => l.accountCode === code)
        .map((l) => ({ date: v.date, voucherNo: v.no, voucherId: v.id, summary: l.summary, drCents: cents(l.debit), crCents: cents(l.credit) })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.voucherNo < b.voucherNo ? -1 : a.voucherNo > b.voucherNo ? 1 : 0));

  const rows: LedgerRow[] = postings.map((p) => {
    runningDebit += p.drCents - p.crCents;
    return {
      date: p.date,
      voucherNo: p.voucherNo,
      voucherId: p.voucherId,
      summary: p.summary,
      debit: p.drCents ? centsToString(p.drCents) : '',
      credit: p.crCents ? centsToString(p.crCents) : '',
      balance: centsToString(Math.abs(runningDebit)),
      balanceDir: dirOf(runningDebit),
    };
  });

  const closing: LedgerBalance = {
    debit: runningDebit > 0 ? centsToString(runningDebit) : '',
    credit: runningDebit < 0 ? centsToString(-runningDebit) : '',
    balance: centsToString(Math.abs(runningDebit)),
    balanceDir: dirOf(runningDebit),
  };

  return { account, opening, rows, closing };
}
