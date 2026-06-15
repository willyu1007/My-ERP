import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { WorkItemsService } from './work-items.service';

@Controller('work-items')
@UseGuards(AuthGuard, PermissionGuard)
export class WorkItemsController {
  constructor(private readonly service: WorkItemsService) {}

  @Get()
  @RequirePermission('read', 'WorkItem')
  async list(
    @CurrentIdentity() identity: Identity,
    @Query('view') view?: string,
    @Query('status') status?: string,
    @Query('sourceType') sourceType?: string,
    @Query('sourceId') sourceId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.list(identity, { view, status, sourceType, sourceId, limit, cursor });
  }

  @Get(':id')
  @RequirePermission('read', 'WorkItem')
  async detail(@CurrentIdentity() identity: Identity, @Param('id') id: string) {
    return this.service.detail(identity, id);
  }

  @Post(':id/actions/:actionKey')
  @HttpCode(200)
  @RequirePermission('read', 'WorkItem')
  async act(
    @CurrentIdentity() identity: Identity,
    @Param('id') id: string,
    @Param('actionKey') actionKey: string,
    @Body() body: unknown,
  ) {
    return this.service.act(identity, id, actionKey, body);
  }
}
