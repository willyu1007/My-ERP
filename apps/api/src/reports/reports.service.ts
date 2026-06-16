import { BadRequestException, Injectable } from '@nestjs/common';
import {
  getOpeningBalancesTx,
  getPostedEntriesTx,
  listAccountsTx,
  listCashFlowItemsTx,
  withLedgerScope,
  type AccountEntity,
} from '@my-erp/db';
import { balanceSheet, cashFlowStatement, incomeStatement } from '@my-erp/finance-domain';
import type { Identity } from '@my-erp/platform';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function assertDate(value: string | undefined, name: string): string {
  if (!value || !DATE_RE.test(value)) throw new BadRequestException(`${name} must be YYYY-MM-DD`);
  return value;
}
function categoryOf(accounts: readonly AccountEntity[]): (code: string) => string {
  const m = new Map(accounts.map((a) => [a.code, a.category]));
  return (code) => m.get(code) ?? 'asset';
}

@Injectable()
export class ReportsService {
  /** Balance sheet as-of `to`. */
  async balanceSheet(_identity: Identity, ledgerBookId: string, to?: string) {
    const asOf = assertDate(to, 'to');
    return withLedgerScope(ledgerBookId, async (tx) =>
      balanceSheet(
        await getPostedEntriesTx(tx),
        await getOpeningBalancesTx(tx),
        categoryOf(await listAccountsTx(tx)),
        asOf,
      ),
    );
  }

  /** Income statement over [from, to]. */
  async incomeStatement(_identity: Identity, ledgerBookId: string, from?: string, to?: string) {
    const f = assertDate(from, 'from');
    const t = assertDate(to, 'to');
    return withLedgerScope(ledgerBookId, async (tx) =>
      incomeStatement(await getPostedEntriesTx(tx), categoryOf(await listAccountsTx(tx)), f, t),
    );
  }

  /** Direct-method cash flow statement over [from, to]. */
  async cashFlow(_identity: Identity, ledgerBookId: string, from?: string, to?: string) {
    const f = assertDate(from, 'from');
    const t = assertDate(to, 'to');
    return withLedgerScope(ledgerBookId, async (tx) => {
      const items = (await listCashFlowItemsTx(tx)).map((i) => ({
        code: i.code,
        name: i.name,
        activity: i.activity,
        direction: i.direction,
      }));
      return cashFlowStatement(await getPostedEntriesTx(tx), items, f, t);
    });
  }
}
