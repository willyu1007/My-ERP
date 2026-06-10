import { createParamDecorator, type ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthedRequest } from './request-context';

/** Inject the validated active ledger book id resolved by LedgerScopeGuard. */
export const LedgerBookId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const req = context.switchToHttp().getRequest<AuthedRequest>();
  if (!req.ledgerBookId) throw new ForbiddenException('no ledger scope (LedgerScopeGuard must run first)');
  return req.ledgerBookId;
});
