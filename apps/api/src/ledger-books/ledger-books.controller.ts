import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { appendAuditRecordTx, listAuditEntriesTx, withLedgerScope } from '@my-erp/db';
import { withSpan, type Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { TraceId } from '../auth/trace-id.decorator';

/**
 * Example protected resource (P0b skeleton — real LedgerBook CRUD lands in P1).
 * Demonstrates the full stack: authn (AuthGuard) → authz (CASL PermissionGuard)
 * → ledger-scoped + audited DB access (withLedgerScope + append-only audit).
 */
@Controller('ledger-books')
@UseGuards(AuthGuard, PermissionGuard)
export class LedgerBooksController {
  @Get()
  @RequirePermission('read', 'LedgerBook')
  async list(@CurrentIdentity() identity: Identity, @TraceId() traceId?: string) {
    return withSpan(
      'ledger-books.list',
      { traceId, userId: identity.userId, orgId: identity.orgId, ledgerBookId: identity.ledgerBookId, action: 'read' },
      async () => {
        const recent = await withLedgerScope(identity.ledgerBookId, async (tx) => {
          await appendAuditRecordTx(tx, {
            actorId: identity.userId,
            action: 'LIST_LEDGER_BOOKS',
            entityType: 'LedgerBook',
            ledgerBookId: identity.ledgerBookId,
          });
          return listAuditEntriesTx(tx, 5);
        });
        return { ledgerBookId: identity.ledgerBookId, roles: identity.roles, recentAuditCount: recent.length };
      },
    );
  }

  /** Operation-level authz demo: only roles entitled to 过账 (post Voucher) pass. */
  @Post('post-check')
  @HttpCode(200)
  @RequirePermission('post', 'Voucher')
  postCheck(@CurrentIdentity() identity: Identity) {
    return { ok: true, actor: identity.userId };
  }
}
