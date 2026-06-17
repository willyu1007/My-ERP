import { BadRequestException, Injectable } from '@nestjs/common';
import {
  getOpeningBalancesTx,
  getPostedEntriesTx,
  getVoucherTx,
  listAccountsTx,
  listCashFlowItemsTx,
  listPeriodClosesTx,
  withLedgerScope,
  type AccountEntity,
  type TxClient,
} from '@my-erp/db';
import { balanceSheet, cashFlowStatement, incomeStatement } from '@my-erp/finance-domain';
import type { Identity } from '@my-erp/platform';
import { DATE_RE } from '../common/parse-date';

function assertDate(value: string | undefined, name: string): string {
  if (!value || !DATE_RE.test(value)) throw new BadRequestException(`${name} must be a valid YYYY-MM-DD date`);
  return value;
}
function categoryOf(accounts: readonly AccountEntity[]): (code: string) => string {
  const m = new Map(accounts.map((a) => [a.code, a.category]));
  return (code) => m.get(code) ?? 'asset';
}

/**
 * Ids of the 结转损益 closing vouchers (+ their reversals, for the reopen window) —
 * excluded from the flow statements (IS/CF) so closing entries don't net out 发生额.
 */
async function closeVoucherIds(tx: TxClient): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const pc of await listPeriodClosesTx(tx)) {
    if (!pc.closeVoucherId) continue;
    ids.add(pc.closeVoucherId);
    const v = await getVoucherTx(tx, pc.closeVoucherId);
    if (v?.reversedBy) ids.add(v.reversedBy);
  }
  return ids;
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
      incomeStatement(
        await getPostedEntriesTx(tx),
        categoryOf(await listAccountsTx(tx)),
        f,
        t,
        await closeVoucherIds(tx),
      ),
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
      return cashFlowStatement(await getPostedEntriesTx(tx), items, f, t, await closeVoucherIds(tx));
    });
  }
}
