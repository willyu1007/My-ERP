import { randomUUID } from 'node:crypto';
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

/* ---- Membership + Invitation repositories (org-scoped) ---- */

export interface MembershipEntity {
  id: string;
  orgId: string;
  userId: string;
  role: string;
  email: string | null;
  createdAt: Date;
}

export interface InvitationEntity {
  id: string;
  orgId: string;
  invitedEmail: string;
  role: string;
  token: string;
  status: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface CreateInvitationInput {
  orgId: string;
  invitedEmail: string;
  role: string;
  invitedBy: string;
  /** Time-to-live in ms; defaults to 7 days. */
  ttlMs?: number;
}

export interface CreateMembershipInput {
  orgId: string;
  userId: string;
  role: string;
  email?: string | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function toMembership(m: {
  id: string;
  orgId: string;
  userId: string;
  role: string;
  email: string | null;
  createdAt: Date;
}): MembershipEntity {
  return { id: m.id, orgId: m.orgId, userId: m.userId, role: m.role, email: m.email, createdAt: m.createdAt };
}

function toInvitation(i: {
  id: string;
  orgId: string;
  invitedEmail: string;
  role: string;
  token: string;
  status: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
}): InvitationEntity {
  return {
    id: i.id,
    orgId: i.orgId,
    invitedEmail: i.invitedEmail,
    role: i.role,
    token: i.token,
    status: i.status,
    invitedBy: i.invitedBy,
    expiresAt: i.expiresAt,
    acceptedBy: i.acceptedBy,
    acceptedAt: i.acceptedAt,
    createdAt: i.createdAt,
  };
}

export async function listMembershipsTx(tx: TxClient): Promise<MembershipEntity[]> {
  const rows = await tx.membership.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toMembership);
}

export async function createMembershipTx(tx: TxClient, input: CreateMembershipInput): Promise<MembershipEntity> {
  const created = await tx.membership.create({
    data: { orgId: input.orgId, userId: input.userId, role: input.role, email: input.email ?? null },
  });
  return toMembership(created);
}

export async function createInvitationTx(tx: TxClient, input: CreateInvitationInput): Promise<InvitationEntity> {
  const created = await tx.invitation.create({
    data: {
      orgId: input.orgId,
      invitedEmail: input.invitedEmail,
      role: input.role,
      invitedBy: input.invitedBy,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + (input.ttlMs ?? SEVEN_DAYS_MS)),
    },
  });
  return toInvitation(created);
}

export async function listInvitationsTx(tx: TxClient): Promise<InvitationEntity[]> {
  const rows = await tx.invitation.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toInvitation);
}

export async function findInvitationByTokenTx(tx: TxClient, token: string): Promise<InvitationEntity | null> {
  const row = await tx.invitation.findUnique({ where: { token } });
  return row ? toInvitation(row) : null;
}

export async function findInvitationByIdTx(tx: TxClient, id: string): Promise<InvitationEntity | null> {
  const row = await tx.invitation.findUnique({ where: { id } });
  return row ? toInvitation(row) : null;
}

export interface UpdateInvitationStatus {
  status: string;
  acceptedBy?: string;
  acceptedAt?: Date;
}

export async function updateInvitationStatusTx(tx: TxClient, id: string, patch: UpdateInvitationStatus): Promise<void> {
  await tx.invitation.update({
    where: { id },
    data: {
      status: patch.status,
      ...(patch.acceptedBy !== undefined ? { acceptedBy: patch.acceptedBy } : {}),
      ...(patch.acceptedAt !== undefined ? { acceptedAt: patch.acceptedAt } : {}),
    },
  });
}

export { Prisma } from '@prisma/client';
export type { PrismaClient } from '@prisma/client';
