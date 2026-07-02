/**
 * Postgres RLS integration test for T-004 Intake / Attachment. Proves both are
 * org + ledger scoped, WITH CHECK blocks cross-ledger writes, no rows are visible
 * without a scope, and the version-guarded update makes extracted→drafted one-shot.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  createAttachmentTx,
  createIntakeTx,
  disconnectDatabase,
  getPrisma,
  listIntakesTx,
  updateIntakeTx,
  withScope,
} from './index';

const TEST_DB = 'myerp_t004_intake_rls_test';
const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';
const LB_A1 = '00000000-0000-0000-0000-0000000000a1';
const LB_A2 = '00000000-0000-0000-0000-0000000000a2';
const LB_B1 = '00000000-0000-0000-0000-0000000000b1';

function attInput(orgId: string, ledgerBookId: string) {
  return {
    orgId,
    ledgerBookId,
    storageKey: `obj/${ledgerBookId}/x`,
    contentType: 'image/png',
    byteSize: 1024,
    sha256: 'deadbeef',
    createdBy: 'accountant-a',
  };
}

function intakeInput(orgId: string, ledgerBookId: string) {
  return { orgId, ledgerBookId, kind: 'image', source: 'web', createdBy: 'accountant-a' };
}

describe.skipIf(!PG_AVAILABLE)('Postgres RLS — capture intake (org + ledger scoped)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "attachment" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "intake" TO ${APP_ROLE};`,
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

  it('isolates intakes by org + ledger', async () => {
    const a1 = await withScope(ORG_A, LB_A1, (tx) => createIntakeTx(tx, intakeInput(ORG_A, LB_A1)));
    await withScope(ORG_B, LB_B1, (tx) => createIntakeTx(tx, intakeInput(ORG_B, LB_B1)));

    const inA1 = await withScope(ORG_A, LB_A1, (tx) => listIntakesTx(tx));
    const inA2 = await withScope(ORG_A, LB_A2, (tx) => listIntakesTx(tx));

    expect(inA1.some((r) => r.id === a1.id)).toBe(true);
    expect(inA1.every((r) => r.orgId === ORG_A && r.ledgerBookId === LB_A1)).toBe(true);
    expect(inA2).toHaveLength(0);
  });

  it('hides intakes without a scope', async () => {
    expect(await getPrisma().intake.findMany()).toHaveLength(0);
  });

  it('WITH CHECK blocks cross-ledger intake writes', async () => {
    await expect(
      withScope(ORG_A, LB_A1, (tx) => createIntakeTx(tx, intakeInput(ORG_A, LB_A2))),
    ).rejects.toThrow();
  });

  it('stores an attachment and links it to an intake, isolated by ledger', async () => {
    const att = await withScope(ORG_A, LB_A1, (tx) =>
      createAttachmentTx(tx, attInput(ORG_A, LB_A1)),
    );
    const intake = await withScope(ORG_A, LB_A1, (tx) =>
      createIntakeTx(tx, { ...intakeInput(ORG_A, LB_A1), attachmentId: att.id }),
    );
    expect(intake.attachmentId).toBe(att.id);

    const otherLedger = await withScope(ORG_A, LB_A2, (tx) => tx.attachment.findMany());
    expect(otherLedger).toHaveLength(0);
  });

  it('version-guards the extracted→drafted transition (one-shot)', async () => {
    const intake = await withScope(ORG_A, LB_A1, (tx) =>
      createIntakeTx(tx, intakeInput(ORG_A, LB_A1)),
    );
    expect(intake.version).toBe(0);

    const first = await withScope(ORG_A, LB_A1, (tx) =>
      updateIntakeTx(tx, intake.id, { status: 'drafted', expectedVersion: 0 }),
    );
    expect(first?.status).toBe('drafted');
    expect(first?.version).toBe(1);

    const second = await withScope(ORG_A, LB_A1, (tx) =>
      updateIntakeTx(tx, intake.id, { status: 'drafted', expectedVersion: 0 }),
    );
    expect(second).toBeNull();
  });
});
