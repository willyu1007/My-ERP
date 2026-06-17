import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  appendAuditRecordTx,
  countContractsTx,
  createContractTx,
  getContractTx,
  getLedgerBookByIdTx,
  listContractsTx,
  Prisma,
  updateContractTx,
  withScope,
  type ContractEntity,
  type TxClient,
} from '@my-erp/db';
import { Money } from '@my-erp/finance-domain';
import type { Identity } from '@my-erp/platform';

const TYPES = new Set(['sales', 'purchase', 'service', 'other']);
const STATUSES = new Set(['draft', 'active', 'closed']);
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

export interface CreateContractDto {
  title: string;
  type?: string;
  counterparty?: string;
  amount?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  summary?: string;
}
export interface UpdateContractDto {
  expectedVersion: number;
  title?: string;
  type?: string;
  counterparty?: string;
  amount?: string | null;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  summary?: string;
}

const iso = (d: Date): string => d.toISOString();
function toDto(c: ContractEntity) {
  return { ...c, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt) };
}
function assertType(type: string): void {
  if (!TYPES.has(type)) throw new BadRequestException('type must be sales|purchase|service|other');
}
function normalizeAmount(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (!AMOUNT_RE.test(value)) throw new BadRequestException('amount must be a number (≤2dp)');
  return Money.of(value).toString();
}
function assertDate(value: string | null | undefined, name: string): void {
  if (value != null && value !== '' && !DATE_RE.test(value))
    throw new BadRequestException(`${name} must be YYYY-MM-DD`);
}

@Injectable()
export class ContractsService {
  private audit(
    tx: TxClient,
    identity: Identity,
    action: string,
    entityId: string,
    ledgerBookId: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    return appendAuditRecordTx(tx, {
      actorId: identity.userId,
      action,
      entityType: 'Contract',
      entityId,
      ledgerBookId,
      metadata,
    });
  }

  async list(identity: Identity, ledgerBookId: string, filters: { status?: string; type?: string }) {
    return withScope(identity.orgId, ledgerBookId, async (tx) =>
      (await listContractsTx(tx, filters)).map(toDto),
    );
  }

  async get(identity: Identity, ledgerBookId: string, id: string) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const c = await getContractTx(tx, id);
      if (!c) throw new NotFoundException('contract not found');
      return toDto(c);
    });
  }

  async create(identity: Identity, ledgerBookId: string, input: CreateContractDto) {
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    const type = input.type ?? 'other';
    assertType(type);
    const amount = normalizeAmount(input.amount);
    assertDate(input.startDate, 'startDate');
    assertDate(input.endDate, 'endDate');

    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const book = await getLedgerBookByIdTx(tx, ledgerBookId);
      if (!book) throw new NotFoundException('ledger book not found in your organization');
      const seq = (await countContractsTx(tx)) + 1;
      const code = `HT-${book.fiscalYear}-${String(seq).padStart(3, '0')}`;
      const c = await createContractTx(tx, {
        ledgerBookId,
        code,
        title: input.title.trim(),
        type,
        counterparty: input.counterparty?.trim() ?? '',
        amount,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        summary: input.summary?.trim() ?? '',
        createdBy: identity.userId,
      });
      await this.audit(tx, identity, 'CREATE_CONTRACT', c.id, ledgerBookId, { code, type });
      return toDto(c);
    });
  }

  async update(identity: Identity, ledgerBookId: string, id: string, input: UpdateContractDto) {
    if (input.type !== undefined) assertType(input.type);
    if (input.status !== undefined && !STATUSES.has(input.status))
      throw new BadRequestException('status must be draft|active|closed');
    const amount = input.amount !== undefined ? normalizeAmount(input.amount) : undefined;
    assertDate(input.startDate, 'startDate');
    assertDate(input.endDate, 'endDate');

    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const existing = await getContractTx(tx, id);
      if (!existing) throw new NotFoundException('contract not found');
      if (existing.status === 'closed') throw new BadRequestException('已归档合同不可修改');

      const updated = await updateContractTx(tx, id, {
        expectedVersion: input.expectedVersion,
        title: input.title?.trim(),
        type: input.type,
        counterparty: input.counterparty?.trim(),
        amount,
        status: input.status,
        startDate: input.startDate !== undefined ? input.startDate || null : undefined,
        endDate: input.endDate !== undefined ? input.endDate || null : undefined,
        summary: input.summary?.trim(),
      });
      if (!updated) throw new ConflictException('合同已变化，请刷新');
      await this.audit(tx, identity, 'UPDATE_CONTRACT', id, ledgerBookId, {
        status: updated.status,
      });
      return toDto(updated);
    });
  }
}
