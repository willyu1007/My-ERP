import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { getOpeningBalancesTx, getPostedEntriesTx, withLedgerScope } from '@my-erp/db';
import {
  computeAccountLedger,
  computeTrialBalance,
  ledgerSourceForPeriod,
} from '@my-erp/finance-domain';
import { withSpan, type Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';

const PERIOD_RE = /^\d{4}-\d{2}$/;

function parsePeriod(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequestException('period must be YYYY-MM');
  if (!PERIOD_RE.test(value)) throw new BadRequestException('period must be YYYY-MM');
  return value;
}

/**
 * Ledger reports (账簿) — DERIVED from posted vouchers (no materialized balance
 * table), so they're always consistent with the journal even under concurrent
 * posting. Opening balances are empty until P5 (期初建账). Ledger-scoped, read-only.
 */
@Controller('ledger')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class LedgerController {
  @Get('trial-balance')
  @RequirePermission('read', 'Voucher')
  async trialBalance(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('period') rawPeriod?: string | readonly string[],
  ) {
    const period = parsePeriod(rawPeriod);
    return withSpan(
      'ledger.trial-balance',
      { userId: identity.userId, ledgerBookId, action: 'read', period },
      () =>
        withLedgerScope(ledgerBookId, async (tx) => {
          const source = ledgerSourceForPeriod(
            await getPostedEntriesTx(tx),
            await getOpeningBalancesTx(tx),
            period,
          );
          return computeTrialBalance(source.entries, source.openings);
        }),
    );
  }

  @Get('accounts/:code')
  @RequirePermission('read', 'Voucher')
  async accountLedger(
    @LedgerBookId() ledgerBookId: string,
    @Param('code') code: string,
    @Query('period') rawPeriod?: string | readonly string[],
  ) {
    const period = parsePeriod(rawPeriod);
    return withLedgerScope(ledgerBookId, async (tx) => {
      const source = ledgerSourceForPeriod(
        await getPostedEntriesTx(tx),
        await getOpeningBalancesTx(tx),
        period,
      );
      return computeAccountLedger(code, source.entries, source.openings);
    });
  }
}
