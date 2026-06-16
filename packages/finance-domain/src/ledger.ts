import Decimal from 'decimal.js';

/**
 * Ledger derivation — trial balance + per-account ledger computed from POSTED
 * voucher lines (+ opening balances). Pure + exact (Decimal, never float). The
 * balances are derived, not materialized, so concurrent posting can never leave
 * a balance table inconsistent (P3 D1). Mirrors the web demo's ledger logic on
 * real data.
 */

export interface PostedLine {
  readonly accountCode: string;
  readonly accountName: string;
  readonly debit: string | null;
  readonly credit: string | null;
  readonly voucherId: string;
  readonly voucherNo: string;
  readonly date: string;
  readonly summary: string;
  /** 现金流量项目 code (T-006 M3b) — tagged on the non-cash lines of cash vouchers. */
  readonly cashFlowItem?: string | null;
}

export interface OpeningLine {
  readonly accountCode: string;
  readonly accountName: string;
  readonly debit: string | null;
  readonly credit: string | null;
}

export type BalanceDir = '借' | '贷' | '平';

const dec = (value: string | null | undefined): Decimal =>
  new Decimal(value && value !== '' ? value : 0);
const dirOf = (netDebit: Decimal): BalanceDir =>
  netDebit.isZero() ? '平' : netDebit.isPositive() ? '借' : '贷';
const blankZero = (d: Decimal): string => (d.isZero() ? '' : d.toFixed(2));

/* ---------- Trial balance ---------- */

export interface TrialBalanceRow {
  readonly accountCode: string;
  readonly accountName: string;
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
  readonly balanced: {
    readonly opening: boolean;
    readonly period: boolean;
    readonly closing: boolean;
  };
}

interface Acc {
  name: string;
  openingDr: Decimal;
  openingCr: Decimal;
  periodDr: Decimal;
  periodCr: Decimal;
}

export function computeTrialBalance(
  entries: readonly PostedLine[],
  openings: readonly OpeningLine[],
): TrialBalance {
  const map = new Map<string, Acc>();
  const acc = (code: string, name: string): Acc => {
    let a = map.get(code);
    if (!a) {
      a = {
        name,
        openingDr: new Decimal(0),
        openingCr: new Decimal(0),
        periodDr: new Decimal(0),
        periodCr: new Decimal(0),
      };
      map.set(code, a);
    } else if (!a.name) {
      a.name = name;
    }
    return a;
  };
  for (const o of openings) {
    const a = acc(o.accountCode, o.accountName);
    a.openingDr = a.openingDr.plus(dec(o.debit));
    a.openingCr = a.openingCr.plus(dec(o.credit));
  }
  for (const e of entries) {
    const a = acc(e.accountCode, e.accountName);
    a.periodDr = a.periodDr.plus(dec(e.debit));
    a.periodCr = a.periodCr.plus(dec(e.credit));
  }

  let tOpD = new Decimal(0);
  let tOpC = new Decimal(0);
  let tPeD = new Decimal(0);
  let tPeC = new Decimal(0);
  let tClD = new Decimal(0);
  let tClC = new Decimal(0);

  const rows = [...map.keys()]
    .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
    .map((code) => {
      const a = map.get(code) as Acc;
      const netDr = a.openingDr.plus(a.periodDr).minus(a.openingCr).minus(a.periodCr);
      const closeDr = Decimal.max(netDr, 0);
      const closeCr = Decimal.max(netDr.neg(), 0);
      tOpD = tOpD.plus(a.openingDr);
      tOpC = tOpC.plus(a.openingCr);
      tPeD = tPeD.plus(a.periodDr);
      tPeC = tPeC.plus(a.periodCr);
      tClD = tClD.plus(closeDr);
      tClC = tClC.plus(closeCr);
      return {
        accountCode: code,
        accountName: a.name,
        openingDebit: a.openingDr.toFixed(2),
        openingCredit: a.openingCr.toFixed(2),
        periodDebit: a.periodDr.toFixed(2),
        periodCredit: a.periodCr.toFixed(2),
        closingDebit: closeDr.toFixed(2),
        closingCredit: closeCr.toFixed(2),
      };
    });

  return {
    rows,
    totals: {
      openingDebit: tOpD.toFixed(2),
      openingCredit: tOpC.toFixed(2),
      periodDebit: tPeD.toFixed(2),
      periodCredit: tPeC.toFixed(2),
      closingDebit: tClD.toFixed(2),
      closingCredit: tClC.toFixed(2),
    },
    balanced: { opening: tOpD.equals(tOpC), period: tPeD.equals(tPeC), closing: tClD.equals(tClC) },
  };
}

/* ---------- Subsidiary (account) ledger ---------- */

export interface LedgerBalance {
  readonly debit: string;
  readonly credit: string;
  readonly balance: string;
  readonly balanceDir: BalanceDir;
}

export interface LedgerRow {
  readonly date: string;
  readonly voucherNo: string;
  readonly voucherId: string;
  readonly summary: string;
  readonly debit: string;
  readonly credit: string;
  readonly balance: string;
  readonly balanceDir: BalanceDir;
}

export interface AccountLedger {
  readonly accountCode: string;
  readonly accountName: string;
  readonly opening: LedgerBalance;
  readonly rows: readonly LedgerRow[];
  readonly closing: LedgerBalance;
}

export function computeAccountLedger(
  accountCode: string,
  entries: readonly PostedLine[],
  openings: readonly OpeningLine[],
): AccountLedger {
  const o = openings.find((x) => x.accountCode === accountCode);
  const openingDr = dec(o?.debit);
  const openingCr = dec(o?.credit);
  let running = openingDr.minus(openingCr);
  const opening: LedgerBalance = {
    debit: blankZero(openingDr),
    credit: blankZero(openingCr),
    balance: running.abs().toFixed(2),
    balanceDir: dirOf(running),
  };

  const lines = entries
    .filter((e) => e.accountCode === accountCode)
    .sort((a, b) =>
      a.date < b.date
        ? -1
        : a.date > b.date
          ? 1
          : a.voucherNo < b.voucherNo
            ? -1
            : a.voucherNo > b.voucherNo
              ? 1
              : 0,
    );
  const accountName = lines[0]?.accountName ?? o?.accountName ?? accountCode;

  const rows = lines.map((l) => {
    running = running.plus(dec(l.debit)).minus(dec(l.credit));
    return {
      date: l.date,
      voucherNo: l.voucherNo,
      voucherId: l.voucherId,
      summary: l.summary,
      debit: blankZero(dec(l.debit)),
      credit: blankZero(dec(l.credit)),
      balance: running.abs().toFixed(2),
      balanceDir: dirOf(running),
    };
  });

  const closing: LedgerBalance = {
    debit: running.isPositive() && !running.isZero() ? running.toFixed(2) : '',
    credit: running.isNegative() ? running.neg().toFixed(2) : '',
    balance: running.abs().toFixed(2),
    balanceDir: dirOf(running),
  };

  return { accountCode, accountName, opening, rows, closing };
}
