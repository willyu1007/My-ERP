/**
 * Service-level integration test for T-005 (contract MVP, C4). Drives the real
 * ContractsService against a live Postgres: CRUD + code generation + version-guarded
 * status machine, and the timeline read-model (contract event ∪ linked vouchers ∪
 * payments, contract anchored first then docs by date). Skips without a test Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  APP_ROLE,
  PG_AVAILABLE,
  appDbUrl,
  createTestDb,
  dropTestDb,
  psql,
} from '../../../../packages/db/src/test-pg';
import {
  createPaymentDocTx,
  createVoucherTx,
  disconnectDatabase,
  withLedgerScope,
} from '@my-erp/db';
import type { Identity } from '@my-erp/platform';
import { ContractsService } from './contracts.service';

const TEST_DB = 'myerp_t005_contracts_test';
const ORG = '00000000-0000-0000-0000-00000000000f';
const LB = '00000000-0000-0000-0000-0000000000f1';
const u1: Identity = { userId: 'u1', orgId: ORG, ledgerBookId: LB, roles: [] };

const contracts = new ContractsService();

describe.skipIf(!PG_AVAILABLE)('T-005 contracts (service integration)', () => {
  beforeAll(async () => {
    createTestDb(TEST_DB);
    psql(
      TEST_DB,
      `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
       GRANT SELECT ON "organization", "ledger_book" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "contract" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "journal_voucher" TO ${APP_ROLE};
       GRANT SELECT, INSERT, DELETE ON "journal_entry_line" TO ${APP_ROLE};
       GRANT SELECT, INSERT, UPDATE ON "payment_doc" TO ${APP_ROLE};
       GRANT SELECT, INSERT ON "audit_record" TO ${APP_ROLE};`,
    );
    psql(
      TEST_DB,
      `INSERT INTO "organization"(id,name) VALUES ('${ORG}','Org F');
       INSERT INTO "ledger_book"(id,org_id,name,base_currency,fiscal_year) VALUES
         ('${LB}','${ORG}','F Book','CNY',2026);`,
    );
    process.env.DATABASE_URL = appDbUrl(TEST_DB);
    await disconnectDatabase();
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    dropTestDb(TEST_DB);
  });

  it('creates with an auto code, walks draft→active→closed, and blocks closed edits + stale versions', async () => {
    const c = await contracts.create(u1, LB, {
      title: '年度供货合同',
      type: 'sales',
      counterparty: '某客户',
      amount: '50000.00',
    });
    expect(c.code).toBe('HT-2026-001');
    expect(c.status).toBe('draft');
    expect(c.amount).toBe('50000.00');

    const active = await contracts.update(u1, LB, c.id, {
      expectedVersion: c.version,
      status: 'active',
    });
    expect(active.status).toBe('active');
    expect(active.version).toBe(1);

    // stale version → conflict
    await expect(
      contracts.update(u1, LB, c.id, { expectedVersion: c.version, status: 'closed' }),
    ).rejects.toThrow();

    const closed = await contracts.update(u1, LB, c.id, {
      expectedVersion: active.version,
      status: 'closed',
    });
    expect(closed.status).toBe('closed');
    // closed is terminal
    await expect(
      contracts.update(u1, LB, c.id, { expectedVersion: closed.version, title: 'x' }),
    ).rejects.toThrow();
  });

  it('validates type and amount', async () => {
    await expect(contracts.create(u1, LB, { title: 'x', type: 'bogus' })).rejects.toThrow();
    await expect(contracts.create(u1, LB, { title: 'x', amount: 'abc' })).rejects.toThrow();
    await expect(contracts.create(u1, LB, { title: '' })).rejects.toThrow();
  });

  it('builds the timeline: contract anchored first, then linked vouchers + payments by date', async () => {
    const c = await contracts.create(u1, LB, {
      title: '时间线合同',
      type: 'sales',
      counterparty: 'X',
    });

    await withLedgerScope(LB, async (tx) => {
      await createVoucherTx(tx, {
        ledgerBookId: LB,
        no: '记-2026-06-002',
        date: '2026-06-15',
        period: '2026-06',
        summary: '尾款',
        maker: 'u1',
        totalDebit: '500.00',
        totalCredit: '500.00',
        contractId: c.id,
        lines: [
          {
            accountCode: '1002',
            accountName: '银行存款',
            summary: 'x',
            debit: '500.00',
            credit: null,
          },
          { accountCode: '6001', accountName: '收入', summary: 'x', debit: null, credit: '500.00' },
        ],
      });
      await createPaymentDocTx(tx, {
        ledgerBookId: LB,
        no: '收-2026-06-001',
        direction: 'receipt',
        date: '2026-06-12',
        period: '2026-06',
        counterparty: 'X',
        summary: '合同收款',
        amount: '500.00',
        cashAccountCode: '1002',
        contraAccountCode: '1122',
        maker: 'u1',
        contractId: c.id,
      });
    });

    const { contract, items } = await contracts.timeline(u1, LB, c.id);
    expect(contract.code).toBe(c.code);
    expect(items.map((i) => i.kind)).toEqual(['contract', 'payment', 'voucher']); // anchor, then 06-12, 06-15
    expect(items[0].title).toContain('合同建立');
    const payment = items.find((i) => i.kind === 'payment')!;
    expect(payment.refType).toBe('PaymentDoc');
    expect(payment.amount).toBe('500.00');
  });
});
