import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { getLedgerBookByIdTx, withOrgScope } from '@my-erp/db';
import type { AuthedRequest } from './request-context';

/**
 * Binds the request to a ledger-book scope for financial (ledger-scoped)
 * endpoints. Requires an active ledgerBookId on the token and validates it
 * belongs to the caller's org (app-layer check, complementing the ledger-scoped
 * RLS) — preventing a forged ledgerBookId from another org. Runs after AuthGuard.
 */
@Injectable()
export class LedgerScopeGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const identity = req.identity;
    if (!identity) throw new ForbiddenException('no identity (AuthGuard must run first)');
    if (!identity.ledgerBookId) {
      throw new BadRequestException('no active ledger book — set ledgerBookId in the token');
    }
    const book = await withOrgScope(identity.orgId, (tx) => getLedgerBookByIdTx(tx, identity.ledgerBookId as string));
    if (!book) throw new ForbiddenException('ledger book not found in your organization');
    req.ledgerBookId = book.id;
    return true;
  }
}
