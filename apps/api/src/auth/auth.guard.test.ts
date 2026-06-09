import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MockIdentityProvider, signDevToken, type Identity } from '@my-erp/platform';
import { AuthGuard } from './auth.guard';
import type { AuthedRequest } from './request-context';

const SECRET = 'test-secret';
const identity: Identity = { userId: 'u1', orgId: 'o1', ledgerBookId: 'lb1', roles: ['accountant'] };

function contextFor(headers: Record<string, string>): { req: AuthedRequest; ctx: ExecutionContext } {
  const req = { headers } as unknown as AuthedRequest;
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { req, ctx };
}

describe('AuthGuard (authentication)', () => {
  const guard = new AuthGuard(new MockIdentityProvider(SECRET));

  it('rejects a request with no bearer token (401)', async () => {
    const { ctx } = contextFor({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid token (401)', async () => {
    const { ctx } = contextFor({ authorization: 'Bearer not-a-jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid token and attaches identity + traceId', async () => {
    const { req, ctx } = contextFor({ authorization: `Bearer ${signDevToken(identity, SECRET)}` });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.identity).toEqual(identity);
    expect(typeof req.traceId).toBe('string');
  });
});
