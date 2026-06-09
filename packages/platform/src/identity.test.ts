import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { IdentityError, MockIdentityProvider, signDevToken } from './identity';
import type { Identity } from './identity';

const SECRET = 'test-secret';
const identity: Identity = { userId: 'u1', orgId: 'o1', ledgerBookId: 'lb1', roles: ['accountant'] };

describe('MockIdentityProvider', () => {
  it('round-trips a signed dev token into an Identity', async () => {
    const token = signDevToken(identity, SECRET);
    const verified = await new MockIdentityProvider(SECRET).verify(token);
    expect(verified).toEqual(identity);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = signDevToken(identity, 'other-secret');
    await expect(new MockIdentityProvider(SECRET).verify(token)).rejects.toBeInstanceOf(IdentityError);
  });

  it('rejects a token missing tenant scope (no ledgerBookId)', async () => {
    const bad = jwt.sign({ sub: 'u1', orgId: 'o1', roles: ['accountant'] }, SECRET, { algorithm: 'HS256' });
    await expect(new MockIdentityProvider(SECRET).verify(bad)).rejects.toBeInstanceOf(IdentityError);
  });

  it('rejects a token with an unknown role', async () => {
    const bad = jwt.sign(
      { sub: 'u1', orgId: 'o1', ledgerBookId: 'lb1', roles: ['wizard'] },
      SECRET,
      { algorithm: 'HS256' },
    );
    await expect(new MockIdentityProvider(SECRET).verify(bad)).rejects.toBeInstanceOf(IdentityError);
  });
});
