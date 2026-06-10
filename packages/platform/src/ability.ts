import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { Identity, Role } from './identity';

/** High-sensitivity ops (post/reverse/approve) are first-class actions so
 *  operation-level authz + SoD can grant/withhold them independently of CRUD. */
export type Action = 'manage' | 'create' | 'read' | 'update' | 'post' | 'reverse' | 'approve';
export type Subject =
  | 'all'
  | 'Organization'
  | 'LedgerBook'
  | 'Account'
  | 'Voucher'
  | 'AuditRecord'
  | 'Membership';

export type AppAbility = MongoAbility<[Action, Subject]>;

/**
 * Role → ability matrix (RBAC + 操作级 + 账套级)。每条授权都用 `ledgerBookId`
 * 条件钉死在调用者账套（应用层作用域；Postgres RLS 兜底）。SoD：会计制单不可审核，
 * 主管审核不可制单——实例级「制单人≠审核人」在 P3 服务层强制。
 */
export function defineAbilityFor(identity: Identity): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  const scope = { ledgerBookId: identity.ledgerBookId };
  const has = (role: Role): boolean => identity.roles.includes(role);

  if (has('admin')) {
    can('manage', 'all', scope);
  }
  if (has('viewer')) {
    can('read', ['Organization', 'LedgerBook', 'Account', 'Voucher', 'AuditRecord'], scope);
  }
  if (has('accountant')) {
    can('read', ['Organization', 'LedgerBook', 'Account', 'Voucher', 'AuditRecord'], scope);
    can(['create', 'update'], ['Account', 'Voucher'], scope);
    can('post', 'Voucher', scope);
    can('reverse', 'Voucher', scope);
  }
  if (has('cashier')) {
    can('read', ['Organization', 'LedgerBook', 'Account', 'Voucher'], scope);
    can(['create', 'update'], 'Voucher', scope);
  }
  if (has('supervisor')) {
    can('read', ['Organization', 'LedgerBook', 'Account', 'Voucher', 'AuditRecord'], scope);
    can(['create', 'update'], 'LedgerBook', scope);
    can(['create', 'read'], 'Membership', scope); // invite + manage members
    can('approve', 'Voucher', scope);
    can('post', 'Voucher', scope);
  }

  return build();
}
