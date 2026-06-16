import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  appendAuditRecordTx,
  closePeriodTx,
  countUnpostedVouchersInPeriodTx,
  countVouchersInPeriodTx,
  createReversalVoucherTx,
  createVoucherTx,
  getOpeningBalancesTx,
  getPeriodCloseTx,
  getPostedEntriesTx,
  getVoucherTx,
  listAccountsTx,
  listPeriodClosesTx,
  reopenPeriodTx,
  setVoucherStatusTx,
  withLedgerScope,
  type PeriodCloseEntity,
  type TxClient,
  type VoucherLineInput,
} from '@my-erp/db';
import {
  buildCloseLossesEntry,
  computeTrialBalance,
  listUntaggedCashFlows,
  Money,
  type CloseInputRow,
} from '@my-erp/finance-domain';
import type { Identity } from '@my-erp/platform';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertPeriod(period: string): void {
  if (!PERIOD_RE.test(period)) throw new BadRequestException('period must be YYYY-MM');
}
function lastDayOf(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of next month = last day of this
}
const periodOf = (date: string): string => date.slice(0, 7);
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toDto(pc: PeriodCloseEntity) {
  return {
    period: pc.period,
    status: pc.status,
    closeVoucherId: pc.closeVoucherId,
    closedBy: pc.closedBy,
    closedAt: iso(pc.closedAt),
    reopenedAt: iso(pc.reopenedAt),
  };
}

export interface Readiness {
  period: string;
  status: string;
  unpostedCount: number;
  unclosedPriorPeriods: string[];
  /** Untagged cash flows in the period (informational — does not block close). */
  untaggedCashFlowCount: number;
  canClose: boolean;
}

@Injectable()
export class PeriodCloseService {
  async list(_identity: Identity, ledgerBookId: string) {
    return withLedgerScope(ledgerBookId, async (tx) => (await listPeriodClosesTx(tx)).map(toDto));
  }

  async readiness(_identity: Identity, ledgerBookId: string, period: string): Promise<Readiness> {
    assertPeriod(period);
    return withLedgerScope(ledgerBookId, (tx) => this.readinessTx(tx, period));
  }

  private async readinessTx(tx: TxClient, period: string): Promise<Readiness> {
    const existing = await getPeriodCloseTx(tx, period);
    const status = existing?.status ?? 'open';
    const unpostedCount = await countUnpostedVouchersInPeriodTx(tx, period);
    const allPosted = await getPostedEntriesTx(tx);
    const priorActive = [...new Set(allPosted.map((e) => periodOf(e.date)).filter((p) => p < period))];
    const closedSet = new Set(
      (await listPeriodClosesTx(tx)).filter((x) => x.status === 'closed').map((x) => x.period),
    );
    const unclosedPriorPeriods = priorActive.filter((p) => !closedSet.has(p)).sort();
    const untaggedCashFlowCount = listUntaggedCashFlows(
      allPosted.filter((e) => periodOf(e.date) === period),
    ).length;
    const canClose = status !== 'closed' && unpostedCount === 0 && unclosedPriorPeriods.length === 0;
    return { period, status, unpostedCount, unclosedPriorPeriods, untaggedCashFlowCount, canClose };
  }

