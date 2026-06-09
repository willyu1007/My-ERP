import { PrismaClient, Prisma } from '@prisma/client';

/**
 * packages/db is the ONLY place allowed to import Prisma (hard constraint:
 * business/domain layers must not import Prisma). Repositories return plain
 * data; richer domain entities live in @my-erp/finance-domain.
 */

let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}

/** Lightweight DB liveness check for /health. */
export async function pingDatabase(): Promise<boolean> {
  await getPrisma().$queryRaw`SELECT 1`;
  return true;
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

/** Append-only audit record input (foundation for P0b authz/audit). */
export interface AuditRecordInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  ledgerBookId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

function auditData(input: AuditRecordInput) {
  return {
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    ledgerBookId: input.ledgerBookId ?? null,
    metadata: input.metadata ?? Prisma.JsonNull,
  };
}

// Use createMany (INSERT without RETURNING) so the write never trips the audit
// SELECT RLS policy — an audit written outside its ledger scope (e.g. an org-level
// action) would otherwise be hidden from the RETURNING clause and error.
export async function appendAuditRecord(input: AuditRecordInput): Promise<void> {
  await getPrisma().auditRecord.createMany({ data: [auditData(input)] });
}

/** A transaction-bound Prisma client — what repositories receive inside a scope. */
export type TxClient = Prisma.TransactionClient;

/**
 * Run `fn` inside a transaction with the ledger scope set via SET LOCAL
 * (`app.current_ledger`). Postgres RLS policies read this GUC to isolate rows by
 * 账套; because it is transaction-local it is cleared when the tx ends and can
 * never leak across pooled connections. All ledger-scoped DB access MUST go
 * through here (hard constraint: 严禁无账套作用域的查询).
 */
export async function withLedgerScope<T>(
  ledgerBookId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    // set_config(key, value, is_local=true) is SET LOCAL — transaction-scoped.
    await tx.$executeRaw`SELECT set_config('app.current_ledger', ${ledgerBookId}, true)`;
    return fn(tx);
  });
}

/** Append an audit record inside an existing scoped transaction (preferred path). */
export async function appendAuditRecordTx(tx: TxClient, input: AuditRecordInput): Promise<void> {
  await tx.auditRecord.createMany({ data: [auditData(input)] });
}

/** Domain shape for an audit entry (repositories return entities, not Prisma rows). */
export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ledgerBookId: string | null;
  createdAt: Date;
}

/** List recent audit entries within the active ledger scope (RLS-filtered). */
export async function listAuditEntriesTx(tx: TxClient, take = 50): Promise<AuditEntry[]> {
  const rows = await tx.auditRecord.findMany({ orderBy: { createdAt: 'desc' }, take });
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    ledgerBookId: r.ledgerBookId,
    createdAt: r.createdAt,
  }));
}

/**
 * Run `fn` inside a transaction with the ORG scope set via SET LOCAL
 * (`app.current_org`). Platform tables (organization/membership/ledger_book) are
 * org-scoped by RLS; this is the org-level counterpart to {@link withLedgerScope}.
 */
export async function withOrgScope<T>(orgId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`;
    return fn(tx);
  });
}

/* ---- Platform domain entities + repositories (org-scoped) ---- */

export interface OrganizationEntity {
  id: string;
  name: string;
  createdAt: Date;
}

export interface LedgerBookEntity {
  id: string;
  orgId: string;
  name: string;
  baseCurrency: string;
  fiscalYear: number;
  periodStructure: string;
  active: boolean;
  createdAt: Date;
}

export interface CreateLedgerBookInput {
  orgId: string;
  name: string;
  baseCurrency: string;
  fiscalYear: number;
  periodStructure?: string;
}

export async function getOrganizationTx(tx: TxClient, orgId: string): Promise<OrganizationEntity | null> {
  const o = await tx.organization.findUnique({ where: { id: orgId } });
  return o ? { id: o.id, name: o.name, createdAt: o.createdAt } : null;
}

/** Roles the user holds in the active org scope (RBAC source of truth). */
export async function listMembershipRolesTx(tx: TxClient, userId: string): Promise<string[]> {
  const rows = await tx.membership.findMany({ where: { userId }, select: { role: true } });
  return rows.map((r) => r.role);
}

function toLedgerBook(b: {
  id: string;
  orgId: string;
  name: string;
  baseCurrency: string;
  fiscalYear: number;
  periodStructure: string;
  active: boolean;
  createdAt: Date;
}): LedgerBookEntity {
  return {
    id: b.id,
    orgId: b.orgId,
    name: b.name,
    baseCurrency: b.baseCurrency,
    fiscalYear: b.fiscalYear,
    periodStructure: b.periodStructure,
    active: b.active,
    createdAt: b.createdAt,
  };
}

export async function listLedgerBooksTx(tx: TxClient): Promise<LedgerBookEntity[]> {
  const rows = await tx.ledgerBook.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toLedgerBook);
}

export async function createLedgerBookTx(tx: TxClient, input: CreateLedgerBookInput): Promise<LedgerBookEntity> {
  const created = await tx.ledgerBook.create({
    data: {
      orgId: input.orgId,
      name: input.name,
      baseCurrency: input.baseCurrency,
      fiscalYear: input.fiscalYear,
      periodStructure: input.periodStructure ?? '12+1',
    },
  });
  return toLedgerBook(created);
}

export { Prisma } from '@prisma/client';
export type { PrismaClient } from '@prisma/client';
