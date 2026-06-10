import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { Identity, Role } from '@my-erp/platform';
import { PermissionGuard } from './permission.guard';
import type { RequiredPermission } from './permission.decorator';
import type { AuthedRequest } from './request-context';

function guardWith(required: RequiredPermission | undefined): PermissionGuard {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new PermissionGuard(reflector);
}

function contextFor(identity?: Identity): ExecutionContext {
  const req = { identity } as AuthedRequest;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => null,
    getClass: () => null,
  } as unknown as ExecutionContext;
}

const id = (roles: Role[]): Identity => ({ userId: 'u1', orgId: 'o1', ledgerBookId: 'lb1', roles });

describe('PermissionGuard (authorization)', () => {
  it('allows when the route requires no permission', () => {
    expect(guardWith(undefined).canActivate(contextFor(id(['viewer'])))).toBe(true);
  });

  it('allows when the ability grants it (viewer read LedgerBook → 200)', () => {
    expect(
      guardWith({ action: 'read', subject: 'LedgerBook' }).canActivate(contextFor(id(['viewer']))),
    ).toBe(true);
  });

  it('forbids a high-sensitivity op the role lacks (viewer post Voucher → 403)', () => {
    expect(() =>
      guardWith({ action: 'post', subject: 'Voucher' }).canActivate(contextFor(id(['viewer']))),
    ).toThrow(ForbiddenException);
  });

  it('allows a high-sensitivity op for an entitled role (accountant post Voucher)', () => {
    expect(
      guardWith({ action: 'post', subject: 'Voucher' }).canActivate(contextFor(id(['accountant']))),
    ).toBe(true);
  });
});
