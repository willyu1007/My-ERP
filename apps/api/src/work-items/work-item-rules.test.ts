import { describe, expect, it } from 'vitest';
import type { Identity, Role } from '@my-erp/platform';
import type { WorkItemEntity } from '@my-erp/db';
import {
  availableWorkItemActions,
  canUseAuditReadonlyView,
  canViewWorkItem,
} from './work-item-rules';

const identity = (roles: Role[], patch: Partial<Identity> = {}): Identity => ({
  userId: 'user-a',
  orgId: 'org-a',
  ledgerBookId: 'ledger-a',
  roles,
  ...patch,
});

const item = (patch: Partial<WorkItemEntity> = {}): WorkItemEntity => ({
  id: 'work-a',
  orgId: 'org-a',
  ledgerBookId: 'ledger-a',
  moduleKey: 'finance',
  workflowKey: 'daily-accounting',
  workflowVersion: 'v1',
  workItemType: 'voucher.review',
  sourceType: 'JournalVoucher',
  sourceId: 'voucher-a',
  dedupeKey: 'dedupe-a',
  status: 'open',
  subStatus: 'pending_review',
  priority: 'normal',
  assignedRole: 'supervisor',
  assigneeUserId: null,
  claimedAt: null,
  availableAt: new Date('2026-06-13T00:00:00.000Z'),
  dueAt: null,
  completedAt: null,
  canceledAt: null,
  createdBy: 'maker-a',
  completedBy: null,
  version: 1,
  titleKey: 'finance.voucher.review',
  metadata: null,
  createdAt: new Date('2026-06-13T00:00:00.000Z'),
  updatedAt: new Date('2026-06-13T00:00:00.000Z'),
  ...patch,
});

describe('work item visibility and action rules', () => {
  it('does not let same-ledger users see unrelated role tasks by id', () => {
    expect(canViewWorkItem(item(), identity(['accountant']))).toBe(false);
    expect(canViewWorkItem(item(), identity(['supervisor']))).toBe(true);
  });

  it('allows created-by and handled-by visibility without actionability', () => {
    const created = item({ createdBy: 'user-a' });
    expect(canViewWorkItem(created, identity(['accountant']))).toBe(true);
    expect(availableWorkItemActions({ item: created, identity: identity(['accountant']) })).toEqual(
      [],
    );

    expect(canViewWorkItem(item(), identity(['accountant']), true)).toBe(true);
  });

  it('keeps audit readonly restricted to supervisor/admin capability', () => {
    expect(canUseAuditReadonlyView(identity(['viewer']))).toBe(false);
    expect(canUseAuditReadonlyView(identity(['supervisor']))).toBe(true);
    expect(canUseAuditReadonlyView(identity(['admin']))).toBe(true);
  });

  it('shows complete only when the source voucher state and SoD allow it', () => {
    const supervisor = identity(['supervisor']);
    expect(
      availableWorkItemActions({
        item: item(),
        identity: supervisor,
        voucher: { status: 'pending', maker: 'maker-a' },
        ledger: { singlePersonMode: false },
      }),
    ).toEqual(['claim', 'complete', 'cancel']);

    expect(
      availableWorkItemActions({
        item: item(),
        identity: supervisor,
        voucher: { status: 'posted', maker: 'maker-a' },
        ledger: { singlePersonMode: false },
      }),
    ).toEqual(['claim', 'cancel']);
  });

  it('hides complete from the maker unless single-person mode is enabled', () => {
    const makerSupervisor = identity(['supervisor'], { userId: 'maker-a' });
    expect(
      availableWorkItemActions({
        item: item(),
        identity: makerSupervisor,
        voucher: { status: 'pending', maker: 'maker-a' },
        ledger: { singlePersonMode: false },
      }),
    ).toEqual(['claim', 'cancel']);

    expect(
      availableWorkItemActions({
        item: item(),
        identity: makerSupervisor,
        voucher: { status: 'pending', maker: 'maker-a' },
        ledger: { singlePersonMode: true },
      }),
    ).toEqual(['claim', 'complete', 'cancel']);
  });
});
