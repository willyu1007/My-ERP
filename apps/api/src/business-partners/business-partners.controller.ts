import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import {
  BusinessPartnersService,
  type CreateBusinessPartnerDto,
  type UpdateBusinessPartnerDto,
} from './business-partners.service';

@Controller('business-partners')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class BusinessPartnersController {
  constructor(private readonly service: BusinessPartnersService) {}

  @Get()
  @RequirePermission('read', 'BusinessPartner')
  async list(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('active') active?: string,
    @Query('partyType') partyType?: string,
    @Query('role') role?: string,
    @Query('q') q?: string,
  ) {
    return this.service.list(identity, ledgerBookId, {
      active: active === undefined ? undefined : active === 'true',
      partyType,
      role,
      q,
    });
  }

  @Post()
  @RequirePermission('create', 'BusinessPartner')
  async create(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Body() body: CreateBusinessPartnerDto,
  ) {
    return this.service.create(identity, ledgerBookId, body);
  }

  @Get(':id')
  @RequirePermission('read', 'BusinessPartner')
  async get(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ) {
    return this.service.get(identity, ledgerBookId, id);
  }

  @Patch(':id')
  @RequirePermission('update', 'BusinessPartner')
  async update(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: UpdateBusinessPartnerDto,
  ) {
    return this.service.update(identity, ledgerBookId, id, body);
  }
}
