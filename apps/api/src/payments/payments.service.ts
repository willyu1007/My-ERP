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
  getBusinessPartnerTx,
  getLedgerBookByIdTx,
  getPaymentDocTx,
  getVoucherTx,
  isPeriodClosedTx,
  listAccountsTx,
  listCashFlowItemsTx,
  listPaymentDocsTx,
  Prisma,
  setVoucherStatusTx,
  updatePaymentDocTx,
  withScope,
  type AccountEntity,
  type PaymentDocEntity,
  type TxClient,
} from '@my-erp/db';
import {
  buildSettlementEntry,
  CASH_ACCOUNT_ROOT_CODES,
  isCashAccountCode,
  Money,
} from '@my-erp/finance-domain';
import { isAccountingCapable, type Identity } from '@my-erp/platform';
import { appendWorkItemOutboxEventTx } from '../work-items/voucher-workflow';
import {
  createPaymentApproveWorkItemTx,
  createPaymentConfirmWorkItemTx,
  createPaymentEnrichWorkItemTx,
  PAYMENT_APPROVE_WORK_ITEM_TYPE,
  PAYMENT_CONFIRM_WORK_ITEM_TYPE,
  PAYMENT_ENRICH_WORK_ITEM_TYPE,
} from './payment-workflow';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

export interface CreatePaymentInput {
  direction: string;
  date: string;
  /** Display snapshot; optional when partnerId resolves it (T-012). */
  counterparty?: string;
  /** Optional BusinessPartner link (T-012); must be an active in-scope partner. */
  partnerId?: string | null;
  summary: string;
  amount: string;
  /** Accounting subjects — omitted on the cashier path (T-012 Phase 3, D3). */
  cashAccountCode?: string | null;
  contraAccountCode?: string | null;
  /** Enrichment fields for the direct accounting-capable path (T-012 Phase 3, D7). */
  contraAux?: unknown;
  cashFlowItem?: string | null;
  contractId?: string | null;
}

