import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Principal } from '@my-erp/platform';
import type { AuthedRequest } from './request-context';

/** Inject the token {@link Principal} attached by PrincipalGuard. */
export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): Principal => {
  const req = context.switchToHttp().getRequest<AuthedRequest>();
  if (!req.principal) throw new UnauthorizedException('no principal on request');
  return req.principal;
});
