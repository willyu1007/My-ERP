import { Injectable } from '@nestjs/common';
import {
  getPostedEntriesTx,
  listCashFlowItemsTx,
  seedCashFlowItemsTx,
  setAccountDefaultCashFlowItemTx,
  withLedgerScope,
} from '@my-erp/db';
import { cashFlowTieOut, listUntaggedCashFlows } from '@my-erp/finance-domain';
import {
  DEFAULT_CASH_FLOW_BY_ACCOUNT,
  STANDARD_CASH_FLOW_ITEMS,
  type Identity,
} from '@my-erp/platform';

const periodOf = (date: string): string => date.slice(0, 7);

@Injectable()
export class CashFlowService {
  async listItems(_identity: Identity, ledgerBookId: string) {
    return withLedgerScope(ledgerBookId, (tx) => listCashFlowItemsTx(tx));
  }

  async seedStandard(_identity: Identity, ledgerBookId: string) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      const seeded = await seedCashFlowItemsTx(tx, ledgerBookId, STANDARD_CASH_FLOW_ITEMS);
      for (const [code, item] of Object.entries(DEFAULT_CASH_FLOW_BY_ACCOUNT)) {
        await setAccountDefaultCashFlowItemTx(tx, code, item);
      }
      return { seeded };
    });
  }

  /** Pre-close worklist: untagged non-cash lines of cash vouchers (optionally for one period). */
  async untagged(_identity: Identity, ledgerBookId: string, period?: string) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      let entries = await getPostedEntriesTx(tx);
      if (period) entries = entries.filter((e) => periodOf(e.date) === period);
      return listUntaggedCashFlows(entries);
    });
  }

  /** Tie-out over a date range: tagged flows == net cash change. */
  async tieOut(_identity: Identity, ledgerBookId: string, from?: string, to?: string) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      let entries = await getPostedEntriesTx(tx);
      if (from) entries = entries.filter((e) => e.date >= from);
      if (to) entries = entries.filter((e) => e.date <= to);
      return cashFlowTieOut(entries);
    });
  }
}
