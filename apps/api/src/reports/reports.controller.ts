import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('balance-sheet')
  @RequirePermission('read', 'Voucher')
  async balanceSheet(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('to') to?: string,
  ) {
    return this.service.balanceSheet(identity, ledgerBookId, to);
  }

  @Get('income-statement')
  @RequirePermission('read', 'Voucher')
  async incomeStatement(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.incomeStatement(identity, ledgerBookId, from, to);
  }

  @Get('cash-flow')
  @RequirePermission('read', 'Voucher')
  async cashFlow(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.cashFlow(identity, ledgerBookId, from, to);
  }
}
