import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  appendAuditRecordTx,
  completeActiveWorkItemsForSourceTx,
  countVouchersInPeriodTx,
  createReversalVoucherTx,
  createVoucherTx,
  getVoucherTx,
  isPeriodClosedTx,
  listAccountsTx,
  listVouchersTx,
  setVoucherStatusTx,
  updateDraftVoucherTx,
  withLedgerScope,
  withScope,
  type LedgerBookEntity,
  type TxClient,
  type VoucherLineInput,
} from '@my-erp/db';
import { Money, voucherBalanceError } from '@my-erp/finance-domain';
import { withSpan, type Identity } from '@my-erp/platform';
import { parseAmount } from '../common/parse-amount';
import { assertDate } from '../common/parse-date';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { CurrentLedgerBook } from '../auth/current-ledger-book.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import {
  appendWorkItemOutboxEventTx,
  createVoucherReviewWorkItemTx,
  postVoucherReviewTx,
  VOUCHER_CONFIRM_WORK_ITEM_TYPE,
} from '../work-items/voucher-workflow';

interface ParsedLine {
  accountCode: string;
  summary: string;
  debit: string | null;
  credit: string | null;
  aux?: unknown;
  cashFlowItem?: string | null;
}

interface FastEntryDraftPayload {
  version: 1;
  summary?: string;
  contractId?: string | null;
  lines?: {
    accountCode?: string;
    accountName?: string;
    summary?: string;
    debit?: string;
    credit?: string;
    cashFlowItem?: string;
  }[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DRAFT_LINES = 100;
const MAX_SUMMARY_LEN = 500;
const MAX_ACCOUNT_CODE_LEN = 64;
const MAX_ACCOUNT_NAME_LEN = 120;
const MAX_CASH_FLOW_ITEM_LEN = 64;

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string`);
  if (value.length > maxLength)
    throw new BadRequestException(`${field} must be at most ${maxLength} chars`);
  return value;
}

function parseDraftPayload(value: unknown): FastEntryDraftPayload | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('draftPayload must be an object');
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) throw new BadRequestException('draftPayload.version must be 1');

  let contractId: string | null | undefined;
  if (raw.contractId === null || raw.contractId === '') contractId = null;
  else if (raw.contractId !== undefined) {
    if (typeof raw.contractId !== 'string' || !UUID_RE.test(raw.contractId))
      throw new BadRequestException('draftPayload.contractId must be a uuid');
    contractId = raw.contractId;
  }

  let lines: FastEntryDraftPayload['lines'];
  if (raw.lines !== undefined) {
    if (!Array.isArray(raw.lines))
      throw new BadRequestException('draftPayload.lines must be an array');
    if (raw.lines.length > MAX_DRAFT_LINES)
      throw new BadRequestException(
        `draftPayload.lines must contain at most ${MAX_DRAFT_LINES} items`,
      );
    lines = raw.lines.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw new BadRequestException(`draftPayload.lines[${index}] must be an object`);
      const line = item as Record<string, unknown>;
      const debit = optionalString(line.debit, `draftPayload.lines[${index}].debit`, 32);
      const credit = optionalString(line.credit, `draftPayload.lines[${index}].credit`, 32);
      parseAmount(debit, `draftPayload.lines[${index}].debit`);
      parseAmount(credit, `draftPayload.lines[${index}].credit`);
      if (debit && credit)
        throw new BadRequestException(
          `draftPayload.lines[${index}] cannot have both debit and credit`,
        );
      const parsedLine: NonNullable<FastEntryDraftPayload['lines']>[number] = {};
      const accountCode = optionalString(
        line.accountCode,
        `draftPayload.lines[${index}].accountCode`,
        MAX_ACCOUNT_CODE_LEN,
      );
      const accountName = optionalString(
        line.accountName,
        `draftPayload.lines[${index}].accountName`,
        MAX_ACCOUNT_NAME_LEN,
      );
      const summary = optionalString(
        line.summary,
        `draftPayload.lines[${index}].summary`,
        MAX_SUMMARY_LEN,
      );
      const cashFlowItem = optionalString(
        line.cashFlowItem,
        `draftPayload.lines[${index}].cashFlowItem`,
        MAX_CASH_FLOW_ITEM_LEN,
      );
      if (accountCode !== undefined) parsedLine.accountCode = accountCode;
      if (accountName !== undefined) parsedLine.accountName = accountName;
      if (summary !== undefined) parsedLine.summary = summary;
      if (debit !== undefined) parsedLine.debit = debit;
      if (credit !== undefined) parsedLine.credit = credit;
      if (cashFlowItem !== undefined) parsedLine.cashFlowItem = cashFlowItem;
      return parsedLine;
    });
  }

  const payload: FastEntryDraftPayload = { version: 1 };
  const summary = optionalString(raw.summary, 'draftPayload.summary', MAX_SUMMARY_LEN);
  if (summary !== undefined) payload.summary = summary;
  if (contractId !== undefined) payload.contractId = contractId;
  if (lines !== undefined) payload.lines = lines;
  return payload;
}

export function parseVoucherBody(body: unknown): {
  date: string;
  summary: string;
  rawLines: unknown;
  contractId: string | null;
  draftPayload: FastEntryDraftPayload | null;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const date = assertDate(b.date);
  const summary = typeof b.summary === 'string' ? b.summary.trim() : '';
  let contractId: string | null = null;
  if (b.contractId != null && b.contractId !== '') {
    if (typeof b.contractId !== 'string' || !UUID_RE.test(b.contractId))
      throw new BadRequestException('contractId must be a uuid');
    contractId = b.contractId;
  }
  return {
    date,
    summary,
    rawLines: b.lines,
    contractId,
    draftPayload: parseDraftPayload(b.draftPayload),
  };
}

/** Parse draft lines. Account-bearing lines become normalized accounting lines. */
export function parseVoucherLines(raw: unknown): {
  lines: ParsedLine[];
  totalDebit: string;
  totalCredit: string;
} {
  if (raw === undefined || raw === null) raw = [];
  if (!Array.isArray(raw)) throw new BadRequestException('lines must be an array');
  let debit = Money.zero();
  let credit = Money.zero();
  const lines: ParsedLine[] = [];
  raw.forEach((item) => {
    const l = (item ?? {}) as Record<string, unknown>;
    const accountCode = typeof l.accountCode === 'string' ? l.accountCode.trim() : '';
    const d = parseAmount(l.debit, 'debit');
    const c = parseAmount(l.credit, 'credit');
    if (d && c) throw new BadRequestException('a line cannot have both a debit and a credit');
    if (accountCode === '') return;
    if (d) debit = debit.add(Money.of(d));
    if (c) credit = credit.add(Money.of(c));
    const line: ParsedLine = {
      accountCode,
      summary: typeof l.summary === 'string' ? l.summary.trim() : '',
      debit: d,
      credit: c,
    };
    if (typeof l.cashFlowItem === 'string') line.cashFlowItem = l.cashFlowItem;
    if (l.aux !== undefined) line.aux = l.aux;
    lines.push(line);
  });
  return { lines, totalDebit: debit.toString(), totalCredit: credit.toString() };
}

export function assertVoucherSummaryForSubmit(summary: string): void {
  if (summary.trim() === '') throw new BadRequestException('summary is required');
}

/** Validate every line's account is an active leaf in the ledger; denormalize names. */
async function enrichLines(
  tx: TxClient,
  parsed: readonly ParsedLine[],
): Promise<VoucherLineInput[]> {
  const byCode = new Map((await listAccountsTx(tx)).map((a) => [a.code, a]));
  return parsed.map((l) => {
    const account = byCode.get(l.accountCode);
    if (!account) throw new BadRequestException(`account ${l.accountCode} not found`);
    if (!account.isLeaf)
      throw new BadRequestException(`account ${l.accountCode} is not a leaf account`);
    if (!account.active) throw new BadRequestException(`account ${l.accountCode} is inactive`);
    return { ...l, accountName: account.name };
  });
}

/**
 * Journal vouchers (记账凭证) — ledger-scoped (P3a: draft lifecycle). A draft may
 * be unbalanced while editing; submit enforces 借贷必平 (voucherBalanceError) and
 * the DB CHECK backstops any non-draft voucher. Posting/reversal land in P3b.
 */
@Controller('vouchers')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class VouchersController {
  @Get()
  @RequirePermission('read', 'Voucher')
  async list(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('status') status?: string,
  ) {
    return withSpan(
      'vouchers.list',
      { userId: identity.userId, ledgerBookId, action: 'read' },
      () => withLedgerScope(ledgerBookId, (tx) => listVouchersTx(tx, status)),
    );
  }

  @Get(':id')
  @RequirePermission('read', 'Voucher')
  async detail(@LedgerBookId() ledgerBookId: string, @Param('id') id: string) {
    const voucher = await withLedgerScope(ledgerBookId, (tx) => getVoucherTx(tx, id));
    if (!voucher) throw new NotFoundException('voucher not found');
    return voucher;
  }

  @Post()
  @RequirePermission('create', 'Voucher')
  async create(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Body() body: unknown,
  ) {
    const { date, summary, rawLines, contractId, draftPayload } = parseVoucherBody(body);
    const { lines, totalDebit, totalCredit } = parseVoucherLines(rawLines);
    const period = date.slice(0, 7);
    return withLedgerScope(ledgerBookId, async (tx) => {
      const enriched = await enrichLines(tx, lines);
      const seq = (await countVouchersInPeriodTx(tx, period)) + 1;
      const no = `记-${period}-${String(seq).padStart(3, '0')}`;
      const voucher = await createVoucherTx(tx, {
        ledgerBookId,
        no,
        date,
        period,
        summary,
        maker: identity.userId,
        totalDebit,
        totalCredit,
        contractId,
        draftPayload,
        lines: enriched,
      });
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'CREATE_VOUCHER',
        entityType: 'Voucher',
        entityId: voucher.id,
        ledgerBookId,
      });
      return voucher;
    });
  }

  @Patch(':id')
  @RequirePermission('update', 'Voucher')
  async update(
    @LedgerBookId() ledgerBookId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { date, summary, rawLines, contractId, draftPayload } = parseVoucherBody(body);
    const { lines, totalDebit, totalCredit } = parseVoucherLines(rawLines);
    return withLedgerScope(ledgerBookId, async (tx) => {
      const existing = await getVoucherTx(tx, id);
      if (!existing) throw new NotFoundException('voucher not found');
      if (existing.status !== 'draft')
        throw new BadRequestException('only draft vouchers can be edited');
      if (await isPeriodClosedTx(tx, existing.period))
        throw new BadRequestException('会计期间已结账，请先反结账');
      const enriched = await enrichLines(tx, lines);
      await updateDraftVoucherTx(tx, id, ledgerBookId, {
        date,
        period: date.slice(0, 7),
        summary,
        totalDebit,
        totalCredit,
        contractId,
        draftPayload,
        lines: enriched,
      });
      return getVoucherTx(tx, id);
    });
  }

  /** draft → pending. Enforces 借贷必平 (the DB CHECK also backstops it). */
  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('update', 'Voucher')
  async submit(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ) {
    return withScope(identity.orgId, ledgerBookId, async (tx) => {
      const voucher = await getVoucherTx(tx, id);
      if (!voucher) throw new NotFoundException('voucher not found');
      if (voucher.status !== 'draft')
        throw new BadRequestException(`cannot submit a ${voucher.status} voucher`);
      if (await isPeriodClosedTx(tx, voucher.period))
        throw new BadRequestException('会计期间已结账，请先反结账');
      assertVoucherSummaryForSubmit(voucher.summary);
      const error = voucherBalanceError(voucher.lines);
      if (error) throw new BadRequestException(error);
      await setVoucherStatusTx(tx, id, { status: 'pending', clearDraftPayload: true });
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'SUBMIT_VOUCHER',
        entityType: 'Voucher',
        entityId: id,
        ledgerBookId,
      });
      // Confirming a capture-generated draft (T-004): submitting it closes the
      // accountant's voucher.confirm task and opens the supervisor's review task.
      const confirmed = await completeActiveWorkItemsForSourceTx(tx, {
        sourceType: 'JournalVoucher',
        sourceId: id,
        actorId: identity.userId,
        actionKey: 'complete',
        workItemType: VOUCHER_CONFIRM_WORK_ITEM_TYPE,
      });
      for (const item of confirmed) {
        await appendWorkItemOutboxEventTx(tx, item, 'work_item.completed', 'complete');
      }
      await createVoucherReviewWorkItemTx(tx, {
        orgId: identity.orgId,
        ledgerBookId,
        voucherId: id,
        actorId: identity.userId,
      });
      return getVoucherTx(tx, id);
    });
  }

  /**
   * pending → posted (审核过账). SoD: the maker cannot post their own voucher,
   * unless single-person mode is explicitly enabled on the ledger AND the caller
   * confirms (audited as a single-person post). Transactional + balance-checked.
   */
  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('post', 'Voucher')
  async post(
    @LedgerBookId() ledgerBookId: string,
    @CurrentLedgerBook() book: LedgerBookEntity,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const confirmSinglePerson = Boolean(
      (body as Record<string, unknown> | null)?.confirmSinglePerson,
    );
    return withScope(identity.orgId, ledgerBookId, (tx) =>
      postVoucherReviewTx(tx, {
        ledgerBookId,
        book,
        identity,
        voucherId: id,
        confirmSinglePerson,
      }),
    );
  }

  /**
   * posted → reversed (红冲). Generates a posted reversal voucher (swapped lines)
   * and links both ways. Atomic; the original is never deleted or mutated beyond
   * its status + reversedBy.
   */
  @Post(':id/reverse')
  @HttpCode(200)
  @RequirePermission('reverse', 'Voucher')
  async reverse(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      const original = await getVoucherTx(tx, id);
      if (!original) throw new NotFoundException('voucher not found');
      if (original.status !== 'posted')
        throw new BadRequestException(
          `only a posted voucher can be reversed (current: ${original.status})`,
        );
      if (original.reversedBy) throw new BadRequestException('voucher already reversed');
      if (await isPeriodClosedTx(tx, original.period))
        throw new BadRequestException('会计期间已结账，请先反结账');

      const seq = (await countVouchersInPeriodTx(tx, original.period)) + 1;
      const no = `记-${original.period}-${String(seq).padStart(3, '0')}`;
      const reversal = await createReversalVoucherTx(tx, original, {
        no,
        reverser: identity.userId,
        date: original.date,
        period: original.period,
        postedAt: new Date(),
      });
      await setVoucherStatusTx(tx, id, { status: 'reversed', reversedBy: reversal.id });
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'REVERSE_VOUCHER',
        entityType: 'Voucher',
        entityId: id,
        ledgerBookId,
        metadata: { reversalId: reversal.id },
      });
      return { original: await getVoucherTx(tx, id), reversal };
    });
  }
}
