import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { CashFlowService } from './cash-flow.service';

@Controller()
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class CashFlowController {
  constructor(private readonly service: CashFlowService) {}

  @Get('cash-flow-items')
  @RequirePermission('read', 'Account')
  async listItems(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity) {
    return this.service.listItems(identity, ledgerBookId);
  }

  @Post('cash-flow-items/seed-standard')
  @HttpCode(200)
  @RequirePermission('create', 'Account')
  async seedStandard(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity) {
    return this.service.seedStandard(identity, ledgerBookId);
  }

  @Get('cash-flow/untagged')
  @RequirePermission('read', 'Voucher')
  async untagged(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('period') period?: string,
  ) {
    return this.service.untagged(identity, ledgerBookId, period);
  }

  @Get('cash-flow/tie-out')
  @RequirePermission('read', 'Voucher')
  async tieOut(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.tieOut(identity, ledgerBookId, from, to);
  }

  @Post('cash-flow/tag')
  @HttpCode(200)
  @RequirePermission('update', 'Voucher')
  async tag(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Body() body: { voucherId: string; accountCode: string; cashFlowItem?: string | null },
  ) {
    return this.service.tag(identity, ledgerBookId, {
      voucherId: body.voucherId,
      accountCode: body.accountCode,
      cashFlowItem: body.cashFlowItem ?? null,
    });
  }
}
