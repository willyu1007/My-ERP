import { createParamDecorator, type ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { LedgerBookEntity } from '@my-erp/db';
import type { AuthedRequest } from './request-context';

/** Inject the validated active ledger book resolved by LedgerScopeGuard. */
export const CurrentLedgerBook = createParamDecorator(
  (_data: unknown, context: ExecutionContext): LedgerBookEntity => {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.ledgerBook)
      throw new ForbiddenException('no ledger scope (LedgerScopeGuard must run first)');
    return req.ledgerBook;
  },
);
