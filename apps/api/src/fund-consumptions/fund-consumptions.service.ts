import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  countPendingFundConsumptionsTx,
  getFundConsumptionTx,
  listFundConsumptionsTx,
  withScope,
  type FundConsumptionEntity,
} from '@my-erp/db';
import type { Identity } from '@my-erp/platform';
import {
  consumeFundConsumptionWorkflowTx,
  type ConsumeFundInput,
} from '../work-items/fund-workflow';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConsumeFundDto {
  expectedVersion: number;
  executionStatus: 'executed' | 'skipped';
  bankFlowRef?: string | null;
  attachmentId?: string | null;
  reconciliationStatus?: 'unreconciled' | 'reconciled';
}

const iso = (d: Date): string => d.toISOString();
const isoN = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toDto(f: FundConsumptionEntity) {
  return {
    ...f,
    executedAt: isoN(f.executedAt),
    reconciledAt: isoN(f.reconciledAt),
    createdAt: iso(f.createdAt),
    updatedAt: iso(f.updatedAt),
  };
}

/**
 * 货币资金结算/出纳执行 (T-012 Phase 4, D4). Read + consume the cashier fund tasks
 * spawned from accountant/manual voucher posts. Consuming records execution +
 * bank-flow reference + reconciliation and completes the paired fund.consume task —
 * never creating a voucher or any ledger effect (see consumeFundConsumptionWorkflowTx).
 */
@Injectable()
export class FundConsumptionsService {
  async list(
    identity: Identity,
    ledgerBookId: string,
    filters: {
      voucherId?: string;
      executionStatus?: string;
      reconciliationStatus?: string;
      period?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    if (filters.voucherId && !UUID_RE.test(filters.voucherId))
      throw new BadRequestException('voucherId must be a uuid');
    if (filters.cursor && !UUID_RE.test(filters.cursor))
      throw new BadRequestException('cursor must be a uuid');
    if (filters.period && !/^\d{4}-\d{2}$/.test(filters.period))
      throw new BadRequestException('period must be YYYY-MM');
    return withScope(identity.orgId, ledgerBookId, async (tx) =>
      (await listFundConsumptionsTx(tx, filters)).map(toDto),
    );
  }

  /** Open fund-execution workload (queue badge / dashboard). */
  async pendingCount(identity: Identity, ledgerBookId: string): Promise<{ count: number }> {
    return withScope(identity.orgId, ledgerBookId, async (tx) => ({
      count: await countPendingFundConsumptionsTx(tx),
    }));
  }

  async get(identity: Identity, ledgerBookId: string, id: string) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const fc = await getFundConsumptionTx(tx, id);
      if (!fc) throw new NotFoundException('fund consumption not found');
      return toDto(fc);
    });
  }

  async consume(identity: Identity, ledgerBookId: string, id: string, body: ConsumeFundDto) {
    const consumeInput: ConsumeFundInput = {
      executionStatus: body.executionStatus,
      bankFlowRef: body.bankFlowRef ?? null,
      attachmentId: body.attachmentId ?? null,
      ...(body.reconciliationStatus ? { reconciliationStatus: body.reconciliationStatus } : {}),
      expectedVersion: body.expectedVersion,
    };
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const updated = await consumeFundConsumptionWorkflowTx(tx, {
        identity,
        ledgerBookId,
        fundConsumptionId: id,
        body: consumeInput,
      });
      return toDto(updated);
    });
  }
}
