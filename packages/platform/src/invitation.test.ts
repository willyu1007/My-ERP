import { describe, expect, it } from 'vitest';
import { invitationAcceptError, type AcceptableInvitation } from './invitation';

const NOW = new Date('2026-06-10T00:00:00Z');
const base: AcceptableInvitation = {
  status: 'pending',
  invitedEmail: 'Alice@Example.com',
  expiresAt: new Date('2026-06-17T00:00:00Z'),
};

describe('invitationAcceptError (state machine + email match)', () => {
  it('accepts a pending, unexpired invitation with a matching email (case-insensitive)', () => {
    expect(invitationAcceptError(base, 'alice@example.com', NOW)).toBeNull();
  });

  it('rejects a non-pending invitation', () => {
    expect(invitationAcceptError({ ...base, status: 'revoked' }, 'alice@example.com', NOW)).toMatch(/revoked/);
    expect(invitationAcceptError({ ...base, status: 'accepted' }, 'alice@example.com', NOW)).toMatch(/accepted/);
  });

  it('rejects an expired invitation', () => {
    const expired = { ...base, expiresAt: new Date('2026-06-09T00:00:00Z') };
    expect(invitationAcceptError(expired, 'alice@example.com', NOW)).toMatch(/expired/);
  });

  it('rejects an email mismatch (and a missing email)', () => {
    expect(invitationAcceptError(base, 'bob@example.com', NOW)).toMatch(/does not match/);
    expect(invitationAcceptError(base, undefined, NOW)).toMatch(/does not match/);
  });
});
