import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  appendAuditRecordTx,
  createInvitationTx,
  findInvitationByIdTx,
  listInvitationsTx,
  updateInvitationStatusTx,
  withOrgScope,
} from '@my-erp/db';
import {
  invitationEffectiveStatus,
  isRole,
  type Identity,
  type Principal,
  type Role,
} from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { PrincipalGuard } from '../auth/principal.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { InvitationService } from './invitation.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseInviteBody(body: unknown): { email: string; role: Role } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email.trim())) {
    throw new BadRequestException('a valid email is required');
  }
  if (!isRole(b.role)) throw new BadRequestException('role must be a valid finance role');
  return { email: b.email.trim(), role: b.role };
}

function parseAcceptBody(body: unknown): { token: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.token !== 'string' || b.token.trim() === '')
    throw new BadRequestException('token is required');
  return { token: b.token };
}

/**
 * Invitations (邀请制). Create/list/revoke are admin/supervisor (read/create
 * Membership); accept is authn-only (PrincipalGuard) because the invitee is not
 * yet a member. Self-join is impossible: membership is only created via accept.
 */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationService) {}

  @Post()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('create', 'Membership')
  async create(@CurrentIdentity() identity: Identity, @Body() body: unknown) {
    const { email, role } = parseInviteBody(body);
    return withOrgScope(identity.orgId, async (tx) => {
      const invitation = await createInvitationTx(tx, {
        orgId: identity.orgId,
        invitedEmail: email,
        role,
        invitedBy: identity.userId,
      });
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'CREATE_INVITATION',
        entityType: 'Invitation',
        entityId: invitation.id,
      });
      return invitation;
    });
  }

  @Get()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('read', 'Membership')
  async list(@CurrentIdentity() identity: Identity) {
    const invitations = await withOrgScope(identity.orgId, (tx) => listInvitationsTx(tx));
    const now = new Date();
    // Never expose the secret token in listings — it is delivered only via the
    // invite channel (email). The create response carries it for the demo only.
    // status reflects lazy expiry (a past-expiry pending invitation reads expired).
    return invitations.map((inv) => ({
      id: inv.id,
      orgId: inv.orgId,
      invitedEmail: inv.invitedEmail,
      role: inv.role,
      status: invitationEffectiveStatus(inv, now),
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt,
      acceptedBy: inv.acceptedBy,
      acceptedAt: inv.acceptedAt,
      createdAt: inv.createdAt,
    }));
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('create', 'Membership')
  async revoke(@CurrentIdentity() identity: Identity, @Param('id') id: string) {
    return withOrgScope(identity.orgId, async (tx) => {
      const invitation = await findInvitationByIdTx(tx, id);
      if (!invitation) throw new NotFoundException('invitation not found');
      if (invitation.status !== 'pending') {
        throw new BadRequestException(`cannot revoke a ${invitation.status} invitation`);
      }
      await updateInvitationStatusTx(tx, id, { status: 'revoked' });
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'REVOKE_INVITATION',
        entityType: 'Invitation',
        entityId: id,
      });
      return { id, status: 'revoked' };
    });
  }

  @Post('accept')
  @HttpCode(200)
  @UseGuards(PrincipalGuard)
  async accept(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    const { token } = parseAcceptBody(body);
    return this.invitations.accept(principal, token);
  }
}
