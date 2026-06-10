import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  appendAuditRecordTx,
  createMembershipTx,
  findInvitationByTokenTx,
  listMembershipRolesTx,
  updateInvitationStatusTx,
  withOrgScope,
  type MembershipEntity,
} from '@my-erp/db';
import { invitationAcceptError, type Principal } from '@my-erp/platform';

/**
 * Invitation acceptance — the only path that creates a Membership (禁止自助加入).
 * Enforces the state machine + email match, blocks double-membership, and writes
 * the membership + flips the invitation to accepted atomically within one tx.
 */
@Injectable()
export class InvitationService {
  async accept(principal: Principal, token: string): Promise<MembershipEntity> {
    return withOrgScope(principal.orgId, async (tx) => {
      const invitation = await findInvitationByTokenTx(tx, token);
      if (!invitation) throw new NotFoundException('invitation not found');

      const error = invitationAcceptError(invitation, principal.email, new Date());
      if (error) throw new BadRequestException(error);

      const existing = await listMembershipRolesTx(tx, principal.userId);
      if (existing.length > 0) throw new ConflictException('already a member of this organization');

      const membership = await createMembershipTx(tx, {
        orgId: principal.orgId,
        userId: principal.userId,
        role: invitation.role,
        email: principal.email ?? null,
      });
      await updateInvitationStatusTx(tx, invitation.id, {
        status: 'accepted',
        acceptedBy: principal.userId,
        acceptedAt: new Date(),
      });
      await appendAuditRecordTx(tx, {
        actorId: principal.userId,
        action: 'ACCEPT_INVITATION',
        entityType: 'Invitation',
        entityId: invitation.id,
      });
      return membership;
    });
  }
}
