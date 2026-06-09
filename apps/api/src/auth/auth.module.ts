import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { IDENTITY_PROVIDER, identityProviderFactory } from './identity.provider';
import { IDENTITY_RESOLVER, MembershipIdentityResolver } from './identity-resolver';
import { PermissionGuard } from './permission.guard';

/**
 * Auth infrastructure: identity provider + role resolver + authn/authz guards.
 * Exports the DI tokens too — Nest instantiates @UseGuards guards in the
 * consuming controller's module context, so the guards' deps must be visible there.
 */
@Module({
  providers: [
    identityProviderFactory,
    { provide: IDENTITY_RESOLVER, useClass: MembershipIdentityResolver },
    AuthGuard,
    PermissionGuard,
  ],
  exports: [AuthGuard, PermissionGuard, IDENTITY_PROVIDER, IDENTITY_RESOLVER],
})
export class AuthModule {}
