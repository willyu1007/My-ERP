import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defineAbilityFor } from '@my-erp/platform';
import { PERMISSION_KEY, type RequiredPermission } from './permission.decorator';
import type { AuthedRequest } from './request-context';

/**
 * Authorization — builds a CASL ability from the request identity and checks the
 * route's declared permission. 403 when denied. Operation-level (post/reverse/
 * approve) and ledger-scope conditions live in the ability matrix.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.identity) {
      throw new ForbiddenException('no identity on request (AuthGuard must run first)');
    }
    const ability = defineAbilityFor(req.identity);
    if (!ability.can(required.action, required.subject)) {
      throw new ForbiddenException(`missing permission: ${required.action} ${required.subject}`);
    }
    return true;
  }
}
