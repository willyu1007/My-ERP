import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  appendAuditRecordTx,
  createLedgerBookTx,
  listLedgerBooksTx,
  withOrgScope,
} from '@my-erp/db';
import { withSpan, type Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { TraceId } from '../auth/trace-id.decorator';

interface CreateLedgerBookBody {
  name: string;
  baseCurrency: string;
  fiscalYear: number;
  periodStructure?: string;
}

function parseCreateBody(body: unknown): CreateLedgerBookBody {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.trim() === '')
    throw new BadRequestException('name is required');
  if (typeof b.baseCurrency !== 'string' || b.baseCurrency.trim() === '') {
    throw new BadRequestException('baseCurrency is required');
  }
  if (typeof b.fiscalYear !== 'number' || !Number.isInteger(b.fiscalYear)) {
    throw new BadRequestException('fiscalYear must be an integer');
  }
  const result: CreateLedgerBookBody = {
    name: b.name,
    baseCurrency: b.baseCurrency,
    fiscalYear: b.fiscalYear,
  };
  if (typeof b.periodStructure === 'string') result.periodStructure = b.periodStructure;
  return result;
}

/**
 * Ledger book (账套) CRUD — org-scoped (RLS by app.current_org). Read for all
 * roles; create for admin/supervisor (操作级). Creation is audited (append-only).
 */
@Controller('ledger-books')
@UseGuards(AuthGuard, PermissionGuard)
export class LedgerBooksController {
  @Get()
  @RequirePermission('read', 'LedgerBook')
  async list(@CurrentIdentity() identity: Identity, @TraceId() traceId?: string) {
    return withSpan(
      'ledger-books.list',
      { traceId, userId: identity.userId, orgId: identity.orgId, action: 'read' },
      () => withOrgScope(identity.orgId, (tx) => listLedgerBooksTx(tx)),
    );
  }

  @Post()
  @RequirePermission('create', 'LedgerBook')
  async create(
    @CurrentIdentity() identity: Identity,
    @Body() body: unknown,
    @TraceId() traceId?: string,
  ) {
    const input = parseCreateBody(body);
    return withSpan(
      'ledger-books.create',
      { traceId, userId: identity.userId, orgId: identity.orgId, action: 'create' },
      () =>
        withOrgScope(identity.orgId, async (tx) => {
          const book = await createLedgerBookTx(tx, { orgId: identity.orgId, ...input });
          await appendAuditRecordTx(tx, {
            actorId: identity.userId,
            action: 'CREATE_LEDGER_BOOK',
            entityType: 'LedgerBook',
            entityId: book.id,
            ledgerBookId: book.id,
          });
          return book;
        }),
    );
  }
}
