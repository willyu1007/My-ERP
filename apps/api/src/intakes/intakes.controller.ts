import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { IntakeService } from './intakes.service';

@Controller('intakes')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class IntakesController {
  constructor(private readonly service: IntakeService) {}

  @Post()
  @RequirePermission('create', 'Intake')
  async capture(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Body() body: unknown,
  ) {
    return this.service.capture(identity, ledgerBookId, body);
  }

  @Get()
  @RequirePermission('read', 'Intake')
  async list(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('status') status?: string,
  ) {
    return this.service.list(identity, ledgerBookId, status);
  }

  @Get(':id')
  @RequirePermission('read', 'Intake')
  async detail(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ) {
    return this.service.detail(identity, ledgerBookId, id);
  }

  @Post(':id/extract')
  @HttpCode(200)
  @RequirePermission('update', 'Intake')
  async extract(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ) {
    return this.service.extract(identity, ledgerBookId, id);
  }

  @Post(':id/discard')
  @HttpCode(200)
  @RequirePermission('cancel', 'Intake')
  async discard(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ) {
    return this.service.discard(identity, ledgerBookId, id);
  }
}
