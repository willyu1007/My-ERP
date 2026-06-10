import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import type { AuthedRequest } from './request-context';

/** Inject the verified {@link Identity} attached by AuthGuard into a handler param. */
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Identity => {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.identity) throw new UnauthorizedException('no identity on request');
    return req.identity;
  },
);
