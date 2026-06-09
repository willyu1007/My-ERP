import { SetMetadata } from '@nestjs/common';
import type { Action, Subject } from '@my-erp/platform';

export const PERMISSION_KEY = 'required_permission';

export interface RequiredPermission {
  readonly action: Action;
  readonly subject: Subject;
}

/** Declare the CASL permission a route requires; enforced by {@link PermissionGuard}. */
export const RequirePermission = (action: Action, subject: Subject) =>
  SetMetadata(PERMISSION_KEY, { action, subject } satisfies RequiredPermission);
