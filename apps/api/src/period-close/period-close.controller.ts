import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { PeriodCloseService } from './period-close.service';

@Controller('periods')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class PeriodCloseController {
  constructor(private readonly service: PeriodCloseService) {}

  @Get()
  @RequirePermission('read', 'Voucher')
  async list(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity) {
    return this.service.list(identity, ledgerBookId);
  }

  @Get(':period/readiness')
  @RequirePermission('read', 'Voucher')
  async readiness(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('period') period: string,
  ) {
    return this.service.readiness(identity, ledgerBookId, period);
  }

  // Closing/reopening is high-sensitivity (gated like posting).
  @Post(':period/close')
  @HttpCode(200)
  @RequirePermission('post', 'Voucher')
  async close(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('period') period: string,
  ) {
    return this.service.close(identity, ledgerBookId, period);
  }

  @Post(':period/reopen')
  @HttpCode(200)
  @RequirePermission('post', 'Voucher')
  async reopen(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('period') period: string,
  ) {
    return this.service.reopen(identity, ledgerBookId, period);
  }
}
