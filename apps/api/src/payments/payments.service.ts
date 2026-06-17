import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  appendAuditRecordTx,
  countPaymentDocsInPeriodTx,
  countVouchersInPeriodTx,
  createPaymentDocTx,
  createVoucherTx,
  completeActiveWorkItemsForSourceTx,
  getLedgerBookByIdTx,
  getPaymentDocTx,
  getVoucherTx,
  isPeriodClosedTx,
  listAccountsTx,
  listPaymentDocsTx,
  Prisma,
  setVoucherStatusTx,
  updatePaymentDocTx,
  withScope,
  type AccountEntity,
  type PaymentDocEntity,
  type TxClient,
} from '@my-erp/db';
import { buildSettlementEntry, isCashAccountCode, Money } from '@my-erp/finance-domain';
import type { Identity } from '@my-erp/platform';
import { appendWorkItemOutboxEventTx } from '../work-items/voucher-workflow';
import {
  createPaymentApproveWorkItemTx,
  createPaymentConfirmWorkItemTx,
  PAYMENT_APPROVE_WORK_ITEM_TYPE,
  PAYMENT_CONFIRM_WORK_ITEM_TYPE,
} from './payment-workflow';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

export interface CreatePaymentInput {
  direction: string;
  date: string;
  counterparty: string;
  summary: string;
  amount: string;
  cashAccountCode: string;
  contraAccountCode: string;
  contractId?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function iso(d: Date): string {
  return d.toISOString();
}
function toDto(p: PaymentDocEntity) {
  return {
    id: p.id,
    no: p.no,
    direction: p.direction,
    date: p.date,
    period: p.period,
    counterparty: p.counterparty,
    summary: p.summary,
    amount: p.amount,
    cashAccountCode: p.cashAccountCode,
    contraAccountCode: p.contraAccountCode,
    status: p.status,
    settlementVoucherId: p.settlementVoucherId,
    contractId: p.contractId,
    maker: p.maker,
    approver: p.approver,
    confirmer: p.confirmer,
    version: p.version,
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

function assertDate(value: string): void {
  if (!DATE_RE.test(value)) throw new BadRequestException('date must be YYYY-MM-DD');
}
function normalizeAmount(value: string): string {
  if (!AMOUNT_RE.test(value ?? '')) throw new BadRequestException('amount must be a positive number (≤2dp)');
  const m = Money.of(value);
  if (m.isZero()) throw new BadRequestException('amount must be greater than zero');
  return m.toString();
}
function assertPostable(acct: AccountEntity | undefined, code: string, label: string): AccountEntity {
  if (!acct) throw new BadRequestException(`${label}科目不存在：${code}`);
  if (!acct.isLeaf) throw new BadRequestException(`${label}必须是末级科目：${code}`);
  if (!acct.active) throw new BadRequestException(`${label}科目已停用：${code}`);
  return acct;
}

@Injectable()
export class PaymentsService {
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
      entityType: 'PaymentDoc',
      entityId,
      ledgerBookId,
      metadata,
    });
  }

  async list(identity: Identity, ledgerBookId: string, filters: { status?: string; direction?: string }) {
    return withScope(identity.orgId, ledgerBookId, async (tx) =>
      (await listPaymentDocsTx(tx, filters)).map(toDto),
    );
  }

