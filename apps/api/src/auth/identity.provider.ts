import type { Provider } from '@nestjs/common';
import { MockIdentityProvider, type IdentityProvider } from '@my-erp/platform';

/** DI token for the {@link IdentityProvider}. Swap the factory for real Logto later. */
export const IDENTITY_PROVIDER = 'IDENTITY_PROVIDER';

export const identityProviderFactory: Provider = {
  provide: IDENTITY_PROVIDER,
  useFactory: (): IdentityProvider => {
    const secret = process.env.AUTH_DEV_SECRET;
    if (!secret) {
      throw new Error('AUTH_DEV_SECRET is required for the P0b mock identity provider');
    }
    return new MockIdentityProvider(secret);
  },
};
