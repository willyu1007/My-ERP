import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  appendAuditRecordTx,
  getPostedEntriesTx,
  getVoucherTx,
  isPeriodClosedTx,
  listCashFlowItemsTx,
  seedCashFlowItemsTx,
  setAccountDefaultCashFlowItemTx,
  tagVoucherLineCashFlowTx,
  withLedgerScope,
} from '@my-erp/db';
import { cashFlowTieOut, isCashAccountCode, listUntaggedCashFlows } from '@my-erp/finance-domain';
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

  /**
   * Post-hoc tag (pre-close worklist): set the 现金流量项目 on a voucher's non-cash
   * line(s) by (voucherId, accountCode). Only `cash_flow_item` changes, so 借贷必平
   * + balances hold. Blocked in a closed period; audited as TAG_CASH_FLOW.
   */
  async tag(
    identity: Identity,
    ledgerBookId: string,
    input: { voucherId: string; accountCode: string; cashFlowItem: string | null },
  ) {
    if (!input.voucherId || !input.accountCode)
      throw new BadRequestException('voucherId and accountCode are required');
    if (isCashAccountCode(input.accountCode))
      throw new BadRequestException('现金类科目不打标，请对非现金（对方）分录打标');

    return withLedgerScope(ledgerBookId, async (tx) => {
      const voucher = await getVoucherTx(tx, input.voucherId);
      if (!voucher) throw new NotFoundException('voucher not found');
      if (await isPeriodClosedTx(tx, voucher.period))
        throw new BadRequestException('会计期间已结账，请先反结账');

      if (input.cashFlowItem) {
        const items = await listCashFlowItemsTx(tx);
        if (!items.some((i) => i.code === input.cashFlowItem))
          throw new BadRequestException(`未知现金流量项目：${input.cashFlowItem}`);
      }

      const tagged = await tagVoucherLineCashFlowTx(
        tx,
        input.voucherId,
        input.accountCode,
        input.cashFlowItem || null,
      );
      if (tagged === 0) throw new BadRequestException('未找到匹配的分录');

      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'TAG_CASH_FLOW',
        entityType: 'Voucher',
        entityId: input.voucherId,
        ledgerBookId,
        metadata: {
          accountCode: input.accountCode,
          cashFlowItem: input.cashFlowItem ?? null,
          lines: tagged,
        },
      });
      return { tagged };
    });
  }
}
