/**
 * T-008 R4 — proves the WorkItem task kernel is MODULE-AGNOSTIC: a non-finance
 * module (here a fictitious 采购/procurement workflow) can register and drive work
 * items through the same generic repos, with no finance vocabulary in the kernel.
 * The finance specifics (voucher/payment) live in apps/api adapters, never here.
 * This is the isolation guarantee R4 asks for; a real second module + multi-module
 * nav are deferred until one actually exists.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  claimWorkItemTx,
  createWorkItemTx,
  getWorkItemTx,
  listWorkItemsTx,
  withOptionalLedgerScope,
} from './index';

const TEST_DB = 'myerp_t008_kernel_generic_test';
const ORG = '00000000-0000-0000-0000-000000000a08';

// A non-finance work item — nothing in this input is finance-specific.
const procurementItem = {
  orgId: ORG,
  ledgerBookId: null, // org-scoped (not ledger-bound) — a non-finance module
  moduleKey: 'procurement',
  workflowKey: 'purchase-approval',
  workflowVersion: 'v1',
  workItemType: 'purchase.request.approve',
  sourceType: 'PurchaseRequest',
  sourceId: '00000000-0000-0000-0000-0000000a0801',
  dedupeKey: 'procurement:purchase-approval:purchase.request.approve:req-1',
  status: 'open',
  subStatus: 'pending_review',
  priority: 'normal',
  assignedRole: 'buyer',
  createdBy: 'u-buyer',
  titleKey: 'procurement.purchase.approve',
  metadata: { sourceEntity: 'PurchaseRequest' },
};

describe.skipIf(!PG_AVAILABLE)('T-008 — WorkItem kernel is module-agnostic', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "work_item" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "work_item_event" TO ${APP_ROLE};`,
    );
    psql(TEST_DB, `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org Proc');`);
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
  }, 60_000);

  afterAll(async () => {
    dropTestDb(TEST_DB);
  });

  it('registers + claims a non-finance work item through the generic repos', async () => {
    const created = await withOptionalLedgerScope(ORG, null, (tx) =>
      createWorkItemTx(tx, procurementItem),
    );
    // The kernel stored the module's own vocabulary verbatim — no finance assumptions.
    expect(created.moduleKey).toBe('procurement');
    expect(created.workItemType).toBe('purchase.request.approve');
    expect(created.sourceType).toBe('PurchaseRequest');
    expect(created.assignedRole).toBe('buyer');
    expect(created.ledgerBookId).toBeNull();

    // It surfaces through the generic role-queue view for the buyer role…
    const queue = await withOptionalLedgerScope(ORG, null, (tx) =>
      listWorkItemsTx(tx, { view: 'role_queue', actorId: 'someone', roles: ['buyer'] }),
    );
    expect(queue.map((w) => w.id)).toContain(created.id);

    // …and the generic claim transition works the same as for any module.
    const claimed = await withOptionalLedgerScope(ORG, null, (tx) =>
      claimWorkItemTx(tx, created.id, 'u-buyer-2', created.version),
    );
    expect(claimed?.status).toBe('claimed');
    expect(claimed?.assigneeUserId).toBe('u-buyer-2');

    const fetched = await withOptionalLedgerScope(ORG, null, (tx) => getWorkItemTx(tx, created.id));
    expect(fetched?.workItemType).toBe('purchase.request.approve'); // round-trips unchanged
  });
});
