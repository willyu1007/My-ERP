import type { Request } from 'express';
import type { Identity } from '@my-erp/platform';

/** Express request augmented by AuthGuard with the verified identity + traceId. */
export interface AuthedRequest extends Request {
  identity?: Identity;
  traceId?: string;
}
