/**
 * Dev seed for the live `/v1` path (T-004). Idempotently creates one
 * organization / ledger book / membership and a few leaf accounts, then mints an
 * `API_DEV_TOKEN` the MockIdentityProvider accepts (HS256, AUTH_DEV_SECRET).
 *
 *   pnpm infra:up && pnpm db:deploy && pnpm dev:seed
 *   export API_DEV_TOKEN=...   # from the output; then start api + web
 *
 * Connects as the DATABASE_URL user (the docker owner bypasses RLS — fine for a
 * single-tenant dev box; RLS isolation is covered by the integration tests).
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env (KEY=VALUE) without a dependency; never override the real environment.
for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const ORG = '11111111-1111-1111-1111-111111111111';
const LB = '22222222-2222-2222-2222-222222222222';
const USER = 'dev-user';

const ACCOUNTS = [
  { code: '1001', name: '库存现金', category: 'asset', direction: 'debit' },
  { code: '1002', name: '银行存款', category: 'asset', direction: 'debit' },
  { code: '1122', name: '应收账款', category: 'asset', direction: 'debit' },
  { code: '2202', name: '应付账款', category: 'liability', direction: 'credit' },
  { code: '4001', name: '实收资本', category: 'equity', direction: 'credit' },
  { code: '4103', name: '本年利润', category: 'equity', direction: 'credit' },
  { code: '4104', name: '利润分配', category: 'equity', direction: 'credit' },
  { code: '6001', name: '主营业务收入', category: 'profitLoss', direction: 'credit' },
  { code: '6601', name: '销售费用', category: 'profitLoss', direction: 'debit' },
];

function mintToken() {
  const secret = process.env.AUTH_DEV_SECRET;
  if (!secret) throw new Error('AUTH_DEV_SECRET is not set');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub: USER, orgId: ORG, ledgerBookId: LB, iat: now, exp: now + 86400 });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const prisma = new PrismaClient();
try {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: 'Dev Org' },
  });
  await prisma.ledgerBook.upsert({
    where: { id: LB },
    update: { singlePersonMode: true },
    // single-person mode so the one dev user can post their own vouchers (demo).
    create: {
      id: LB,
      orgId: ORG,
      name: 'Dev Book',
      baseCurrency: 'CNY',
      fiscalYear: 2026,
      singlePersonMode: true,
    },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG, userId: USER } },
    update: { role: 'admin' },
    create: { orgId: ORG, userId: USER, role: 'admin', email: 'dev@example.com' },
  });
  for (const a of ACCOUNTS) {
    await prisma.account.upsert({
      where: { ledgerBookId_code: { ledgerBookId: LB, code: a.code } },
      update: {},
      create: {
        ledgerBookId: LB,
        code: a.code,
        name: a.name,
        category: a.category,
        direction: a.direction,
        level: 1,
        isLeaf: true,
        active: true,
      },
    });
  }

  console.log('[seed] org/ledger/membership + %d accounts ready', ACCOUNTS.length);
  console.log(`[seed] orgId=${ORG} ledgerBookId=${LB} user=${USER} role=admin`);
  console.log(`API_DEV_TOKEN=${mintToken()}`);
} finally {
  await prisma.$disconnect();
}
