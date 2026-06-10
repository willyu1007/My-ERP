import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './request-context';

/** Inject the per-request traceId attached by AuthGuard (for log correlation). */
export const TraceId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    return context.switchToHttp().getRequest<AuthedRequest>().traceId;
  },
);
