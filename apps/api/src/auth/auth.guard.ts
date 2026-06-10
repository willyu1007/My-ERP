import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { newTraceId, type IdentityProvider, type Principal } from '@my-erp/platform';
import { IDENTITY_PROVIDER } from './identity.provider';
import { IDENTITY_RESOLVER, type IdentityResolver } from './identity-resolver';
import type { AuthedRequest } from './request-context';

/**
 * Authentication + identity resolution — verifies the bearer token into a
 * Principal (401 if missing/invalid), then resolves the full Identity (roles from
 * Membership; 403 if the user has no membership in the org) and attaches it +
 * a traceId to the request. Must run before {@link PermissionGuard}.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
    @Inject(IDENTITY_RESOLVER) private readonly resolver: IdentityResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    req.traceId = req.traceId ?? newTraceId();

    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    let principal: Principal;
    try {
      principal = await this.identityProvider.verify(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
    // Throws ForbiddenException (403) when the user has no membership in the org.
    req.identity = await this.resolver.resolve(principal);
    return true;
  }
}
