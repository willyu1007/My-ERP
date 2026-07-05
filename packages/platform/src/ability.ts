import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { Identity, Role } from './identity';

/** High-sensitivity ops (post/reverse/approve) are first-class actions so
 *  operation-level authz + SoD can grant/withhold them independently of CRUD. */
export type Action =
  | 'manage'
  | 'create'
  | 'read'
  | 'update'
  | 'post'
  | 'reverse'
  | 'approve'
  | 'claim'
  | 'complete'
  | 'return'
  | 'assign'
  | 'cancel';
export type Subject =
  | 'all'
  | 'Organization'
  | 'LedgerBook'
  | 'Account'
  | 'Voucher'
  | 'WorkItem'
  | 'Intake'
  | 'OutboxEvent'
  | 'AuditRecord'
  | 'Membership'
  | 'BusinessPartner';

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
    can(
      'read',
      ['Organization', 'LedgerBook', 'Account', 'Voucher', 'WorkItem', 'AuditRecord'],
      scope,
    );
    can('read', 'Intake', scope);
    can('read', 'BusinessPartner', scope);
  }
  if (has('accountant')) {
    can(
      'read',
      ['Organization', 'LedgerBook', 'Account', 'Voucher', 'WorkItem', 'AuditRecord'],
      scope,
    );
    can(['create', 'update'], ['Account', 'Voucher'], scope);
    can('post', 'Voucher', scope);
    can('reverse', 'Voucher', scope);
    can(['claim', 'complete', 'return'], 'WorkItem', scope);
    can(['create', 'read', 'update', 'cancel'], 'Intake', scope); // capture/draft/discard
    can(['create', 'read', 'update'], 'BusinessPartner', scope); // org-entered master (T-012 D10)
    can('read', 'Membership', scope); // roster for employee quick-select (T-012 D2)
  }
  if (has('cashier')) {
    can('read', ['Organization', 'LedgerBook', 'Account', 'Voucher', 'WorkItem'], scope);
    can(['create', 'update'], 'Voucher', scope);
    can(['claim', 'complete', 'return'], 'WorkItem', scope);
    can(['create', 'read', 'update', 'cancel'], 'Intake', scope);
    can(['create', 'read', 'update'], 'BusinessPartner', scope); // cashier adds payees at entry time
    can('read', 'Membership', scope); // roster for employee quick-select (T-012 D2)
  }
  if (has('supervisor')) {
    can(
      'read',
      ['Organization', 'LedgerBook', 'Account', 'Voucher', 'WorkItem', 'AuditRecord'],
      scope,
    );
    can(['create', 'update'], 'LedgerBook', scope);
    can(['create', 'read'], 'Membership', scope); // invite + manage members
    can('read', 'Intake', scope);
    can('approve', 'Voucher', scope);
    can('post', 'Voucher', scope);
    can(['claim', 'complete', 'return', 'assign', 'cancel'], 'WorkItem', scope);
    can(['create', 'read', 'update'], 'BusinessPartner', scope);
  }

  return build();
}
