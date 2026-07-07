import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  appendAuditRecordTx,
  createAttachmentTx,
  countPendingFundConsumptionsTx,
  getAttachmentTx,
  getFundConsumptionTx,
  listFundConsumptionsTx,
  setFundConsumptionAttachmentTx,
  withScope,
  type FundConsumptionEntity,
} from '@my-erp/db';
import type { Identity, ObjectStore } from '@my-erp/platform';
import { OBJECT_STORE } from '../intakes/tokens';
import {
  consumeFundConsumptionWorkflowTx,
  type ConsumeFundInput,
} from '../work-items/fund-workflow';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export interface ConsumeFundDto {
  expectedVersion: number;
  executionStatus: 'executed' | 'skipped';
  bankFlowRef?: string | null;
  attachmentId?: string | null;
  reconciliationStatus?: 'unreconciled' | 'reconciled';
}

export interface UploadReceiptDto {
  contentType: string;
  contentBase64: string;
}

/** Validate + decode a receipt upload (image/* or application/pdf, ≤10MB). */
function parseReceipt(input: UploadReceiptDto): { bytes: Uint8Array } {
  if (
    typeof input.contentType !== 'string' ||
    !(input.contentType.startsWith('image/') || input.contentType === 'application/pdf')
  ) {
    throw new BadRequestException('回单仅支持图片或 PDF');
  }
  if (typeof input.contentBase64 !== 'string' || input.contentBase64 === '')
    throw new BadRequestException('回单内容为空');
  const bytes = new Uint8Array(Buffer.from(input.contentBase64, 'base64'));
  if (bytes.byteLength === 0) throw new BadRequestException('回单内容为空');
  if (bytes.byteLength > MAX_RECEIPT_BYTES) throw new BadRequestException('回单不能超过 10MB');
  return { bytes };
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
  constructor(@Inject(OBJECT_STORE) private readonly objectStore: ObjectStore) {}

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

  /**
   * 上传银行回单 (T-014). Stores the bytes in the object store + an Attachment row and
   * points the fund line at it. Deliberately does NOT go through the Intake flow: NO
   * outbox event, NO OCR extraction — the receipt is the most sensitive financial
   * detail and must never leak toward the ecosystem (AGENTS.md §3). Internal audit only.
   * Not version-guarded (evidence is orthogonal to the consume version); blocked on void.
   */
  async uploadReceipt(
    identity: Identity,
    ledgerBookId: string,
    id: string,
    body: UploadReceiptDto,
  ) {
    const { bytes } = parseReceipt(body);
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const fc = await getFundConsumptionTx(tx, id);
      if (!fc) throw new NotFoundException('fund consumption not found');
      if (fc.executionStatus === 'void')
        throw new BadRequestException('已作废的资金任务不能上传回单');
      const stored = await this.objectStore.put({
        orgId: identity.orgId,
        ledgerBookId,
        bytes,
        contentType: body.contentType,
      });
      const attachment = await createAttachmentTx(tx, {
        orgId: identity.orgId,
        ledgerBookId,
        storageKey: stored.storageKey,
        contentType: body.contentType,
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        createdBy: identity.userId,
      });
      const updated = await setFundConsumptionAttachmentTx(tx, id, attachment.id);
      if (!updated) throw new BadRequestException('资金任务已变化，请刷新');
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'ATTACH_FUND_RECEIPT',
        entityType: 'FundConsumption',
        entityId: id,
        ledgerBookId,
        metadata: { attachmentId: attachment.id, contentType: body.contentType },
      });
      return toDto(updated);
    });
  }

  /** Stream a fund line's receipt bytes back (in-app view). Read-scoped like the row. */
  async getReceipt(
    identity: Identity,
    ledgerBookId: string,
    id: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const attachment = await withScope(identity.orgId, ledgerBookId, async (tx) => {
      const fc = await getFundConsumptionTx(tx, id);
      if (!fc) throw new NotFoundException('fund consumption not found');
      if (!fc.attachmentId) throw new NotFoundException('该资金任务没有回单');
      const att = await getAttachmentTx(tx, fc.attachmentId);
      if (!att) throw new NotFoundException('回单附件不存在');
      return att;
    });
    return { bytes: await this.objectStore.get(attachment.storageKey), contentType: attachment.contentType };
  }
}
