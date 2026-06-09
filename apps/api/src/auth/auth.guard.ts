import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { newTraceId, type IdentityProvider } from '@my-erp/platform';
import { IDENTITY_PROVIDER } from './identity.provider';
import type { AuthedRequest } from './request-context';

/**
 * Authentication — verifies the bearer token into an Identity and attaches it
 * (+ a traceId) to the request. 401 when the token is missing or invalid.
 * Must run before {@link PermissionGuard}.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    req.traceId = req.traceId ?? newTraceId();

    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    try {
      req.identity = await this.identityProvider.verify(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
    return true;
  }
}
