import { ForbiddenException, Injectable } from '@nestjs/common';
import { listMembershipRolesTx, withOrgScope } from '@my-erp/db';
import { isRole, type Identity, type Principal } from '@my-erp/platform';

/** DI token for the {@link IdentityResolver}. */
export const IDENTITY_RESOLVER = 'IDENTITY_RESOLVER';

/** Resolves a token Principal into a full Identity (roles from Membership). */
export interface IdentityResolver {
  resolve(principal: Principal): Promise<Identity>;
}

/**
 * Resolves roles from the user's Membership in the token's org — Membership is
 * the RBAC source of truth (邀请制授角色). A user with no membership in the
 * requested org is rejected (403), enforcing invitation-only access.
 */
@Injectable()
export class MembershipIdentityResolver implements IdentityResolver {
  async resolve(principal: Principal): Promise<Identity> {
    const roleStrings = await withOrgScope(principal.orgId, (tx) =>
      listMembershipRolesTx(tx, principal.userId),
    );
    const roles = roleStrings.filter(isRole);
    if (roles.length === 0) {
      throw new ForbiddenException('no membership in the requested organization');
    }
    return { ...principal, roles };
  }
}