  async get(identity: Identity, ledgerBookId: string, id: string) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const doc = await getPaymentDocTx(tx, id);
      if (!doc) throw new NotFoundException('payment doc not found');
      return toDto(doc);
    });
  }

  async create(identity: Identity, ledgerBookId: string, input: CreatePaymentInput) {
    if (input.direction !== 'receipt' && input.direction !== 'payment')
      throw new BadRequestException('direction must be receipt | payment');
    assertDate(input.date);
    const amount = normalizeAmount(input.amount);
    if (!input.counterparty?.trim()) throw new BadRequestException('counterparty is required');
    if (!input.summary?.trim()) throw new BadRequestException('summary is required');
    if (input.cashAccountCode === input.contraAccountCode)
      throw new BadRequestException('现金科目与对方科目不能相同');
    if (!isCashAccountCode(input.cashAccountCode))
      throw new BadRequestException('现金科目必须是货币资金类（1001/1002/1012）');
    if (input.contractId != null && input.contractId !== '' && !UUID_RE.test(input.contractId))
      throw new BadRequestException('contractId must be a uuid');
    const period = input.date.slice(0, 7);

    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      if (await isPeriodClosedTx(tx, period))
        throw new BadRequestException('会计期间已结账，请先反结账');
      const byCode = new Map((await listAccountsTx(tx)).map((a) => [a.code, a]));
      assertPostable(byCode.get(input.cashAccountCode), input.cashAccountCode, '现金');
      assertPostable(byCode.get(input.contraAccountCode), input.contraAccountCode, '对方');

      const seq = (await countPaymentDocsInPeriodTx(tx, period, input.direction)) + 1;
      const no = `${input.direction === 'receipt' ? '收' : '付'}-${period}-${String(seq).padStart(3, '0')}`;
      const doc = await createPaymentDocTx(tx, {
        ledgerBookId,
        no,
        direction: input.direction,
        date: input.date,
        period,
        counterparty: input.counterparty.trim(),
        summary: input.summary.trim(),
        amount,
        cashAccountCode: input.cashAccountCode,
        contraAccountCode: input.contraAccountCode,
        maker: identity.userId,
        contractId: input.contractId || null,
      });
      await this.audit(tx, identity, 'CREATE_PAYMENT', doc.id, ledgerBookId, {
        no,
        direction: input.direction,
      });
      return toDto(doc);
    });
  }

  async submit(identity: Identity, ledgerBookId: string, id: string, expectedVersion: number) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const doc = await getPaymentDocTx(tx, id);
      if (!doc) throw new NotFoundException('payment doc not found');
      if (doc.status !== 'draft') throw new BadRequestException(`无法提交 ${doc.status} 状态的单据`);
      if (await isPeriodClosedTx(tx, doc.period))
        throw new BadRequestException('会计期间已结账，请先反结账');
      const updated = await updatePaymentDocTx(tx, id, { expectedVersion, status: 'pending_approval' });
      if (!updated) throw new ConflictException('单据已变化，请刷新');
      await createPaymentApproveWorkItemTx(tx, {
        orgId: identity.orgId,
        ledgerBookId,
        paymentId: id,
        actorId: identity.userId,
      });
      await this.audit(tx, identity, 'SUBMIT_PAYMENT', id, ledgerBookId, {});
      return toDto(updated);
    });
  }

  async approve(identity: Identity, ledgerBookId: string, id: string, expectedVersion: number) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const doc = await getPaymentDocTx(tx, id);
      if (!doc) throw new NotFoundException('payment doc not found');
      if (doc.status !== 'pending_approval')
        throw new BadRequestException(`无法审批 ${doc.status} 状态的单据`);
      const book = await getLedgerBookByIdTx(tx, ledgerBookId);
      const singlePerson = book?.singlePersonMode ?? false;
      if (doc.maker === identity.userId && !singlePerson)
        throw new ForbiddenException('审批人不能是申请人（职责分离）');

      const updated = await updatePaymentDocTx(tx, id, {
        expectedVersion,
        status: 'approved',
        approver: identity.userId,
      });
      if (!updated) throw new ConflictException('单据已变化，请刷新');

      const completed = await completeActiveWorkItemsForSourceTx(tx, {
        sourceType: 'PaymentDoc',
        sourceId: id,
        actorId: identity.userId,
        actionKey: 'complete',
        workItemType: PAYMENT_APPROVE_WORK_ITEM_TYPE,
      });
      for (const item of completed) await appendWorkItemOutboxEventTx(tx, item, 'work_item.completed', 'complete');
      await createPaymentConfirmWorkItemTx(tx, {
        orgId: identity.orgId,
        ledgerBookId,
        paymentId: id,
        actorId: identity.userId,
      });
      await this.audit(tx, identity, 'APPROVE_PAYMENT', id, ledgerBookId, {});
      return toDto(updated);
    });
  }

  async confirm(
    identity: Identity,
    ledgerBookId: string,
    id: string,
    expectedVersion: number,
    confirmSinglePerson: boolean,
  ) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const doc = await getPaymentDocTx(tx, id);
      if (!doc) throw new NotFoundException('payment doc not found');
      if (doc.status !== 'approved') throw new BadRequestException(`单据未审批通过（当前 ${doc.status}）`);
      if (await isPeriodClosedTx(tx, doc.period))
        throw new BadRequestException('会计期间已结账，请先反结账');
      const book = await getLedgerBookByIdTx(tx, ledgerBookId);
      const singlePerson = book?.singlePersonMode ?? false;
      if (doc.maker === identity.userId && !(singlePerson && confirmSinglePerson))
        throw new ForbiddenException('确认人不能是申请人（职责分离）；单人模式需显式确认');

      const byCode = new Map((await listAccountsTx(tx)).map((a) => [a.code, a]));
      const cash = byCode.get(doc.cashAccountCode);
      const contra = byCode.get(doc.contraAccountCode);
      if (!cash || !contra) throw new BadRequestException('结算科目缺失，无法生成凭证');

      // 自动生成结算凭证：系统生成、直接过账（制单=审核，SoD 豁免，审计留痕）。
      const entry = buildSettlementEntry({
        direction: doc.direction as 'receipt' | 'payment',
        amount: doc.amount,
        cash: { code: cash.code, name: cash.name },
        contra: { code: contra.code, name: contra.name },
      });
      const seq = (await countVouchersInPeriodTx(tx, doc.period)) + 1;
      const no = `记-${doc.period}-${String(seq).padStart(3, '0')}`;
      const summary = `${doc.direction === 'receipt' ? '收款' : '付款'}结算：${doc.counterparty}`;
      const voucher = await createVoucherTx(tx, {
        ledgerBookId,
        no,
        date: doc.date,
        period: doc.period,
        summary,
        maker: identity.userId,
        totalDebit: entry.totalDebit,
        totalCredit: entry.totalCredit,
        lines: entry.lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          summary,
          debit: l.debit ?? null,
          credit: l.credit ?? null,
        })),
      });
      await setVoucherStatusTx(tx, voucher.id, {
        status: 'posted',
        checker: identity.userId,
        postedAt: new Date(),
      });
      const postedVoucher = await getVoucherTx(tx, voucher.id); // re-fetch: reflect posted status

      const updated = await updatePaymentDocTx(tx, id, {
        expectedVersion,
        status: 'confirmed',
        confirmer: identity.userId,
        settlementVoucherId: voucher.id,
      });
      if (!updated) throw new ConflictException('单据已变化，请刷新');

      const completed = await completeActiveWorkItemsForSourceTx(tx, {
        sourceType: 'PaymentDoc',
        sourceId: id,
        actorId: identity.userId,
        actionKey: 'complete',
        workItemType: PAYMENT_CONFIRM_WORK_ITEM_TYPE,
      });
      for (const item of completed) await appendWorkItemOutboxEventTx(tx, item, 'work_item.completed', 'complete');
      await this.audit(tx, identity, 'CONFIRM_PAYMENT', id, ledgerBookId, {
        settlementVoucherId: voucher.id,
        voucherNo: no,
      });
      return { ...toDto(updated), settlementVoucher: postedVoucher };
    });
  }

  async void(
    identity: Identity,
    ledgerBookId: string,
    id: string,
    expectedVersion: number,
    reason?: string,
  ) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const doc = await getPaymentDocTx(tx, id);
      if (!doc) throw new NotFoundException('payment doc not found');
      if (doc.status === 'confirmed' || doc.status === 'void')
        throw new BadRequestException('已确认或已作废的单据不能作废');
      const updated = await updatePaymentDocTx(tx, id, { expectedVersion, status: 'void' });
      if (!updated) throw new ConflictException('单据已变化，请刷新');
      const closed = await completeActiveWorkItemsForSourceTx(tx, {
        sourceType: 'PaymentDoc',
        sourceId: id,
        actorId: identity.userId,
        actionKey: 'cancel',
      });
      for (const item of closed) await appendWorkItemOutboxEventTx(tx, item, 'work_item.canceled', 'cancel');
      await this.audit(tx, identity, 'VOID_PAYMENT', id, ledgerBookId, { reason: reason ?? null });
      return toDto(updated);
    });
  }
}