/** T-012 Phase 3 (D7): accountant completes the accounting facts of a cashier doc. */
export interface EnrichPaymentInput {
  expectedVersion: number;
  cashAccountCode: string;
  contraAccountCode: string;
  /** 辅助核算 for the contra line, keyed by AuxType (optional). */
  contraAux?: unknown;
  /** 现金流量项目 code for the contra line (optional; auto-suggested from the account). */
  cashFlowItem?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A doc is accounting-complete iff both subjects are set, distinct, and cash-typed. */
function isAccountingComplete(
  doc: Pick<PaymentDocEntity, 'cashAccountCode' | 'contraAccountCode'>,
): boolean {
  return (
    !!doc.cashAccountCode &&
    !!doc.contraAccountCode &&
    doc.cashAccountCode !== doc.contraAccountCode &&
    isCashAccountCode(doc.cashAccountCode)
  );
}

/** Auxiliary-dimension blob must be a plain JSON object (or absent). */
function normalizeContraAux(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('contraAux 必须是对象');
  return value as Prisma.InputJsonValue;
}

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
    partnerId: p.partnerId,
    summary: p.summary,
    amount: p.amount,
    cashAccountCode: p.cashAccountCode,
    contraAccountCode: p.contraAccountCode,
    contraAux: p.contraAux ?? null,
    cashFlowItem: p.cashFlowItem,
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
  if (!AMOUNT_RE.test(value ?? ''))
    throw new BadRequestException('amount must be a positive number (≤2dp)');
  const m = Money.of(value);
  if (m.isZero()) throw new BadRequestException('amount must be greater than zero');
  return m.toString();
}
function assertPostable(
  acct: AccountEntity | undefined,
  code: string,
  label: string,
): AccountEntity {
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

  async list(
    identity: Identity,
    ledgerBookId: string,
    filters: { status?: string; direction?: string; partnerId?: string },
  ) {
    if (filters.partnerId && !UUID_RE.test(filters.partnerId))
      throw new BadRequestException('partnerId must be a uuid');
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

  /** Validate an optional 现金流量项目 code against the ledger's active CF master. */
  private async assertCashFlowItem(tx: TxClient, code: string): Promise<void> {
    const item = (await listCashFlowItemsTx(tx)).find((i) => i.code === code);
    if (!item) throw new BadRequestException(`现金流量项目不存在：${code}`);
    if (!item.active) throw new BadRequestException(`现金流量项目已停用：${code}`);
  }

  async create(identity: Identity, ledgerBookId: string, input: CreatePaymentInput) {
    if (input.direction !== 'receipt' && input.direction !== 'payment')
      throw new BadRequestException('direction must be receipt | payment');
    assertDate(input.date);
    const amount = normalizeAmount(input.amount);
    const partnerId = input.partnerId || null;
    if (partnerId && !UUID_RE.test(partnerId))
      throw new BadRequestException('partnerId must be a uuid');
    if (!partnerId && !input.counterparty?.trim())
      throw new BadRequestException('counterparty is required');
    if (!input.summary?.trim()) throw new BadRequestException('summary is required');
    if (input.contractId != null && input.contractId !== '' && !UUID_RE.test(input.contractId))
      throw new BadRequestException('contractId must be a uuid');
    const period = input.date.slice(0, 7);

    // D8 role fork: cashiers capture business facts only; accounting-capable roles may
    // fill subjects at creation (direct path). Decided by capability, not a role string.
    const capable = isAccountingCapable(identity);
    const cashAccountCode = input.cashAccountCode?.trim() || null;
    const contraAccountCode = input.contraAccountCode?.trim() || null;
    let contraAux: Prisma.InputJsonValue | undefined;
    let cashFlowItem: string | null = null;

    if (!capable) {
      // D3: cashier docs enter enrichment; no accounting fields are accepted here.
      if (cashAccountCode || contraAccountCode)
        throw new BadRequestException('出纳建单不填写会计科目');
      if (input.contraAux != null || input.cashFlowItem)
        throw new BadRequestException('出纳建单不填写会计信息');
    } else {
      if (!cashAccountCode || !contraAccountCode)
        throw new BadRequestException('会计建单需填写现金科目与对方科目');
      if (cashAccountCode === contraAccountCode)
        throw new BadRequestException('现金科目与对方科目不能相同');
      if (!isCashAccountCode(cashAccountCode))
        throw new BadRequestException(
          `现金科目必须是货币资金类（${CASH_ACCOUNT_ROOT_CODES.join('/')}）`,
        );
      contraAux = normalizeContraAux(input.contraAux);
      cashFlowItem = input.cashFlowItem?.trim() || null;
    }

    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      if (await isPeriodClosedTx(tx, period))
        throw new BadRequestException('会计期间已结账，请先反结账');
      // T-012: resolve the partner link in-scope; the doc keeps its own text snapshot.
      let counterparty = input.counterparty?.trim() ?? '';
      if (partnerId) {
        const partner = await getBusinessPartnerTx(tx, partnerId);
        if (!partner) throw new BadRequestException('往来单位不存在');
        if (!partner.active) throw new BadRequestException('往来单位已停用');
        if (!counterparty) counterparty = partner.name;
      }
      if (capable) {
        const byCode = new Map((await listAccountsTx(tx)).map((a) => [a.code, a]));
        assertPostable(byCode.get(cashAccountCode!), cashAccountCode!, '现金');
        assertPostable(byCode.get(contraAccountCode!), contraAccountCode!, '对方');
        if (cashFlowItem) await this.assertCashFlowItem(tx, cashFlowItem);
      }

      const seq = (await countPaymentDocsInPeriodTx(tx, period, input.direction)) + 1;
      const no = `${input.direction === 'receipt' ? '收' : '付'}-${period}-${String(seq).padStart(3, '0')}`;
      const doc = await createPaymentDocTx(tx, {
        ledgerBookId,
        no,
        direction: input.direction,
        date: input.date,
        period,
        counterparty,
        partnerId,
        summary: input.summary.trim(),
        amount,
        cashAccountCode,
        contraAccountCode,
        contraAux,
        cashFlowItem,
        status: capable ? 'draft' : 'pending_accounting',
        maker: identity.userId,
        contractId: input.contractId || null,
      });
      // Cashier docs open the accountant's enrichment queue (D3).
      if (!capable) {
        await createPaymentEnrichWorkItemTx(tx, {
          orgId: identity.orgId,
          ledgerBookId,
          paymentId: doc.id,
          actorId: identity.userId,
        });
      }
      await this.audit(tx, identity, 'CREATE_PAYMENT', doc.id, ledgerBookId, {
        no,
        direction: input.direction,
        path: capable ? 'direct' : 'cashier',
      });
      return toDto(doc);
    });
  }

  /**
   * T-012 Phase 3 (D3/D7): the accountant completes accounting facts on a cashier
   * doc — cash/bank + contra subjects, the contra line's auxiliary dimensions, and
   * the cash-flow item — then the doc advances straight to `pending_approval` and the
   * approver queue opens (D3 flow: create → enrich → approval → confirm; the accountant
   * confirmation IS the control point before approval). NEVER generates a voucher
   * (D7: the voucher is built + posted only at confirm) and leaves maker/approver/
   * confirmer untouched so downstream SoD still measures against the cashier maker.
   */
  async enrich(
    identity: Identity,
    ledgerBookId: string,
    id: string,
    input: EnrichPaymentInput,
  ) {
    if (!isAccountingCapable(identity)) throw new ForbiddenException('仅会计可补全科目');
    const cashAccountCode = input.cashAccountCode?.trim();
    const contraAccountCode = input.contraAccountCode?.trim();
    if (!cashAccountCode || !contraAccountCode)
      throw new BadRequestException('现金科目与对方科目必填');
    if (cashAccountCode === contraAccountCode)
      throw new BadRequestException('现金科目与对方科目不能相同');
    if (!isCashAccountCode(cashAccountCode))
      throw new BadRequestException(
        `现金科目必须是货币资金类（${CASH_ACCOUNT_ROOT_CODES.join('/')}）`,
      );
    const contraAux = normalizeContraAux(input.contraAux);
    const cashFlowItem = input.cashFlowItem?.trim() || null;

    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const doc = await getPaymentDocTx(tx, id);
      if (!doc) throw new NotFoundException('payment doc not found');
      if (doc.status !== 'pending_accounting')
        throw new BadRequestException(`无法补录 ${doc.status} 状态的单据`);
      if (await isPeriodClosedTx(tx, doc.period))
        throw new BadRequestException('会计期间已结账，请先反结账');
      const byCode = new Map((await listAccountsTx(tx)).map((a) => [a.code, a]));
      assertPostable(byCode.get(cashAccountCode), cashAccountCode, '现金');
      assertPostable(byCode.get(contraAccountCode), contraAccountCode, '对方');
      if (cashFlowItem) await this.assertCashFlowItem(tx, cashFlowItem);

      const updated = await updatePaymentDocTx(tx, id, {
        expectedVersion: input.expectedVersion,
        status: 'pending_approval',
        cashAccountCode,
        contraAccountCode,
        contraAux: contraAux ?? null,
        cashFlowItem,
      });
      if (!updated) throw new ConflictException('单据已变化，请刷新');
      // Complete ONLY the enrich item — never a co-existing approve/confirm item.
      const completed = await completeActiveWorkItemsForSourceTx(tx, {
        sourceType: 'PaymentDoc',
        sourceId: id,
        actorId: identity.userId,
        actionKey: 'complete',
        workItemType: PAYMENT_ENRICH_WORK_ITEM_TYPE,
      });
      for (const item of completed)
        await appendWorkItemOutboxEventTx(tx, item, 'work_item.completed', 'complete');
      // Hand off to the approver queue (task-driven; same item submit() opens).
      await createPaymentApproveWorkItemTx(tx, {
        orgId: identity.orgId,
        ledgerBookId,
        paymentId: id,
        actorId: identity.userId,
      });
      await this.audit(tx, identity, 'ENRICH_PAYMENT', id, ledgerBookId, {
        cashAccountCode,
        contraAccountCode,
      });
      return toDto(updated);
    });
  }

  async submit(identity: Identity, ledgerBookId: string, id: string, expectedVersion: number) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const doc = await getPaymentDocTx(tx, id);
      if (!doc) throw new NotFoundException('payment doc not found');
      if (doc.status !== 'draft')
        throw new BadRequestException(`无法提交 ${doc.status} 状态的单据`);
      // Belt-and-braces: a draft reached via enrich or the direct path is already
      // complete, but make the invariant explicit (T-012 Phase 3).
      if (!isAccountingComplete(doc))
        throw new BadRequestException('会计科目未补全，无法提交');
      if (await isPeriodClosedTx(tx, doc.period))
        throw new BadRequestException('会计期间已结账，请先反结账');
      const updated = await updatePaymentDocTx(tx, id, {
        expectedVersion,
        status: 'pending_approval',
      });
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
      for (const item of completed)
        await appendWorkItemOutboxEventTx(tx, item, 'work_item.completed', 'complete');
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
      if (doc.status !== 'approved')
        throw new BadRequestException(`单据未审批通过（当前 ${doc.status}）`);
      if (await isPeriodClosedTx(tx, doc.period))
        throw new BadRequestException('会计期间已结账，请先反结账');
      const book = await getLedgerBookByIdTx(tx, ledgerBookId);
      const singlePerson = book?.singlePersonMode ?? false;
      if (doc.maker === identity.userId && !(singlePerson && confirmSinglePerson))
        throw new ForbiddenException('确认人不能是申请人（职责分离）；单人模式需显式确认');

      // T-012 Phase 3: guards the null-subject hole opened by nullable columns.
      if (!isAccountingComplete(doc))
        throw new BadRequestException('结算科目缺失或无效，无法生成凭证');
      const byCode = new Map((await listAccountsTx(tx)).map((a) => [a.code, a]));
      const cash = byCode.get(doc.cashAccountCode!);
      const contra = byCode.get(doc.contraAccountCode!);
      if (!cash || !contra) throw new BadRequestException('结算科目缺失，无法生成凭证');

      // 自动生成结算凭证：系统生成、直接过账（制单=审核，SoD 豁免，审计留痕）。
      // 补录的辅助核算 + 现金流量项目 随对方（非现金）分录进入凭证（D7）。
      const entry = buildSettlementEntry({
        direction: doc.direction as 'receipt' | 'payment',
        amount: doc.amount,
        cash: { code: cash.code, name: cash.name },
        contra: { code: contra.code, name: contra.name },
        contraAux: doc.contraAux ?? undefined,
        contraCashFlowItem: doc.cashFlowItem,
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
          aux: l.aux,
          cashFlowItem: l.cashFlowItem ?? null,
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
      for (const item of completed)
        await appendWorkItemOutboxEventTx(tx, item, 'work_item.completed', 'complete');
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
      for (const item of closed)
        await appendWorkItemOutboxEventTx(tx, item, 'work_item.canceled', 'cancel');
      await this.audit(tx, identity, 'VOID_PAYMENT', id, ledgerBookId, { reason: reason ?? null });
      return toDto(updated);
    });
  }
}
