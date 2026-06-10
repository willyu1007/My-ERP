import type { Request } from 'express';
import type { Identity, Principal } from '@my-erp/platform';

/**
 * Express request augmented by the auth guards. `identity` (with roles) is set by
 * AuthGuard; `principal` (token only, no roles) is set by PrincipalGuard for
 * bootstrap endpoints (e.g. accepting an invitation before being a member).
 */
export interface AuthedRequest extends Request {
  identity?: Identity;
  principal?: Principal;
  traceId?: string;
}
