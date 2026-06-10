import { BadRequestException, Body, Controller, Get, HttpCode, Put, UseGuards } from '@nestjs/common';
import {
  appendAuditRecordTx,
  countPostedVouchersTx,
  getOpeningBalancesTx,
  listAccountsTx,
  replaceOpeningBalancesTx,
  setLedgerOpeningPeriodTx,
  withLedgerScope,
  withOrgScope,
  type OpeningBalanceInput,
} from '@my-erp/db';
import { openingBalanceError } from '@my-erp/finance-domain';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { CurrentLedgerBook } from '../auth/current-ledger-book.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import type { LedgerBookEntity } from '@my-erp/db';

interface ParsedOpening {
  accountCode: string;
  debit: string | null;
  credit: string | null;
}

function parseAmount(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new BadRequestException(`${field} must be a non-negative decimal (≤ 2dp)`);
  }
  return value;
}

function parseBody(body: unknown): { openingPeriod: string; balances: ParsedOpening[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.openingPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(b.openingPeriod)) {
    throw new BadRequestException('openingPeriod must be YYYY-MM');
  }
  if (!Array.isArray(b.balances)) throw new BadRequestException('balances must be an array');
  const balances = b.balances.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    if (typeof o.accountCode !== 'string' || o.accountCode === '') throw new BadRequestException('accountCode is required');
    return { accountCode: o.accountCode, debit: parseAmount(o.debit, 'debit'), credit: parseAmount(o.credit, 'credit') };
  });
  return { openingPeriod: b.openingPeriod, balances };
}

/**
 * Opening balances (期初建账) — ledger-scoped. Sets the enabled period + replaces
 * the opening-balance set. Enforces 启用期试算平衡 (借=贷) and that every account is
 * an active leaf; only allowed before the book has been used (no posted vouchers).
 */
@Controller('opening-balances')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class OpeningBalancesController {
  @Get()
  @RequirePermission('read', 'Account')
  async get(@LedgerBookId() ledgerBookId: string, @CurrentLedgerBook() book: LedgerBookEntity) {
    const balances = await withLedgerScope(ledgerBookId, (tx) => getOpeningBalancesTx(tx));
    return { openingPeriod: book.openingPeriod, balances };
  }

  @Put()
  @HttpCode(200)
  @RequirePermission('create', 'Account')
  async set(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity, @Body() body: unknown) {
    const { openingPeriod, balances } = parseBody(body);
    const error = openingBalanceError(balances);
    if (error) throw new BadRequestException(error);

    await withLedgerScope(ledgerBookId, async (tx) => {
      if ((await countPostedVouchersTx(tx)) > 0) {
        throw new BadRequestException('cannot set opening balances after the book has been used (期初建账须在使用前)');
      }
      const accounts = new Map((await listAccountsTx(tx)).map((a) => [a.code, a]));
      const enriched: OpeningBalanceInput[] = balances.map((b) => {
        const account = accounts.get(b.accountCode);
        if (!account) throw new BadRequestException(`account ${b.accountCode} not found`);
        if (!account.isLeaf) throw new BadRequestException(`account ${b.accountCode} is not a leaf account`);
        if (!account.active) throw new BadRequestException(`account ${b.accountCode} is inactive`);
        return { accountCode: b.accountCode, accountName: account.name, debit: b.debit, credit: b.credit };
      });
      await replaceOpeningBalancesTx(tx, ledgerBookId, enriched);
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'SET_OPENING_BALANCES',
        entityType: 'LedgerBook',
        entityId: ledgerBookId,
        ledgerBookId,
      });
    });
    // The enabled period lives on the (org-scoped) ledger book.
    await withOrgScope(identity.orgId, (tx) => setLedgerOpeningPeriodTx(tx, ledgerBookId, openingPeriod));

    const saved = await withLedgerScope(ledgerBookId, (tx) => getOpeningBalancesTx(tx));
    return { openingPeriod, balances: saved };
  }
}
