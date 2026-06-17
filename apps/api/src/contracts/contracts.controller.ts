import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import {
  ContractsService,
  type CreateContractDto,
  type UpdateContractDto,
} from './contracts.service';

// MVP reuses Voucher CASL actions (dedicated Contract subject = follow-up).
@Controller('contracts')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  @RequirePermission('read', 'Voucher')
  async list(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.service.list(identity, ledgerBookId, { status, type });
  }

  @Post()
  @RequirePermission('create', 'Voucher')
  async create(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Body() body: CreateContractDto,
  ) {
    return this.service.create(identity, ledgerBookId, body);
  }

  @Get(':id')
  @RequirePermission('read', 'Voucher')
  async get(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ) {
    return this.service.get(identity, ledgerBookId, id);
  }

  @Get(':id/timeline')
  @RequirePermission('read', 'Voucher')
  async timeline(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ) {
    return this.service.timeline(identity, ledgerBookId, id);
  }

  @Patch(':id')
  @RequirePermission('update', 'Voucher')
  async update(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: UpdateContractDto,
  ) {
    return this.service.update(identity, ledgerBookId, id, body);
  }
}
