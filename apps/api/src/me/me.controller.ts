import { Controller, Get, UseGuards } from '@nestjs/common';
import { isAccountingCapable, type Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';

/**
 * The caller's own identity + capabilities. Read-only, no operation-level permission
 * (everyone may read their own identity). The web uses `accountingCapable` to fork the
 * cashier-simple vs direct payment entry surfaces (T-012 Phase 3, D8) — the API still
 * enforces the fork server-side regardless of what the UI renders.
 */
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  @Get()
  async current(@CurrentIdentity() identity: Identity) {
    return {
      userId: identity.userId,
      orgId: identity.orgId,
      ledgerBookId: identity.ledgerBookId,
      roles: identity.roles,
      accountingCapable: isAccountingCapable(identity),
    };
  }
}
