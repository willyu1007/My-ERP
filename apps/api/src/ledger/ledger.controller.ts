import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { getOpeningBalancesTx, getPostedEntriesTx, withLedgerScope } from '@my-erp/db';
import { computeAccountLedger, computeTrialBalance } from '@my-erp/finance-domain';
import { withSpan, type Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';

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
  async trialBalance(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity) {
    return withSpan(
      'ledger.trial-balance',
      { userId: identity.userId, ledgerBookId, action: 'read' },
      () =>
        withLedgerScope(ledgerBookId, async (tx) =>
          computeTrialBalance(await getPostedEntriesTx(tx), await getOpeningBalancesTx(tx)),
        ),
    );
  }

  @Get('accounts/:code')
  @RequirePermission('read', 'Voucher')
  async accountLedger(@LedgerBookId() ledgerBookId: string, @Param('code') code: string) {
    return withLedgerScope(ledgerBookId, async (tx) =>
      computeAccountLedger(code, await getPostedEntriesTx(tx), await getOpeningBalancesTx(tx)),
    );
  }
}
