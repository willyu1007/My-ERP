import { createRequire } from 'node:module';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const { signDevToken } = require(join(repoRoot, 'packages/platform/dist/identity.js'));

const baseUrl = process.env.MY_ERP_API_URL ?? 'http://localhost:8000';
const secret = process.env.AUTH_DEV_SECRET;
if (!secret) {
  throw new Error('AUTH_DEV_SECRET must be loaded before running the smoke test');
}

const prisma = new PrismaClient();
const runId = `t003-e2e-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const orgId = randomUUID();
const users = {
  admin: `e2e-admin-${runId}`,
  accountant: `e2e-accountant-${runId}`,
  supervisor: `e2e-supervisor-${runId}`,
  viewer: `e2e-viewer-${runId}`,
};

function token(userId, ledgerBookId) {
  return signDevToken(
    {
      userId,
      orgId,
      ...(ledgerBookId ? { ledgerBookId } : {}),
      email: `${userId}@example.test`,
    },
    secret,
    '1h',
  );
}

function hasAction(workItem, action) {
  return Array.isArray(workItem.availableActions) && workItem.availableActions.includes(action);
}

async function request(label, method, path, bearer, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { label, status: res.status, data };
}

function expectStatus(result, expected) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(result.status)) {
    throw new Error(
      `${result.label} expected HTTP ${statuses.join('/')} but got ${result.status}: ${JSON.stringify(
        result.data,
      )}`,
    );
  }
  return result.data;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const checks = [];

  await prisma.organization.create({
    data: {
      id: orgId,
      name: `E2E Org ${runId}`,
      memberships: {
        create: [
          { userId: users.admin, role: 'admin', email: `${users.admin}@example.test` },
          {
            userId: users.accountant,
            role: 'accountant',
            email: `${users.accountant}@example.test`,
          },
          {
            userId: users.supervisor,
            role: 'supervisor',
            email: `${users.supervisor}@example.test`,
          },
          { userId: users.viewer, role: 'viewer', email: `${users.viewer}@example.test` },
        ],
      },
    },
  });
  checks.push('seeded org and invited members');

  const health = expectStatus(await request('health', 'GET', '/health'), 200);
  expect(health?.status === 'ok', 'health status must be ok');
  checks.push('health ok');

  const adminOrgToken = token(users.admin);
  const org = expectStatus(
    await request('current organization', 'GET', '/v1/organization', adminOrgToken),
    200,
  );
  expect(org?.id === orgId, 'current organization should match seeded org');
  checks.push('authenticated org scope');

  const ledger = expectStatus(
    await request('create ledger book', 'POST', '/v1/ledger-books', adminOrgToken, {
      name: `E2E Ledger ${runId}`,
      baseCurrency: 'CNY',
      fiscalYear: 2026,
      periodStructure: '12+1',
    }),
    201,
  );
  expect(typeof ledger?.id === 'string', 'ledger book id is required');
  const ledgerBookId = ledger.id;
  checks.push('ledger book created via API');

  const accountantToken = token(users.accountant, ledgerBookId);
  const supervisorToken = token(users.supervisor, ledgerBookId);
  const viewerToken = token(users.viewer, ledgerBookId);

  const seed = expectStatus(
    await request('seed standard chart', 'POST', '/v1/accounts/seed-standard', accountantToken),
    201,
  );
  expect(typeof seed?.seeded === 'number' && seed.seeded > 0, 'standard chart should seed accounts');
  checks.push('standard chart seeded via API');

  const accounts = expectStatus(
    await request('list accounts', 'GET', '/v1/accounts', accountantToken),
    200,
  );
  const debitAccount = accounts.find((account) => account.code === '1001' && account.isLeaf);
  const creditAccount = accounts.find((account) => account.code === '2202' && account.isLeaf);
  expect(debitAccount, 'leaf debit account 1001 should exist');
  expect(creditAccount, 'leaf credit account 2202 should exist');
  checks.push('leaf accounts loaded through ledger-scoped API');

  const voucher = expectStatus(
    await request('create balanced voucher', 'POST', '/v1/vouchers', accountantToken, {
      date: '2026-06-13',
      summary: `E2E smoke voucher ${runId}`,
      lines: [
        {
          accountCode: debitAccount.code,
          summary: 'E2E smoke',
          debit: '100.00',
        },
        {
          accountCode: creditAccount.code,
          summary: 'E2E smoke',
          credit: '100.00',
        },
      ],
    }),
    201,
  );
  expect(voucher?.status === 'draft', 'voucher should start as draft');
  expect(voucher?.totalDebit === '100.00' && voucher?.totalCredit === '100.00', 'voucher totals');
  const voucherId = voucher.id;
  checks.push('balanced draft voucher created via API');

  const submitted = expectStatus(
    await request('submit voucher', 'POST', `/v1/vouchers/${voucherId}/submit`, accountantToken),
    200,
  );
  expect(submitted?.status === 'pending', 'submitted voucher should be pending');
  checks.push('voucher submitted and review task emitted');

  const supervisorQueue = expectStatus(
    await request(
      'supervisor role queue',
      'GET',
      `/v1/work-items?view=role_queue&sourceType=JournalVoucher&sourceId=${voucherId}`,
      supervisorToken,
    ),
    200,
  );
  expect(Array.isArray(supervisorQueue) && supervisorQueue.length === 1, 'supervisor sees one task');
  let workItem = supervisorQueue[0];
  expect(workItem.status === 'open', 'work item should be open');
  expect(workItem.subStatus === 'pending_review', 'work item should be pending_review');
  expect(workItem.assignedRole === 'supervisor', 'work item should be assigned to supervisor');
  expect(hasAction(workItem, 'claim'), 'supervisor should be able to claim');
  expect(hasAction(workItem, 'complete'), 'supervisor should be able to complete before claim');
  const workItemId = workItem.id;
  checks.push('supervisor queue sees actionable review work item');

  const accountantQueue = expectStatus(
    await request(
      'accountant role queue negative',
      'GET',
      `/v1/work-items?view=role_queue&sourceType=JournalVoucher&sourceId=${voucherId}`,
      accountantToken,
    ),
    200,
  );
  expect(Array.isArray(accountantQueue) && accountantQueue.length === 0, 'accountant role queue empty');
  checks.push('negative role_queue visibility for accountant');

  expectStatus(
    await request('viewer audit view negative', 'GET', '/v1/work-items?view=audit_readonly', viewerToken),
    403,
  );
  checks.push('negative audit_readonly permission for viewer');

  expectStatus(
    await request(
      'missing expectedVersion negative',
      'POST',
      `/v1/work-items/${workItemId}/actions/claim`,
      supervisorToken,
      {},
    ),
    400,
  );
  checks.push('negative action body validation');

  const claimed = expectStatus(
    await request(
      'claim work item',
      'POST',
      `/v1/work-items/${workItemId}/actions/claim`,
      supervisorToken,
      { expectedVersion: workItem.version },
    ),
    200,
  );
  workItem = claimed.workItem;
  expect(workItem?.status === 'claimed', 'work item should be claimed');
  expect(workItem.assigneeUserId === users.supervisor, 'work item should be assigned to supervisor');
  expect(hasAction(workItem, 'complete'), 'claimed work item should still be completable');
  checks.push('work item claimed with optimistic version');

  const completed = expectStatus(
    await request(
      'complete work item',
      'POST',
      `/v1/work-items/${workItemId}/actions/complete`,
      supervisorToken,
      { expectedVersion: workItem.version },
    ),
    200,
  );
  expect(completed.workItem?.status === 'completed', 'work item should be completed');
  expect(completed.workItem?.subStatus === 'done', 'completed work item should be done');
  expect(completed.source?.status === 'posted', 'source voucher should be posted');
  expect(completed.source?.checker === users.supervisor, 'voucher checker should be supervisor');
  checks.push('work item completion posts voucher');

  const dbVoucher = await prisma.journalVoucher.findUnique({ where: { id: voucherId } });
  const dbWorkItem = await prisma.workItem.findUnique({ where: { id: workItemId } });
  const dbEvents = await prisma.workItemEvent.findMany({
    where: { workItemId },
    orderBy: { createdAt: 'asc' },
    select: { eventType: true, actionKey: true, fromStatus: true, toStatus: true, actorId: true },
  });
  const dbOutbox = await prisma.outboxEvent.findMany({
    where: { workItemId },
    orderBy: { createdAt: 'asc' },
    select: { eventType: true, sourceType: true, sourceId: true, status: true, payload: true },
  });

  expect(dbVoucher?.status === 'posted', 'db voucher should be posted');
  expect(dbVoucher?.checker === users.supervisor, 'db voucher checker should match');
  expect(dbWorkItem?.status === 'completed', 'db work item should be completed');
  expect(dbWorkItem?.completedBy === users.supervisor, 'db work item completedBy should match');
  expect(
    dbEvents.map((event) => event.eventType).join(',') ===
      'work_item.created,work_item.claimed,work_item.completed',
    'db work item events should record created, claimed, completed',
  );
  expect(
    dbOutbox.map((event) => event.eventType).join(',') ===
      'work_item.created,work_item.claimed,work_item.completed',
    'db outbox should record created, claimed, completed',
  );
  expect(
    dbOutbox.every(
      (event) =>
        event.sourceType === 'JournalVoucher' &&
        event.sourceId === voucherId &&
        event.status === 'pending' &&
        !JSON.stringify(event.payload).match(/100\.00|库存现金|应付账款|E2E smoke voucher/),
    ),
    'outbox payload must stay metadata-only',
  );
  checks.push('database side effects and metadata-only outbox verified');

  console.log(
    JSON.stringify(
      {
        runId,
        orgId,
        ledgerBookId,
        voucherId,
        workItemId,
        httpBaseUrl: baseUrl,
        finalVoucherStatus: dbVoucher?.status,
        finalWorkItemStatus: dbWorkItem?.status,
        eventTypes: dbEvents.map((event) => event.eventType),
        outboxEventTypes: dbOutbox.map((event) => event.eventType),
        checks,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
