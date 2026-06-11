/**
 * Postgres RLS + CHECK integration test for P3 vouchers (ledger-scoped). Proves
 * cross-ledger isolation, that lines persist/round-trip, and that the DB CHECK
 * backstops 借贷必平 (a non-draft voucher cannot have unequal totals). Connects
 * as a NON-privileged role; skips without a reachable local Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, PG_AVAILABLE, appDbUrl, createTestDb, dropTestDb, psql } from './test-pg';
import {
  createReversalVoucherTx,
  createVoucherTx,
  disconnectDatabase,
  getPrisma,
  getVoucherTx,
  listVouchersTx,
  setVoucherStatusTx,
  withLedgerScope,
} from './index';

const TEST_DB = 'myerp_p3_rls_test';
const ORG = '00000000-0000-0000-0000-0000000000dd';
const LB_A = '00000000-0000-0000-0000-0000000a0001';
const LB_B = '00000000-0000-0000-0000-0000000b0002';

const balanced = (lb: string) => ({
  ledgerBookId: lb,
  no: '记-2026-001',
  date: '2026-06-01',
  period: '2026-06',
  summary: '收到投资',
  maker: 'u1',
  totalDebit: '500.00',
  totalCredit: '500.00',
  lines: [
    {
      accountCode: '1002',
      accountName: '银行存款',
      summary: '投资',
      debit: '500.00',
      credit: null,
    },
    {
      accountCode: '4001',
      accountName: '实收资本',
      summary: '投资',
      debit: null,
      credit: '500.00',
    },
  ],
});

describe.skipIf(!PG_AVAILABLE)('Postgres RLS + CHECK — journal voucher (ledger-scoped)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, DELETE ON "journal_entry_line" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB_A}','${ORG}','A','CNY',2026),('${LB_B}','${ORG}','B','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('creates a voucher with lines and isolates it by ledger', async () => {
    const v = await withLedgerScope(LB_A, (tx) => createVoucherTx(tx, balanced(LB_A)));
    expect(v.lines).toHaveLength(2);
    expect(v.totalDebit).toBe('500.00');
    expect(v.status).toBe('draft');

    const got = await withLedgerScope(LB_A, (tx) => getVoucherTx(tx, v.id));
    expect(got?.lines.map((l) => l.accountCode)).toEqual(['1002', '4001']);

    const inB = await withLedgerScope(LB_B, (tx) => listVouchersTx(tx));
    expect(inB).toHaveLength(0);
  });

  it('DB CHECK blocks moving an unbalanced voucher out of draft', async () => {
    const v = await withLedgerScope(LB_A, (tx) =>
      createVoucherTx(tx, {
        ...balanced(LB_A),
        no: '记-2026-002',
        totalDebit: '100.00',
        totalCredit: '50.00',
        lines: [
          { accountCode: '1001', accountName: '现金', summary: 'x', debit: '100.00', credit: null },
          { accountCode: '4001', accountName: '资本', summary: 'x', debit: null, credit: '50.00' },
        ],
      }),
    );
    // status='draft' is allowed unbalanced; flipping to pending must violate the CHECK.
    await expect(
      withLedgerScope(LB_A, (tx) => setVoucherStatusTx(tx, v.id, { status: 'pending' })),
    ).rejects.toThrow();
  });

  it('WITH CHECK blocks creating a voucher in another ledger', async () => {
    await expect(
      withLedgerScope(LB_A, (tx) => createVoucherTx(tx, { ...balanced(LB_B), no: '记-2026-003' })),
    ).rejects.toThrow();
  });

  it('without a ledger scope, RLS hides every voucher', async () => {
    expect(await getPrisma().journalVoucher.findMany()).toHaveLength(0);
  });

  it('reversal swaps debit/credit, posts, and links both ways', async () => {
    const original = await withLedgerScope(LB_A, async (tx) => {
      const v = await createVoucherTx(tx, { ...balanced(LB_A), no: '记-2026-010' });
      await setVoucherStatusTx(tx, v.id, { status: 'posted', checker: 'u2', postedAt: new Date() });
      return getVoucherTx(tx, v.id);
    });
    const reversal = await withLedgerScope(LB_A, async (tx) => {
      const r = await createReversalVoucherTx(tx, original!, {
        no: '记-2026-011',
        reverser: 'u2',
        date: original!.date,
        period: original!.period,
        postedAt: new Date(),
      });
      await setVoucherStatusTx(tx, original!.id, { status: 'reversed', reversedBy: r.id });
      return r;
    });

    expect(reversal.status).toBe('posted');
    expect(reversal.reversalOf).toBe(original!.id);
    // original line: debit 1002/500 → reversal: credit 1002/500
    const line = reversal.lines.find((l) => l.accountCode === '1002');
    expect(line?.debit).toBeNull();
    expect(line?.credit).toBe('500.00');

    const after = await withLedgerScope(LB_A, (tx) => getVoucherTx(tx, original!.id));
    expect(after?.status).toBe('reversed');
    expect(after?.reversedBy).toBe(reversal.id);
  });

  it('a voucher cannot be reversed twice (unique reversal_of guards concurrency)', async () => {
    const original = await withLedgerScope(LB_A, async (tx) => {
      const v = await createVoucherTx(tx, { ...balanced(LB_A), no: '记-2026-020' });
      await setVoucherStatusTx(tx, v.id, { status: 'posted', checker: 'u2', postedAt: new Date() });
      return getVoucherTx(tx, v.id);
    });
    const ctx = (no: string) => ({
      no,
      reverser: 'u2',
      date: original!.date,
      period: original!.period,
      postedAt: new Date(),
    });
    await withLedgerScope(LB_A, (tx) => createReversalVoucherTx(tx, original!, ctx('记-2026-021')));
    // A second reversal of the same original must violate the unique index.
    await expect(
      withLedgerScope(LB_A, (tx) => createReversalVoucherTx(tx, original!, ctx('记-2026-022'))),
    ).rejects.toThrow();
  });
});
