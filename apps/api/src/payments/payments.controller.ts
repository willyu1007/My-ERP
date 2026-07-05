import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { PaymentsService, type CreatePaymentInput } from './payments.service';

/** Optimistic version pulled from the request body (required on every transition). */
function expectedVersion(body: unknown): number {
  const v = (body as Record<string, unknown> | null)?.expectedVersion;
  if (!Number.isInteger(v) || (v as number) < 0)
    throw new BadRequestException('expectedVersion is required');
  return v as number;
}

@Controller('payments')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  @RequirePermission('read', 'Voucher')
  async list(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('status') status?: string,
    @Query('direction') direction?: string,
    @Query('partnerId') partnerId?: string,
  ) {
    return this.service.list(identity, ledgerBookId, { status, direction, partnerId });
  }

  @Post()
  @RequirePermission('create', 'Voucher')
  async create(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Body() body: CreatePaymentInput,
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

  // T-012 Phase 3: accountant completes the accounting facts of a cashier doc.
  // `post Voucher` route gate = accounting-capable; the cashier lacks it → 403.
  @Post(':id/enrich')
  @HttpCode(200)
  @RequirePermission('post', 'Voucher')
  async enrich(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = (body ?? {}) as Record<string, unknown>;
    const cashAccountCode = typeof b.cashAccountCode === 'string' ? b.cashAccountCode : '';
    const contraAccountCode = typeof b.contraAccountCode === 'string' ? b.contraAccountCode : '';
    if (!cashAccountCode || !contraAccountCode)
      throw new BadRequestException('cashAccountCode/contraAccountCode required');
    return this.service.enrich(identity, ledgerBookId, id, {
      expectedVersion: expectedVersion(body),
      cashAccountCode,
      contraAccountCode,
      contraAux: b.contraAux,
      cashFlowItem: typeof b.cashFlowItem === 'string' ? b.cashFlowItem : null,
    });
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('update', 'Voucher')
  async submit(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.submit(identity, ledgerBookId, id, expectedVersion(body));
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('approve', 'Voucher')
  async approve(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.approve(identity, ledgerBookId, id, expectedVersion(body));
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission('post', 'Voucher')
  async confirm(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const confirmSinglePerson = Boolean(
      (body as Record<string, unknown> | null)?.confirmSinglePerson,
    );
    return this.service.confirm(
      identity,
      ledgerBookId,
      id,
      expectedVersion(body),
      confirmSinglePerson,
    );
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermission('update', 'Voucher')
  async void(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const reason = (body as Record<string, unknown> | null)?.reason;
    return this.service.void(
      identity,
      ledgerBookId,
      id,
      expectedVersion(body),
      typeof reason === 'string' ? reason : undefined,
    );
  }
}
