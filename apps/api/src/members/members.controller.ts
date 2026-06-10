import { Controller, Get, UseGuards } from '@nestjs/common';
import { listMembershipsTx, withOrgScope } from '@my-erp/db';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';

/** Organization members (admin/supervisor — read Membership). */
@Controller('members')
@UseGuards(AuthGuard, PermissionGuard)
export class MembersController {
  @Get()
  @RequirePermission('read', 'Membership')
  async list(@CurrentIdentity() identity: Identity) {
    return withOrgScope(identity.orgId, (tx) => listMembershipsTx(tx));
  }
}
