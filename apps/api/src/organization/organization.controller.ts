import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { getOrganizationTx, withOrgScope } from '@my-erp/db';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';

/** The caller's current organization (org-scoped read). */
@Controller('organization')
@UseGuards(AuthGuard, PermissionGuard)
export class OrganizationController {
  @Get()
  @RequirePermission('read', 'Organization')
  async current(@CurrentIdentity() identity: Identity) {
    const org = await withOrgScope(identity.orgId, (tx) => getOrganizationTx(tx, identity.orgId));
    if (!org) throw new NotFoundException('organization not found in scope');
    return org;
  }
}
