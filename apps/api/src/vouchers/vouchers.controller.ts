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
  countVouchersInPeriodTx,
  createVoucherTx,
  getVoucherTx,
  listAccountsTx,
  listVouchersTx,
  setVoucherStatusTx,
  updateDraftVoucherTx,
  withLedgerScope,
  type TxClient,
  type VoucherLineInput,
} from '@my-erp/db';
import { Money, voucherBalanceError } from '@my-erp/finance-domain';
import { withSpan, type Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
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

function parseAmount(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new BadRequestException(`${field} must be a non-negative decimal (≤ 2dp)`);
  }
  return value;
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
}
