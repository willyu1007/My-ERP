import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
  countVouchersInPeriodTx,
  createReversalVoucherTx,
  createVoucherTx,
  getVoucherTx,
  listAccountsTx,
  listVouchersTx,
  setVoucherStatusTx,
  updateDraftVoucherTx,
  withLedgerScope,
  type LedgerBookEntity,
  type TxClient,
  type VoucherLineInput,
} from '@my-erp/db';
import { Money, voucherBalanceError } from '@my-erp/finance-domain';
import { withSpan, type Identity } from '@my-erp/platform';
import { parseAmount } from '../common/parse-amount';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { CurrentLedgerBook } from '../auth/current-ledger-book.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';

interface ParsedLine {
  accountCode: string;
  summary: string;
  debit: string | null;
  credit: string | null;
  aux?: unknown;
  cashFlowItem?: string | null;
}

function parseHeader(body: unknown): { date: string; summary: string; rawLines: unknown } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new BadRequestException('date must be YYYY-MM-DD');
  if (typeof b.summary !== 'string' || b.summary.trim() === '') throw new BadRequestException('summary is required');
  return { date: b.date, summary: b.summary.trim(), rawLines: b.lines };
}

/** Parse + per-line validate (each line one-sided); compute totals via Money (no float). */
function parseLines(raw: unknown): { lines: ParsedLine[]; totalDebit: string; totalCredit: string } {
  if (!Array.isArray(raw)) throw new BadRequestException('lines must be an array');
  let debit = Money.zero();
  let credit = Money.zero();
  const lines = raw.map((item) => {
    const l = (item ?? {}) as Record<string, unknown>;
    if (typeof l.accountCode !== 'string' || l.accountCode === '') throw new BadRequestException('line accountCode is required');
    const d = parseAmount(l.debit, 'debit');
    const c = parseAmount(l.credit, 'credit');
    if (d && c) throw new BadRequestException('a line cannot have both a debit and a credit');
    if (!d && !c) throw new BadRequestException('a line must have a debit or a credit');
    if (d) debit = debit.add(Money.of(d));
    if (c) credit = credit.add(Money.of(c));
    const line: ParsedLine = { accountCode: l.accountCode, summary: typeof l.summary === 'string' ? l.summary : '', debit: d, credit: c };
    if (typeof l.cashFlowItem === 'string') line.cashFlowItem = l.cashFlowItem;
    if (l.aux !== undefined) line.aux = l.aux;
    return line;
  });
  return { lines, totalDebit: debit.toString(), totalCredit: credit.toString() };
}

/** Validate every line's account is an active leaf in the ledger; denormalize names. */
async function enrichLines(tx: TxClient, parsed: readonly ParsedLine[]): Promise<VoucherLineInput[]> {
  const byCode = new Map((await listAccountsTx(tx)).map((a) => [a.code, a]));
  return parsed.map((l) => {
    const account = byCode.get(l.accountCode);
    if (!account) throw new BadRequestException(`account ${l.accountCode} not found`);
    if (!account.isLeaf) throw new BadRequestException(`account ${l.accountCode} is not a leaf account`);
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
  async list(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity, @Query('status') status?: string) {
    return withSpan('vouchers.list', { userId: identity.userId, ledgerBookId, action: 'read' }, () =>
      withLedgerScope(ledgerBookId, (tx) => listVouchersTx(tx, status)),
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
  async create(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity, @Body() body: unknown) {
    const { date, summary, rawLines } = parseHeader(body);
    const { lines, totalDebit, totalCredit } = parseLines(rawLines);
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
        lines: enriched,
      });
      await appendAuditRecordTx(tx, { actorId: identity.userId, action: 'CREATE_VOUCHER', entityType: 'Voucher', entityId: voucher.id, ledgerBookId });
      return voucher;
    });
  }

  @Patch(':id')
  @RequirePermission('update', 'Voucher')
  async update(@LedgerBookId() ledgerBookId: string, @Param('id') id: string, @Body() body: unknown) {
    const { date, summary, rawLines } = parseHeader(body);
    const { lines, totalDebit, totalCredit } = parseLines(rawLines);
    return withLedgerScope(ledgerBookId, async (tx) => {
      const existing = await getVoucherTx(tx, id);
      if (!existing) throw new NotFoundException('voucher not found');
      if (existing.status !== 'draft') throw new BadRequestException('only draft vouchers can be edited');
      const enriched = await enrichLines(tx, lines);
      await updateDraftVoucherTx(tx, id, ledgerBookId, { date, period: date.slice(0, 7), summary, totalDebit, totalCredit, lines: enriched });
      return getVoucherTx(tx, id);
    });
  }

  /** draft → pending. Enforces 借贷必平 (the DB CHECK also backstops it). */
  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('update', 'Voucher')
  async submit(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity, @Param('id') id: string) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      const voucher = await getVoucherTx(tx, id);
      if (!voucher) throw new NotFoundException('voucher not found');
      if (voucher.status !== 'draft') throw new BadRequestException(`cannot submit a ${voucher.status} voucher`);
      const error = voucherBalanceError(voucher.lines);
      if (error) throw new BadRequestException(error);
      await setVoucherStatusTx(tx, id, { status: 'pending' });
      await appendAuditRecordTx(tx, { actorId: identity.userId, action: 'SUBMIT_VOUCHER', entityType: 'Voucher', entityId: id, ledgerBookId });
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
    const confirmSinglePerson = Boolean((body as Record<string, unknown> | null)?.confirmSinglePerson);
    return withLedgerScope(ledgerBookId, async (tx) => {
      const voucher = await getVoucherTx(tx, id);
      if (!voucher) throw new NotFoundException('voucher not found');
      if (voucher.status !== 'pending') throw new BadRequestException(`cannot post a ${voucher.status} voucher`);
      const error = voucherBalanceError(voucher.lines);
      if (error) throw new BadRequestException(error);

      const selfPost = voucher.maker === identity.userId;
      if (selfPost && !(book.singlePersonMode && confirmSinglePerson)) {
        throw new ForbiddenException(
          'the maker cannot post their own voucher (职责分离); enable single-person mode and confirm to override',
        );
      }
      await setVoucherStatusTx(tx, id, { status: 'posted', checker: identity.userId, postedAt: new Date() });
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: selfPost ? 'POST_VOUCHER_SINGLE_PERSON' : 'POST_VOUCHER',
        entityType: 'Voucher',
        entityId: id,
        ledgerBookId,
        ...(selfPost ? { metadata: { singlePerson: true } } : {}),
      });
      return getVoucherTx(tx, id);
    });
  }

  /**
   * posted → reversed (红冲). Generates a posted reversal voucher (swapped lines)
   * and links both ways. Atomic; the original is never deleted or mutated beyond
   * its status + reversedBy.
   */
  @Post(':id/reverse')
  @HttpCode(200)
  @RequirePermission('reverse', 'Voucher')
  async reverse(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity, @Param('id') id: string) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      const original = await getVoucherTx(tx, id);
      if (!original) throw new NotFoundException('voucher not found');
      if (original.status !== 'posted') throw new BadRequestException(`only a posted voucher can be reversed (current: ${original.status})`);
      if (original.reversedBy) throw new BadRequestException('voucher already reversed');

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
