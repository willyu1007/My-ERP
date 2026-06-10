/** Invitation state machine: pending → accepted | revoked | expired. */
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: '待接受',
  accepted: '已接受',
  revoked: '已撤销',
  expired: '已过期',
};

export interface AcceptableInvitation {
  readonly status: string;
  readonly invitedEmail: string;
  readonly expiresAt: Date;
}

/**
 * Pure guard for accepting an invitation — enforces the state machine + email
 * match. Returns an error message, or null when acceptable. Self-join is
 * impossible by construction: there is no membership-create path other than
 * accepting an invitation whose secret token + email both match.
 */
export function invitationAcceptError(
  invitation: AcceptableInvitation,
  email: string | undefined,
  now: Date,
): string | null {
  if (invitation.status !== 'pending') return `invitation is ${invitation.status}`;
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'invitation has expired';
  if (email === undefined || invitation.invitedEmail.toLowerCase() !== email.toLowerCase()) {
    return 'authenticated email does not match the invitation';
  }
  return null;
}

/**
 * Effective status for display — a still-pending invitation past its expiry reads
 * as `expired` without needing a background sweep (lazy expiry; accept already
 * rejects it via {@link invitationAcceptError}).
 */
export function invitationEffectiveStatus(
  invitation: { readonly status: string; readonly expiresAt: Date },
  now: Date,
): InvitationStatus | string {
  if (invitation.status === 'pending' && invitation.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return invitation.status;
}
