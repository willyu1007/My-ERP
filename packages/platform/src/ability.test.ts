import { describe, expect, it } from 'vitest';
import { defineAbilityFor } from './ability';
import type { Identity, Role } from './identity';

const id = (roles: Role[]): Identity => ({ userId: 'u1', orgId: 'o1', ledgerBookId: 'lb1', roles });

describe('CASL abilities (RBAC + operation-level + SoD)', () => {
  it('accountant can create/post/reverse vouchers', () => {
    const a = defineAbilityFor(id(['accountant']));
    expect(a.can('create', 'Voucher')).toBe(true);
    expect(a.can('post', 'Voucher')).toBe(true);
    expect(a.can('reverse', 'Voucher')).toBe(true);
  });

  it('SoD: accountant (maker) cannot approve; supervisor can', () => {
    expect(defineAbilityFor(id(['accountant'])).can('approve', 'Voucher')).toBe(false);
    expect(defineAbilityFor(id(['supervisor'])).can('approve', 'Voucher')).toBe(true);
  });

  it('viewer is read-only', () => {
    const a = defineAbilityFor(id(['viewer']));
    expect(a.can('read', 'Voucher')).toBe(true);
    expect(a.can('read', 'WorkItem')).toBe(true);
    expect(a.can('create', 'Voucher')).toBe(false);
    expect(a.can('post', 'Voucher')).toBe(false);
    expect(a.can('claim', 'WorkItem')).toBe(false);
  });

  it('admin manages all (within scope)', () => {
    const a = defineAbilityFor(id(['admin']));
    expect(a.can('manage', 'all')).toBe(true);
    expect(a.can('post', 'Voucher')).toBe(true);
  });

  it('cashier cannot post or reverse', () => {
    const a = defineAbilityFor(id(['cashier']));
    expect(a.can('create', 'Voucher')).toBe(true);
    expect(a.can('post', 'Voucher')).toBe(false);
    expect(a.can('reverse', 'Voucher')).toBe(false);
  });

  it('task operations are explicit and role-scoped', () => {
    const accountant = defineAbilityFor(id(['accountant']));
    expect(accountant.can('read', 'WorkItem')).toBe(true);
    expect(accountant.can('claim', 'WorkItem')).toBe(true);
    expect(accountant.can('complete', 'WorkItem')).toBe(true);
    expect(accountant.can('assign', 'WorkItem')).toBe(false);
    expect(accountant.can('cancel', 'WorkItem')).toBe(false);

    const supervisor = defineAbilityFor(id(['supervisor']));
    expect(supervisor.can('assign', 'WorkItem')).toBe(true);
    expect(supervisor.can('cancel', 'WorkItem')).toBe(true);
  });
});
