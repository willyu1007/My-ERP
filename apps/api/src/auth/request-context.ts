import type { Request } from 'express';
import type { LedgerBookEntity } from '@my-erp/db';
import type { Identity, Principal } from '@my-erp/platform';

/**
 * Express request augmented by the auth guards. `identity` (with roles) is set by
 * AuthGuard; `principal` (token only, no roles) is set by PrincipalGuard for
 * bootstrap endpoints (e.g. accepting an invitation before being a member).
 */
export interface AuthedRequest extends Request {
  identity?: Identity;
  principal?: Principal;
  /** The validated active ledger book id + entity, set by LedgerScopeGuard. */
  ledgerBookId?: string;
  ledgerBook?: LedgerBookEntity;
  traceId?: string;
}
