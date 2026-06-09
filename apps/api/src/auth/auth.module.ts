import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { IDENTITY_PROVIDER, identityProviderFactory } from './identity.provider';
import { PermissionGuard } from './permission.guard';

/**
 * Auth infrastructure: identity provider + authn/authz guards (P0b). Exports the
 * IDENTITY_PROVIDER token too, because Nest instantiates @UseGuards guards in the
 * consuming controller's module context — the token must be visible there.
 */
@Module({
  providers: [identityProviderFactory, AuthGuard, PermissionGuard],
  exports: [AuthGuard, PermissionGuard, IDENTITY_PROVIDER],
})
export class AuthModule {}
