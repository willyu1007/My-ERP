import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { IdentityError, MockIdentityProvider, signDevToken } from './identity';
import type { Principal } from './identity';

const SECRET = 'test-secret';
const principal: Principal = {
  userId: 'u1',
  orgId: 'o1',
  ledgerBookId: 'lb1',
  email: 'a@example.com',
};

describe('MockIdentityProvider', () => {
  it('round-trips a signed dev token into a Principal (no roles in token)', async () => {
    const token = signDevToken(principal, SECRET);
    const verified = await new MockIdentityProvider(SECRET).verify(token);
    expect(verified).toEqual(principal);
  });

  it('omits optional ledgerBookId/email when not provided', async () => {
    const token = signDevToken({ userId: 'u1', orgId: 'o1' }, SECRET);
    const verified = await new MockIdentityProvider(SECRET).verify(token);
    expect(verified).toEqual({ userId: 'u1', orgId: 'o1' });
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = signDevToken(principal, 'other-secret');
    await expect(new MockIdentityProvider(SECRET).verify(token)).rejects.toBeInstanceOf(
      IdentityError,
    );
  });

  it('rejects a token missing the org (tenant) claim', async () => {
    const bad = jwt.sign({ sub: 'u1' }, SECRET, { algorithm: 'HS256' });
    await expect(new MockIdentityProvider(SECRET).verify(bad)).rejects.toBeInstanceOf(
      IdentityError,
    );
  });
});
