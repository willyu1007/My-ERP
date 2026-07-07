import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import {
  FundConsumptionsService,
  type ConsumeFundDto,
  type UploadReceiptDto,
} from './fund-consumptions.service';

/**
 * 货币资金结算/出纳执行 (T-012 Phase 4, D4). The cashier's fund-execution view over
 * accountant-voucher cash/bank lines. Consuming records execution WITHOUT posting a
 * second voucher — gated on the `consume`/`FundConsumption` capability (which a
 * cashier holds), never on `post Voucher`.
 */
@Controller('fund-consumptions')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class FundConsumptionsController {
  constructor(private readonly service: FundConsumptionsService) {}

  @Get()
  @RequirePermission('read', 'FundConsumption')
  async list(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Query('voucherId') voucherId?: string,
    @Query('executionStatus') executionStatus?: string,
    @Query('reconciliationStatus') reconciliationStatus?: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    let parsedLimit: number | undefined;
    if (limit !== undefined) {
      parsedLimit = Number(limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100)
        throw new BadRequestException('limit must be an integer between 1 and 100');
    }
    return this.service.list(identity, ledgerBookId, {
      voucherId,
      executionStatus,
      reconciliationStatus,
      period,
      limit: parsedLimit,
      cursor,
    });
  }

  // Declared before `:id` so the literal segment is not captured as an id.
  @Get('pending-count')
  @RequirePermission('read', 'FundConsumption')
  async pendingCount(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
  ) {
    return this.service.pendingCount(identity, ledgerBookId);
  }

  @Get(':id')
  @RequirePermission('read', 'FundConsumption')
  async get(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ) {
    return this.service.get(identity, ledgerBookId, id);
  }

  @Post(':id/consume')
  @HttpCode(200)
  @RequirePermission('consume', 'FundConsumption')
  async consume(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(b.expectedVersion) || (b.expectedVersion as number) < 0)
      throw new BadRequestException('expectedVersion is required');
    if (b.executionStatus !== 'executed' && b.executionStatus !== 'skipped')
      throw new BadRequestException('executionStatus must be executed | skipped');
    const dto: ConsumeFundDto = {
      expectedVersion: b.expectedVersion as number,
      executionStatus: b.executionStatus,
      bankFlowRef: typeof b.bankFlowRef === 'string' ? b.bankFlowRef : null,
      attachmentId: typeof b.attachmentId === 'string' ? b.attachmentId : null,
      ...(b.reconciliationStatus === 'reconciled' || b.reconciliationStatus === 'unreconciled'
        ? { reconciliationStatus: b.reconciliationStatus }
        : {}),
    };
    return this.service.consume(identity, ledgerBookId, id, dto);
  }

  // 上传银行回单 (T-014). Evidence for a fund line — gated on `consume` (the cashier who
  // executes), works at confirm-time and after the fact. Base64 JSON, image/* or PDF, ≤10MB.
  @Post(':id/attachment')
  @HttpCode(200)
  @RequirePermission('consume', 'FundConsumption')
  async uploadReceipt(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (typeof b.contentType !== 'string' || typeof b.contentBase64 !== 'string')
      throw new BadRequestException('contentType and contentBase64 are required');
    const dto: UploadReceiptDto = { contentType: b.contentType, contentBase64: b.contentBase64 };
    return this.service.uploadReceipt(identity, ledgerBookId, id, dto);
  }

  // View the receipt bytes in-app (streamed; not an api-client JSON method).
  @Get(':id/attachment')
  @RequirePermission('read', 'FundConsumption')
  @Header('Content-Disposition', 'inline')
  @Header('Cache-Control', 'private, no-store')
  async getReceipt(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { bytes, contentType } = await this.service.getReceipt(identity, ledgerBookId, id);
    return new StreamableFile(bytes, { type: contentType });
  }
}
