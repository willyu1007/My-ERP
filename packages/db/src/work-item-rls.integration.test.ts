/**
 * Postgres RLS integration test for T-003 WorkItem / WorkItemEvent / OutboxEvent.
 * Proves org scope is mandatory, ledger scope applies to finance tasks, active
 * dedupe is DB-backed, and WorkItemEvent remains append-only for the app role.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  appendOutboxEventTx,
  claimWorkItemTx,
  createWorkItemTx,
  disconnectDatabase,
  getPrisma,
  listWorkItemsTx,
  withOptionalLedgerScope,
} from './index';

const TEST_DB = 'myerp_t003_work_item_rls_test';
const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';
const LB_A1 = '00000000-0000-0000-0000-0000000000a1';
const LB_A2 = '00000000-0000-0000-0000-0000000000a2';
const LB_B1 = '00000000-0000-0000-0000-0000000000b1';
const V_A1 = '00000000-0000-0000-0000-000000000101';
const V_A2 = '00000000-0000-0000-0000-000000000102';
const V_B1 = '00000000-0000-0000-0000-000000000201';

function itemInput(overrides: {
  orgId: string;
  ledgerBookId?: string | null;
  sourceId: string;
  dedupeKey: string;
  createdBy?: string;
}) {
  return {
    orgId: overrides.orgId,
    ledgerBookId: overrides.ledgerBookId ?? null,
    moduleKey: 'finance',
    workflowKey: 'daily-accounting',
    workflowVersion: 'v1',
    workItemType: 'voucher.review',
    sourceType: 'JournalVoucher',
    sourceId: overrides.sourceId,
    dedupeKey: overrides.dedupeKey,
    status: 'open',
    subStatus: 'pending_review',
    priority: 'normal',
    assignedRole: 'supervisor',
    createdBy: overrides.createdBy ?? 'maker-a',
    titleKey: 'finance.voucher.review',
    metadata: { sourceEntity: 'JournalVoucher' },
  };
}

async function allVisibleIds(orgId: string, ledgerBookId?: string | null): Promise<string[]> {
  const rows = await withOptionalLedgerScope(orgId, ledgerBookId, (tx) =>
    listWorkItemsTx(tx, {
      view: 'audit_readonly',
      actorId: 'auditor',
      roles: ['viewer'],
      includeClosed: true,
    }),
  );
  return rows.map((r) => r.id).sort();
}

describe.skipIf(!PG_AVAILABLE)(
  'Postgres RLS — work item kernel (org + optional ledger scoped)',
  () => {
    beforeAll(async () => {
      createTestDb(TEST_DB);
      psql(
        TEST_DB,
        `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "work_item" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "work_item_event" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "outbox_event" TO ${APP_ROLE};`,
      );
      psql(
        TEST_DB,
        `INSERT INTO "organization"(id,name) VALUES ('${ORG_A}','Org A'),('${ORG_B}','Org B');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A1}','${ORG_A}','A Book 1','CNY',2026),
         ('${LB_A2}','${ORG_A}','A Book 2','CNY',2026),
         ('${LB_B1}','${ORG_B}','B Book 1','CNY',2026);`,
      );
      process.env.DATABASE_URL = appDbUrl(TEST_DB);
      await disconnectDatabase();
    }, 60_000);

    afterAll(async () => {
      await disconnectDatabase();
      dropTestDb(TEST_DB);
    });

    it('separates org-only and ledger-scoped visibility', async () => {
      const orgOnly = await withOptionalLedgerScope(ORG_A, null, (tx) =>
        createWorkItemTx(
          tx,
          itemInput({
            orgId: ORG_A,
            ledgerBookId: null,
            sourceId: V_A1,
            dedupeKey: 'org-only-a',
          }),
        ),
      );
      const ledgerA1 = await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        createWorkItemTx(
          tx,
          itemInput({
            orgId: ORG_A,
            ledgerBookId: LB_A1,
            sourceId: V_A2,
            dedupeKey: 'ledger-a1',
          }),
        ),
      );
      await withOptionalLedgerScope(ORG_B, LB_B1, (tx) =>
        createWorkItemTx(
          tx,
          itemInput({
            orgId: ORG_B,
            ledgerBookId: LB_B1,
            sourceId: V_B1,
            dedupeKey: 'ledger-b1',
            createdBy: 'maker-b',
          }),
        ),
      );

      expect(await allVisibleIds(ORG_A, null)).toEqual([orgOnly.id]);
      expect(await allVisibleIds(ORG_A, LB_A1)).toEqual([ledgerA1.id, orgOnly.id].sort());
      expect(await allVisibleIds(ORG_A, LB_A2)).toEqual([orgOnly.id]);
      expect(await allVisibleIds(ORG_B, LB_B1)).not.toContain(ledgerA1.id);
    });

    it('RLS hides all work items without an org scope', async () => {
      const rows = await getPrisma().workItem.findMany();
      expect(rows).toHaveLength(0);
    });

    it('WITH CHECK blocks cross-ledger finance task writes', async () => {
      await expect(
        withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
          createWorkItemTx(
            tx,
            itemInput({
              orgId: ORG_A,
              ledgerBookId: LB_A2,
              sourceId: '00000000-0000-0000-0000-000000000301',
              dedupeKey: 'cross-ledger',
            }),
          ),
        ),
      ).rejects.toThrow();
    });

    it('blocks duplicate active dedupe keys at the database layer', async () => {
      await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        createWorkItemTx(
          tx,
          itemInput({
            orgId: ORG_A,
            ledgerBookId: LB_A1,
            sourceId: '00000000-0000-0000-0000-000000000401',
            dedupeKey: 'duplicate-active',
          }),
        ),
      );

      await expect(
        withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
          tx.workItem.create({
            data: itemInput({
              orgId: ORG_A,
              ledgerBookId: LB_A1,
              sourceId: '00000000-0000-0000-0000-000000000402',
              dedupeKey: 'duplicate-active',
            }),
          }),
        ),
      ).rejects.toThrow();
    });

    it('keeps claim generic by preserving the existing subStatus', async () => {
      const created = await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        createWorkItemTx(tx, {
          ...itemInput({
            orgId: ORG_A,
            ledgerBookId: LB_A1,
            sourceId: '00000000-0000-0000-0000-000000000451',
            dedupeKey: 'claim-preserves-substatus',
          }),
          subStatus: 'pending_external',
        }),
      );

      const claimed = await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        claimWorkItemTx(tx, created.id, 'supervisor-a', created.version),
      );
      expect(claimed?.status).toBe('claimed');
      expect(claimed?.subStatus).toBe('pending_external');
    });

    it('limits work item list size', async () => {
      await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        createWorkItemTx(
          tx,
          itemInput({
            orgId: ORG_A,
            ledgerBookId: LB_A1,
            sourceId: '00000000-0000-0000-0000-000000000461',
            dedupeKey: 'limit-a',
          }),
        ),
      );
      await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        createWorkItemTx(
          tx,
          itemInput({
            orgId: ORG_A,
            ledgerBookId: LB_A1,
            sourceId: '00000000-0000-0000-0000-000000000462',
            dedupeKey: 'limit-b',
          }),
        ),
      );

      const rows = await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        listWorkItemsTx(tx, {
          view: 'audit_readonly',
          actorId: 'auditor',
          roles: ['viewer'],
          includeClosed: true,
          limit: 1,
        }),
      );
      expect(rows).toHaveLength(1);
    });

    it('does not grant update/delete on append-only work item events', async () => {
      const item = await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        createWorkItemTx(
          tx,
          itemInput({
            orgId: ORG_A,
            ledgerBookId: LB_A1,
            sourceId: '00000000-0000-0000-0000-000000000501',
            dedupeKey: 'append-only-event',
          }),
        ),
      );

      await expect(
        withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
          tx.workItemEvent.updateMany({
            where: { workItemId: item.id },
            data: { eventType: 'tampered' },
          }),
        ),
      ).rejects.toThrow();
      await expect(
        withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
          tx.workItemEvent.deleteMany({ where: { workItemId: item.id } }),
        ),
      ).rejects.toThrow();
    });

    it('scopes outbox events by org and ledger', async () => {
      const item = await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        createWorkItemTx(
          tx,
          itemInput({
            orgId: ORG_A,
            ledgerBookId: LB_A1,
            sourceId: '00000000-0000-0000-0000-000000000601',
            dedupeKey: 'outbox-scope',
          }),
        ),
      );
      await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        appendOutboxEventTx(tx, {
          orgId: ORG_A,
          ledgerBookId: LB_A1,
          workItemId: item.id,
          eventType: 'work_item.created',
          sourceType: 'JournalVoucher',
          sourceId: item.sourceId,
          payload: { eventType: 'work_item.created', workItemId: item.id },
        }),
      );

      const inLedger = await withOptionalLedgerScope(ORG_A, LB_A1, (tx) =>
        tx.outboxEvent.findMany(),
      );
      const otherLedger = await withOptionalLedgerScope(ORG_A, LB_A2, (tx) =>
        tx.outboxEvent.findMany(),
      );
      expect(inLedger).toHaveLength(1);
      expect(otherLedger).toHaveLength(0);
    });
  },
);
