import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MockIdentityProvider, signDevToken, type Identity, type Principal } from '@my-erp/platform';
import { AuthGuard } from './auth.guard';
import type { IdentityResolver } from './identity-resolver';
import type { AuthedRequest } from './request-context';

const SECRET = 'test-secret';
const principal: Principal = { userId: 'u1', orgId: 'o1', ledgerBookId: 'lb1' };

// Stub resolver — roles come from Membership in production; here we fix them.
const stubResolver: IdentityResolver = {
  resolve: async (p: Principal): Promise<Identity> => ({ ...p, roles: ['accountant'] }),
};

function contextFor(headers: Record<string, string>): { req: AuthedRequest; ctx: ExecutionContext } {
  const req = { headers } as unknown as AuthedRequest;
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { req, ctx };
}

describe('AuthGuard (authentication + identity resolution)', () => {
  const guard = new AuthGuard(new MockIdentityProvider(SECRET), stubResolver);

  it('rejects a request with no bearer token (401)', async () => {
    const { ctx } = contextFor({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid token (401)', async () => {
    const { ctx } = contextFor({ authorization: 'Bearer not-a-jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid token and attaches the resolved identity + traceId', async () => {
    const { req, ctx } = contextFor({ authorization: `Bearer ${signDevToken(principal, SECRET)}` });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.identity?.userId).toBe('u1');
    expect(req.identity?.roles).toEqual(['accountant']);
    expect(typeof req.traceId).toBe('string');
  });
});