  async close(identity: Identity, ledgerBookId: string, period: string) {
    assertPeriod(period);
    return withLedgerScope(ledgerBookId, async (tx) => {
      const r = await this.readinessTx(tx, period);
      if (r.status === 'closed') throw new BadRequestException('period already closed');
      if (r.unpostedCount > 0)
        throw new BadRequestException(`period has ${r.unpostedCount} unposted voucher(s)`);
      if (r.unclosedPriorPeriods.length > 0)
        throw new BadRequestException(`close prior periods first: ${r.unclosedPriorPeriods.join(', ')}`);

      // 结转损益: zero the 损益类 accounts' closing-as-of-period-end into 本年利润.
      const entries = (await getPostedEntriesTx(tx)).filter((e) => periodOf(e.date) <= period);
      const tb = computeTrialBalance(entries, await getOpeningBalancesTx(tx));
      const catByCode = new Map((await listAccountsTx(tx)).map((a) => [a.code, a.category]));
      const rows: CloseInputRow[] = tb.rows.map((row) => ({
        accountCode: row.accountCode,
        accountName: row.accountName,
        category: catByCode.get(row.accountCode) ?? 'asset',
        closingDebit: row.closingDebit,
        closingCredit: row.closingCredit,
      }));
      const close = buildCloseLossesEntry(rows);

      let closeVoucherId: string | null = null;
      if (close.lines.length >= 2) {
        const lines: VoucherLineInput[] = close.lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          summary: '结转损益',
          debit: l.debit ?? null,
          credit: l.credit ?? null,
        }));
        const totalDebit = lines
          .reduce((s, l) => (l.debit ? s.add(Money.of(l.debit)) : s), Money.zero())
          .toString();
        const totalCredit = lines
          .reduce((s, l) => (l.credit ? s.add(Money.of(l.credit)) : s), Money.zero())
          .toString();
        const seq = (await countVouchersInPeriodTx(tx, period)) + 1;
        const no = `记-${period}-${String(seq).padStart(3, '0')}`;
        const voucher = await createVoucherTx(tx, {
          ledgerBookId,
          no,
          date: lastDayOf(period),
          period,
          summary: `结转损益 ${period}`,
          maker: identity.userId,
          totalDebit,
          totalCredit,
          lines,
        });
        // System close: post directly (SoD-exempt), audited.
        await setVoucherStatusTx(tx, voucher.id, {
          status: 'posted',
          checker: identity.userId,
          postedAt: new Date(),
        });
        closeVoucherId = voucher.id;
      }

      const pc = await closePeriodTx(tx, {
        ledgerBookId,
        period,
        closeVoucherId,
        closedBy: identity.userId,
      });
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'CLOSE_PERIOD',
        entityType: 'PeriodClose',
        entityId: pc.id,
        ledgerBookId,
        metadata: { period, netProfit: close.netProfit, closeVoucherId },
      });
      return { ...toDto(pc), netProfit: close.netProfit };
    });
  }

  async reopen(identity: Identity, ledgerBookId: string, period: string) {
    assertPeriod(period);
    return withLedgerScope(ledgerBookId, async (tx) => {
      const pc = await getPeriodCloseTx(tx, period);
      if (!pc || pc.status !== 'closed') throw new BadRequestException('period is not closed');
      const laterClosed = (await listPeriodClosesTx(tx))
        .filter((x) => x.status === 'closed' && x.period > period)
        .map((x) => x.period)
        .sort();
      if (laterClosed.length > 0)
        throw new BadRequestException(`reopen later periods first: ${laterClosed.join(', ')}`);

      if (pc.closeVoucherId) {
        const original = await getVoucherTx(tx, pc.closeVoucherId);
        if (original && original.status === 'posted' && !original.reversedBy) {
          const seq = (await countVouchersInPeriodTx(tx, original.period)) + 1;
          const no = `记-${original.period}-${String(seq).padStart(3, '0')}`;
          const reversal = await createReversalVoucherTx(tx, original, {
            no,
            reverser: identity.userId,
            date: original.date,
            period: original.period,
            postedAt: new Date(),
          });
          await setVoucherStatusTx(tx, original.id, { status: 'reversed', reversedBy: reversal.id });
        }
      }
      const reopened = await reopenPeriodTx(tx, { period, reopenedBy: identity.userId });
      if (!reopened) throw new NotFoundException('period not found');
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'REOPEN_PERIOD',
        entityType: 'PeriodClose',
        entityId: reopened.id,
        ledgerBookId,
        metadata: { period },
      });
      return toDto(reopened);
    });
  }
}
