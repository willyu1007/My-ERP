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

/**
 * Run `fn` inside a single transaction with BOTH the org and ledger scopes set —
 * for operations that touch org-scoped and ledger-scoped tables atomically
 * (e.g. 期初建账 writes the ledger book's period + the ledger's opening balances).
 */
export async function withScope<T>(
  orgId: string,
  ledgerBookId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_ledger', ${ledgerBookId}, true)`;
    return fn(tx);
  });
}

/**
 * Run `fn` with mandatory org scope and optional ledger scope. Platform task
 * queries use this because WorkItem rows are always org-scoped, while finance
 * work items add a ledger scope when the caller has an active ledger.
 */
export async function withOptionalLedgerScope<T>(
  orgId: string,
  ledgerBookId: string | null | undefined,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`;
    if (ledgerBookId) {
      await tx.$executeRaw`SELECT set_config('app.current_ledger', ${ledgerBookId}, true)`;
    }
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
  singlePersonMode: boolean;
  openingPeriod: string | null;
  createdAt: Date;
}

export interface CreateLedgerBookInput {
  orgId: string;
  name: string;
  baseCurrency: string;
  fiscalYear: number;
  periodStructure?: string;
}

export async function getOrganizationTx(
  tx: TxClient,
  orgId: string,
): Promise<OrganizationEntity | null> {
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
  singlePersonMode: boolean;
  openingPeriod: string | null;
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
    singlePersonMode: b.singlePersonMode,
    openingPeriod: b.openingPeriod,
    createdAt: b.createdAt,
  };
}

export async function listLedgerBooksTx(tx: TxClient): Promise<LedgerBookEntity[]> {
  const rows = await tx.ledgerBook.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toLedgerBook);
}

/** Fetch a ledger book by id within the active org scope (RLS-filtered). Returns
 *  null when it doesn't belong to the caller's org — used to bind a ledger scope. */
export async function getLedgerBookByIdTx(
  tx: TxClient,
  id: string,
): Promise<LedgerBookEntity | null> {
  const b = await tx.ledgerBook.findUnique({ where: { id } });
  return b ? toLedgerBook(b) : null;
}

export async function createLedgerBookTx(
  tx: TxClient,
  input: CreateLedgerBookInput,
): Promise<LedgerBookEntity> {
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
  return {
    id: m.id,
    orgId: m.orgId,
    userId: m.userId,
    role: m.role,
    email: m.email,
    createdAt: m.createdAt,
  };
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

export async function createMembershipTx(
  tx: TxClient,
  input: CreateMembershipInput,
): Promise<MembershipEntity> {
  const created = await tx.membership.create({
    data: {
      orgId: input.orgId,
      userId: input.userId,
      role: input.role,
      email: input.email ?? null,
    },
  });
  return toMembership(created);
}

export async function createInvitationTx(
  tx: TxClient,
  input: CreateInvitationInput,
): Promise<InvitationEntity> {
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

export async function findInvitationByTokenTx(
  tx: TxClient,
  token: string,
): Promise<InvitationEntity | null> {
  const row = await tx.invitation.findUnique({ where: { token } });
  return row ? toInvitation(row) : null;
}

export async function findInvitationByIdTx(
  tx: TxClient,
  id: string,
): Promise<InvitationEntity | null> {
  const row = await tx.invitation.findUnique({ where: { id } });
  return row ? toInvitation(row) : null;
}

export interface UpdateInvitationStatus {
  status: string;
  acceptedBy?: string;
  acceptedAt?: Date;
}

export async function updateInvitationStatusTx(
  tx: TxClient,
  id: string,
  patch: UpdateInvitationStatus,
): Promise<void> {
  await tx.invitation.update({
    where: { id },
    data: {
      status: patch.status,
      ...(patch.acceptedBy !== undefined ? { acceptedBy: patch.acceptedBy } : {}),
      ...(patch.acceptedAt !== undefined ? { acceptedAt: patch.acceptedAt } : {}),
    },
  });
}

/* ---- Account (chart of accounts) repositories (ledger-scoped) ---- */

export interface AccountEntity {
  id: string;
  ledgerBookId: string;
  code: string;
  name: string;
  category: string;
  direction: string;
  parentCode: string | null;
  level: number;
  isLeaf: boolean;
  auxTypes: string[];
  active: boolean;
  defaultCashFlowItem: string | null;
  createdAt: Date;
}

export interface CreateAccountInput {
  ledgerBookId: string;
  code: string;
  name: string;
  category: string;
  direction: string;
  parentCode?: string | null;
  level: number;
  isLeaf?: boolean;
  auxTypes?: readonly string[];
}

export interface SeedAccountInput {
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly direction: string;
  readonly parentCode: string | null;
  readonly level: number;
  readonly isLeaf: boolean;
  readonly auxTypes?: readonly string[];
}

function toAccount(a: {
  id: string;
  ledgerBookId: string;
  code: string;
  name: string;
  category: string;
  direction: string;
  parentCode: string | null;
  level: number;
  isLeaf: boolean;
  auxTypes: string[];
  active: boolean;
  defaultCashFlowItem: string | null;
  createdAt: Date;
}): AccountEntity {
  return {
    id: a.id,
    ledgerBookId: a.ledgerBookId,
    code: a.code,
    name: a.name,
    category: a.category,
    direction: a.direction,
    parentCode: a.parentCode,
    level: a.level,
    isLeaf: a.isLeaf,
    auxTypes: a.auxTypes,
    active: a.active,
    defaultCashFlowItem: a.defaultCashFlowItem,
    createdAt: a.createdAt,
  };
}

/** All accounts in the active ledger scope, ordered by code (= tree pre-order). */
export async function listAccountsTx(tx: TxClient): Promise<AccountEntity[]> {
  const rows = await tx.account.findMany({ orderBy: { code: 'asc' } });
  return rows.map(toAccount);
}

export async function getAccountByCodeTx(
  tx: TxClient,
  code: string,
): Promise<AccountEntity | null> {
  const a = await tx.account.findFirst({ where: { code } });
  return a ? toAccount(a) : null;
}

export async function createAccountTx(
  tx: TxClient,
  input: CreateAccountInput,
): Promise<AccountEntity> {
  const created = await tx.account.create({
    data: {
      ledgerBookId: input.ledgerBookId,
      code: input.code,
      name: input.name,
      category: input.category,
      direction: input.direction,
      parentCode: input.parentCode ?? null,
      level: input.level,
      isLeaf: input.isLeaf ?? true,
      auxTypes: [...(input.auxTypes ?? [])],
    },
  });
  return toAccount(created);
}

export interface UpdateAccountPatch {
  name?: string;
  auxTypes?: readonly string[];
}

export async function updateAccountTx(
  tx: TxClient,
  code: string,
  patch: UpdateAccountPatch,
): Promise<void> {
  await tx.account.updateMany({
    where: { code },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.auxTypes !== undefined ? { auxTypes: [...patch.auxTypes] } : {}),
    },
  });
}

export async function setAccountActiveTx(
  tx: TxClient,
  code: string,
  active: boolean,
): Promise<void> {
  await tx.account.updateMany({ where: { code }, data: { active } });
}

/** Flip an account's leaf flag — a parent gaining its first child becomes a branch. */
export async function setAccountLeafTx(tx: TxClient, code: string, isLeaf: boolean): Promise<void> {
  await tx.account.updateMany({ where: { code }, data: { isLeaf } });
}

/** Count active child accounts of a parent (for the leaf/deactivate guard). */
export async function countActiveChildrenTx(tx: TxClient, parentCode: string): Promise<number> {
  return tx.account.count({ where: { parentCode, active: true } });
}

/**
 * Whether an account code carries any accounting activity in the current ledger
 * scope — voucher lines or an opening balance. Used by the standard-chart import
 * (T-012 Phase 2): a posted leaf must not silently become a branch.
 */
export async function accountHasActivityTx(tx: TxClient, code: string): Promise<boolean> {
  const line = await tx.journalEntryLine.findFirst({
    where: { accountCode: code },
    select: { id: true },
  });
  if (line) return true;
  const opening = await tx.openingBalance.findFirst({
    where: { accountCode: code },
    select: { id: true },
  });
  return opening !== null;
}

/** Idempotent chart seed: inserts only codes not already present in the ledger. */
export async function seedAccountsTx(
  tx: TxClient,
  ledgerBookId: string,
  seeds: readonly SeedAccountInput[],
): Promise<number> {
  const result = await tx.account.createMany({
    data: seeds.map((s) => ({
      ledgerBookId,
      code: s.code,
      name: s.name,
      category: s.category,
      direction: s.direction,
      parentCode: s.parentCode,
      level: s.level,
      isLeaf: s.isLeaf,
      auxTypes: [...(s.auxTypes ?? [])],
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/* ---- Journal voucher repositories (ledger-scoped) ---- */

export interface VoucherLineEntity {
  id: string;
  lineNo: number;
  accountCode: string;
  accountName: string;
  summary: string;
  debit: string | null;
  credit: string | null;
  aux: unknown;
  cashFlowItem: string | null;
}

export interface VoucherEntity {
  id: string;
  ledgerBookId: string;
  no: string;
  date: string;
  period: string;
  status: string;
  summary: string;
  totalDebit: string;
  totalCredit: string;
  maker: string;
  checker: string | null;
  postedAt: string | null;
  reversalOf: string | null;
  reversedBy: string | null;
  attachments: number;
  contractId: string | null;
  draftPayload: unknown | null;
  createdAt: Date;
  lines: VoucherLineEntity[];
}

export interface VoucherLineInput {
  accountCode: string;
  accountName: string;
  summary: string;
  debit?: string | null;
  credit?: string | null;
  aux?: unknown;
  cashFlowItem?: string | null;
}

export interface CreateVoucherInput {
  ledgerBookId: string;
  no: string;
  date: string;
  period: string;
  summary: string;
  maker: string;
  totalDebit: string;
  totalCredit: string;
  lines: readonly VoucherLineInput[];
  /** Optional Contract link (T-005 dimension). */
  contractId?: string | null;
  /** UI-only quick-entry draft payload. Draft status only; not an accounting source. */
  draftPayload?: unknown | null;
}

type RawLine = {
  id: string;
  lineNo: number;
  accountCode: string;
  accountName: string;
  summary: string;
  debit: Prisma.Decimal | null;
  credit: Prisma.Decimal | null;
  aux: Prisma.JsonValue | null;
  cashFlowItem: string | null;
};

function toVoucherLine(l: RawLine): VoucherLineEntity {
  return {
    id: l.id,
    lineNo: l.lineNo,
    accountCode: l.accountCode,
    accountName: l.accountName,
    summary: l.summary,
    debit: l.debit ? l.debit.toFixed(2) : null,
    credit: l.credit ? l.credit.toFixed(2) : null,
    aux: l.aux ?? null,
    cashFlowItem: l.cashFlowItem,
  };
}

function toVoucher(v: {
  id: string;
  ledgerBookId: string;
  no: string;
  date: Date;
  period: string;
  status: string;
  summary: string;
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
  maker: string;
  checker: string | null;
  postedAt: Date | null;
  reversalOf: string | null;
  reversedBy: string | null;
  attachments: number;
  contractId: string | null;
  draftPayload: unknown | null;
  createdAt: Date;
  lines?: RawLine[];
}): VoucherEntity {
  return {
    id: v.id,
    ledgerBookId: v.ledgerBookId,
    no: v.no,
    date: v.date.toISOString().slice(0, 10),
    period: v.period,
    status: v.status,
    summary: v.summary,
    totalDebit: v.totalDebit.toFixed(2),
    totalCredit: v.totalCredit.toFixed(2),
    maker: v.maker,
    checker: v.checker,
    postedAt: v.postedAt ? v.postedAt.toISOString() : null,
    reversalOf: v.reversalOf,
    reversedBy: v.reversedBy,
    attachments: v.attachments,
    contractId: v.contractId,
    draftPayload: v.draftPayload ?? null,
    createdAt: v.createdAt,
    lines: (v.lines ?? []).map(toVoucherLine),
  };
}

function lineCreateData(ledgerBookId: string, lines: readonly VoucherLineInput[]) {
  return lines.map((l, i) => ({
    ledgerBookId,
    lineNo: i + 1,
    accountCode: l.accountCode,
    accountName: l.accountName,
    summary: l.summary,
    debit: l.debit ?? null,
    credit: l.credit ?? null,
    aux: l.aux === undefined || l.aux === null ? Prisma.JsonNull : (l.aux as Prisma.InputJsonValue),
    cashFlowItem: l.cashFlowItem ?? null,
  }));
}

export async function countVouchersInPeriodTx(tx: TxClient, period: string): Promise<number> {
  return tx.journalVoucher.count({ where: { period } });
}

export async function createVoucherTx(
  tx: TxClient,
  input: CreateVoucherInput,
): Promise<VoucherEntity> {
  const v = await tx.journalVoucher.create({
    data: {
      ledgerBookId: input.ledgerBookId,
      no: input.no,
      date: new Date(input.date),
      period: input.period,
      summary: input.summary,
      maker: input.maker,
      totalDebit: input.totalDebit,
      totalCredit: input.totalCredit,
      contractId: input.contractId ?? null,
      draftPayload:
        input.draftPayload === undefined || input.draftPayload === null
          ? Prisma.JsonNull
          : (input.draftPayload as Prisma.InputJsonValue),
      lines: { create: lineCreateData(input.ledgerBookId, input.lines) },
    },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  });
  return toVoucher(v);
}

export async function listVouchersTx(tx: TxClient, status?: string): Promise<VoucherEntity[]> {
  const rows = await tx.journalVoucher.findMany({
    where: status ? { status } : {},
    orderBy: [{ date: 'desc' }, { no: 'desc' }],
  });
  return rows.map((v) => toVoucher(v));
}

export async function getVoucherTx(tx: TxClient, id: string): Promise<VoucherEntity | null> {
  const v = await tx.journalVoucher.findUnique({
    where: { id },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  });
  return v ? toVoucher(v) : null;
}

export interface UpdateDraftVoucherInput {
  date: string;
  period: string;
  summary: string;
  totalDebit: string;
  totalCredit: string;
  lines: readonly VoucherLineInput[];
  /** Optional Contract link (T-005 dimension). */
  contractId?: string | null;
  /** UI-only quick-entry draft payload. Draft status only; not an accounting source. */
  draftPayload?: unknown | null;
}

export async function updateDraftVoucherTx(
  tx: TxClient,
  id: string,
  ledgerBookId: string,
  input: UpdateDraftVoucherInput,
): Promise<void> {
  await tx.journalEntryLine.deleteMany({ where: { voucherId: id } });
  await tx.journalVoucher.update({
    where: { id },
    data: {
      date: new Date(input.date),
      period: input.period,
      summary: input.summary,
      totalDebit: input.totalDebit,
      totalCredit: input.totalCredit,
      contractId: input.contractId ?? null,
      draftPayload:
        input.draftPayload === undefined || input.draftPayload === null
          ? Prisma.JsonNull
          : (input.draftPayload as Prisma.InputJsonValue),
      lines: { create: lineCreateData(ledgerBookId, input.lines) },
    },
  });
}

export interface VoucherStatusPatch {
  status: string;
  checker?: string | null;
  postedAt?: Date | null;
  reversedBy?: string | null;
  /** Clear UI-only draft recovery data when the voucher leaves draft. */
  clearDraftPayload?: boolean;
}

export async function setVoucherStatusTx(
  tx: TxClient,
  id: string,
  patch: VoucherStatusPatch,
): Promise<void> {
  await tx.journalVoucher.update({
    where: { id },
    data: {
      status: patch.status,
      ...(patch.checker !== undefined ? { checker: patch.checker } : {}),
      ...(patch.postedAt !== undefined ? { postedAt: patch.postedAt } : {}),
      ...(patch.reversedBy !== undefined ? { reversedBy: patch.reversedBy } : {}),
      ...(patch.clearDraftPayload ? { draftPayload: Prisma.JsonNull } : {}),
    },
  });
}

export interface ReversalContext {
  no: string;
  reverser: string;
  date: string;
  period: string;
  postedAt: Date;
}

/**
 * Create a posted reversal voucher (红冲) for `original` — same accounts with
 * debit/credit swapped, so it offsets the original. The caller links the original
 * (status=reversed, reversedBy) in the same transaction.
 */
export async function createReversalVoucherTx(
  tx: TxClient,
  original: VoucherEntity,
  ctx: ReversalContext,
): Promise<VoucherEntity> {
  const v = await tx.journalVoucher.create({
    data: {
      ledgerBookId: original.ledgerBookId,
      no: ctx.no,
      date: new Date(ctx.date),
      period: ctx.period,
      status: 'posted',
      summary: `红冲：${original.summary}（冲 ${original.no}）`,
      maker: ctx.reverser,
      checker: ctx.reverser,
      postedAt: ctx.postedAt,
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      reversalOf: original.id,
      contractId: original.contractId, // a reversal stays on the same contract's timeline (T-005)
      lines: {
        create: original.lines.map((l, i) => ({
          ledgerBookId: original.ledgerBookId,
          lineNo: i + 1,
          accountCode: l.accountCode,
          accountName: l.accountName,
          summary: l.summary,
          debit: l.credit,
          credit: l.debit,
          aux:
            l.aux === undefined || l.aux === null
              ? Prisma.JsonNull
              : (l.aux as Prisma.InputJsonValue),
          cashFlowItem: l.cashFlowItem,
        })),
      },
    },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  });
  return toVoucher(v);
}

/* ---- Ledger derivation source (posted entry lines) ---- */

export interface PostedLineRow {
  accountCode: string;
  accountName: string;
  debit: string | null;
  credit: string | null;
  voucherId: string;
  voucherNo: string;
  date: string;
  period: string;
  summary: string;
  cashFlowItem: string | null;
}

/**
 * Every line that has an accounting effect in the active ledger scope — the
 * source rows the trial balance + account ledgers are derived from (P4).
 * Includes 'posted' AND 'reversed' vouchers: a reversed voucher's original
 * posting is a permanent record that stays in the books; its red-letter reversal
 * (itself 'posted', with swapped lines) negates it separately, so the pair nets
 * to zero with both entries visible (留痕). Excluding 'reversed' would drop the
 * original and leave only the negation.
 */
export async function getPostedEntriesTx(tx: TxClient): Promise<PostedLineRow[]> {
  const lines = await tx.journalEntryLine.findMany({
    where: { voucher: { status: { in: ['posted', 'reversed'] } } },
    include: { voucher: { select: { no: true, date: true, period: true } } },
    orderBy: [{ voucher: { date: 'asc' } }, { voucherId: 'asc' }, { lineNo: 'asc' }],
  });
  return lines.map((l) => ({
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit: l.debit ? l.debit.toFixed(2) : null,
    credit: l.credit ? l.credit.toFixed(2) : null,
    voucherId: l.voucherId,
    voucherNo: l.voucher.no,
    date: l.voucher.date.toISOString().slice(0, 10),
    period: l.voucher.period,
    summary: l.summary,
    cashFlowItem: l.cashFlowItem,
  }));
}

/* ---- Opening balances (期初建账) ---- */

export interface OpeningBalanceEntity {
  accountCode: string;
  accountName: string;
  debit: string | null;
  credit: string | null;
}

export interface OpeningBalanceInput {
  accountCode: string;
  accountName: string;
  debit?: string | null;
  credit?: string | null;
}

export async function getOpeningBalancesTx(tx: TxClient): Promise<OpeningBalanceEntity[]> {
  const rows = await tx.openingBalance.findMany({ orderBy: { accountCode: 'asc' } });
  return rows.map((o) => ({
    accountCode: o.accountCode,
    accountName: o.accountName,
    debit: o.debit ? o.debit.toFixed(2) : null,
    credit: o.credit ? o.credit.toFixed(2) : null,
  }));
}

/** Replace the entire opening-balance set for the active ledger (delete + insert). */
export async function replaceOpeningBalancesTx(
  tx: TxClient,
  ledgerBookId: string,
  balances: readonly OpeningBalanceInput[],
): Promise<void> {
  await tx.openingBalance.deleteMany({ where: {} }); // RLS scopes deletion to the active ledger
  if (balances.length > 0) {
    await tx.openingBalance.createMany({
      data: balances.map((b) => ({
        ledgerBookId,
        accountCode: b.accountCode,
        accountName: b.accountName,
        debit: b.debit ?? null,
        credit: b.credit ?? null,
      })),
    });
  }
}

/** Count vouchers that have an accounting effect (posted/reversed) — 期初建账 is
 *  only allowed before the book has been used. */
export async function countPostedVouchersTx(tx: TxClient): Promise<number> {
  return tx.journalVoucher.count({ where: { status: { in: ['posted', 'reversed'] } } });
}

/** Set the ledger book's enabled period (org-scoped — call within withOrgScope). */
export async function setLedgerOpeningPeriodTx(
  tx: TxClient,
  ledgerBookId: string,
  openingPeriod: string,
): Promise<void> {
  await tx.ledgerBook.update({ where: { id: ledgerBookId }, data: { openingPeriod } });
}

/* ---- Work item kernel + metadata-only outbox (org + optional ledger scoped) ---- */

export const ACTIVE_WORK_ITEM_STATUSES = ['open', 'claimed', 'waiting', 'returned'] as const;

export interface WorkItemEntity {
  id: string;
  orgId: string;
  ledgerBookId: string | null;
  moduleKey: string;
  workflowKey: string;
  workflowVersion: string;
  workItemType: string;
  sourceType: string;
  sourceId: string;
  dedupeKey: string;
  status: string;
  subStatus: string;
  priority: string;
  assignedRole: string;
  assigneeUserId: string | null;
  claimedAt: Date | null;
  availableAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  createdBy: string;
  completedBy: string | null;
  version: number;
  titleKey: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkItemEventEntity {
  id: string;
  workItemId: string;
  orgId: string;
  ledgerBookId: string | null;
  eventType: string;
  actionKey: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  actorId: string;
  reason: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface CreateWorkItemInput {
  orgId: string;
  ledgerBookId?: string | null;
  moduleKey: string;
  workflowKey: string;
  workflowVersion: string;
  workItemType: string;
  sourceType: string;
  sourceId: string;
  dedupeKey: string;
  status?: string;
  subStatus: string;
  priority?: string;
  assignedRole: string;
  assigneeUserId?: string | null;
  availableAt?: Date;
  dueAt?: Date | null;
  createdBy: string;
  titleKey: string;
  metadata?: unknown;
}

export interface WorkItemListFilters {
  view?: string;
  actorId: string;
  roles: readonly string[];
  /**
   * Supervision-capable callers (admin/supervisor) are role-eligible for any task — the same
   * elevation `canViewWorkItem`/`availableWorkItemActions` already apply. Without it, `my_tasks` /
   * `role_queue` would be empty for an admin (and the SME single-admin persona), because the literal
   * `assignedRole IN roles` match never hits a 'supervisor'/'accountant' task.
   */
  supervisionCapable?: boolean;
  status?: string;
  sourceType?: string;
  sourceId?: string;
  includeClosed?: boolean;
  limit?: number;
  cursor?: string;
}

export interface AppendWorkItemEventInput {
  workItemId: string;
  orgId: string;
  ledgerBookId?: string | null;
  eventType: string;
  actionKey?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId: string;
  reason?: string | null;
  metadata?: unknown;
}

export interface WorkItemTransitionInput {
  id: string;
  actorId: string;
  actionKey: string;
  toStatus: string;
  toSubStatus: string;
  expectedVersion?: number;
  reason?: string | null;
  metadata?: unknown;
  completedBy?: string | null;
  canceled?: boolean;
  assigneeUserId?: string | null;
  claimedAt?: Date | null;
}

export interface AppendOutboxEventInput {
  orgId: string;
  ledgerBookId?: string | null;
  workItemId?: string | null;
  eventType: string;
  sourceType: string;
  sourceId?: string | null;
  payload: unknown;
}

type WorkItemRow = {
  id: string;
  orgId: string;
  ledgerBookId: string | null;
  moduleKey: string;
  workflowKey: string;
  workflowVersion: string;
  workItemType: string;
  sourceType: string;
  sourceId: string;
  dedupeKey: string;
  status: string;
  subStatus: string;
  priority: string;
  assignedRole: string;
  assigneeUserId: string | null;
  claimedAt: Date | null;
  availableAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  createdBy: string;
  completedBy: string | null;
  version: number;
  titleKey: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

type WorkItemEventRow = {
  id: string;
  workItemId: string;
  orgId: string;
  ledgerBookId: string | null;
  eventType: string;
  actionKey: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  actorId: string;
  reason: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === undefined || value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function toWorkItem(row: WorkItemRow): WorkItemEntity {
  return {
    id: row.id,
    orgId: row.orgId,
    ledgerBookId: row.ledgerBookId,
    moduleKey: row.moduleKey,
    workflowKey: row.workflowKey,
    workflowVersion: row.workflowVersion,
    workItemType: row.workItemType,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    dedupeKey: row.dedupeKey,
    status: row.status,
    subStatus: row.subStatus,
    priority: row.priority,
    assignedRole: row.assignedRole,
    assigneeUserId: row.assigneeUserId,
    claimedAt: row.claimedAt,
    availableAt: row.availableAt,
    dueAt: row.dueAt,
    completedAt: row.completedAt,
    canceledAt: row.canceledAt,
    createdBy: row.createdBy,
    completedBy: row.completedBy,
    version: row.version,
    titleKey: row.titleKey,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWorkItemEvent(row: WorkItemEventRow): WorkItemEventEntity {
  return {
    id: row.id,
    workItemId: row.workItemId,
    orgId: row.orgId,
    ledgerBookId: row.ledgerBookId,
    eventType: row.eventType,
    actionKey: row.actionKey,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actorId: row.actorId,
    reason: row.reason,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

function activeStatusWhere(): Prisma.StringFilter {
  return { in: [...ACTIVE_WORK_ITEM_STATUSES] };
}

function isActiveWorkItemStatus(status: string): boolean {
  return (ACTIVE_WORK_ITEM_STATUSES as readonly string[]).includes(status);
}

function viewWhere(filters: WorkItemListFilters): Prisma.WorkItemWhereInput {
  const where: Prisma.WorkItemWhereInput = {};
  if (filters.status) {
    where.status = filters.status;
  } else if (!filters.includeClosed) {
    where.status = activeStatusWhere();
  }
  if (filters.sourceType) where.sourceType = filters.sourceType;
  if (filters.sourceId) where.sourceId = filters.sourceId;

  const roles = [...filters.roles];
  // Supervision-capable callers are role-eligible for every task (mirrors the view/action elevation).
  const roleMatch: Prisma.WorkItemWhereInput = filters.supervisionCapable
    ? {}
    : roles.length > 0
      ? { assignedRole: { in: roles } }
      : { assignedRole: { in: [] } };

  switch (filters.view ?? 'my_tasks') {
    case 'role_queue':
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), roleMatch];
      break;
    case 'created_by_me':
      where.createdBy = filters.actorId;
      break;
    case 'handled_by_me':
      where.events = { some: { actorId: filters.actorId } };
      break;
    case 'supervision':
    case 'audit_readonly':
      break;
    case 'my_tasks':
    default:
      // "Mine, plus anything I can pick up." For supervision-capable callers, `roleMatch` is empty,
      // so the second branch becomes "any unassigned active task".
      where.OR = [
        { assigneeUserId: filters.actorId },
        { AND: [roleMatch, { assigneeUserId: null }] },
      ];
      break;
  }

  return where;
}

export async function createWorkItemTx(
  tx: TxClient,
  input: CreateWorkItemInput,
): Promise<WorkItemEntity> {
  return (await createWorkItemWithResultTx(tx, input)).item;
}

export async function createWorkItemWithResultTx(
  tx: TxClient,
  input: CreateWorkItemInput,
): Promise<{ item: WorkItemEntity; created: boolean }> {
  const existing = await tx.workItem.findFirst({
    where: { dedupeKey: input.dedupeKey, status: activeStatusWhere() },
  });
  if (existing) return { item: toWorkItem(existing), created: false };

  const created = await tx.workItem.create({
    data: {
      orgId: input.orgId,
      ledgerBookId: input.ledgerBookId ?? null,
      moduleKey: input.moduleKey,
      workflowKey: input.workflowKey,
      workflowVersion: input.workflowVersion,
      workItemType: input.workItemType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      dedupeKey: input.dedupeKey,
      status: input.status ?? 'open',
      subStatus: input.subStatus,
      priority: input.priority ?? 'normal',
      assignedRole: input.assignedRole,
      assigneeUserId: input.assigneeUserId ?? null,
      availableAt: input.availableAt ?? new Date(),
      dueAt: input.dueAt ?? null,
      createdBy: input.createdBy,
      titleKey: input.titleKey,
      ...(input.metadata !== undefined ? { metadata: jsonOrNull(input.metadata) } : {}),
    },
  });
  await appendWorkItemEventTx(tx, {
    workItemId: created.id,
    orgId: created.orgId,
    ledgerBookId: created.ledgerBookId,
    eventType: 'work_item.created',
    toStatus: created.status,
    actorId: input.createdBy,
  });
  return { item: toWorkItem(created), created: true };
}

export async function getWorkItemTx(tx: TxClient, id: string): Promise<WorkItemEntity | null> {
  const row = await tx.workItem.findUnique({ where: { id } });
  return row ? toWorkItem(row) : null;
}

export async function listWorkItemsTx(
  tx: TxClient,
  filters: WorkItemListFilters,
): Promise<WorkItemEntity[]> {
  const rows = await tx.workItem.findMany({
    where: viewWhere(filters),
    take: filters.limit ?? 50,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    orderBy: [{ dueAt: 'asc' }, { availableAt: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
  });
  return rows.map(toWorkItem);
}

export async function listWorkItemEventsTx(
  tx: TxClient,
  workItemId: string,
): Promise<WorkItemEventEntity[]> {
  const rows = await tx.workItemEvent.findMany({
    where: { workItemId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toWorkItemEvent);
}

export async function hasWorkItemEventByActorTx(
  tx: TxClient,
  workItemId: string,
  actorId: string,
): Promise<boolean> {
  const row = await tx.workItemEvent.findFirst({
    where: { workItemId, actorId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function appendWorkItemEventTx(
  tx: TxClient,
  input: AppendWorkItemEventInput,
): Promise<WorkItemEventEntity> {
  const created = await tx.workItemEvent.create({
    data: {
      workItemId: input.workItemId,
      orgId: input.orgId,
      ledgerBookId: input.ledgerBookId ?? null,
      eventType: input.eventType,
      actionKey: input.actionKey ?? null,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorId: input.actorId,
      reason: input.reason ?? null,
      ...(input.metadata !== undefined ? { metadata: jsonOrNull(input.metadata) } : {}),
    },
  });
  return toWorkItemEvent(created);
}

export async function claimWorkItemTx(
  tx: TxClient,
  id: string,
  actorId: string,
  expectedVersion?: number,
): Promise<WorkItemEntity | null> {
  const current = await tx.workItem.findUnique({ where: { id } });
  if (!current || !isActiveWorkItemStatus(current.status)) return null;
  const updated = await tx.workItem.updateMany({
    where: {
      id,
      status: { in: ['open', 'returned'] },
      assigneeUserId: null,
      ...(expectedVersion !== undefined ? { version: expectedVersion } : {}),
    },
    data: {
      status: 'claimed',
      assigneeUserId: actorId,
      claimedAt: new Date(),
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) return null;
  const after = await tx.workItem.findUniqueOrThrow({ where: { id } });
  await appendWorkItemEventTx(tx, {
    workItemId: after.id,
    orgId: after.orgId,
    ledgerBookId: after.ledgerBookId,
    eventType: 'work_item.claimed',
    actionKey: 'claim',
    fromStatus: current.status,
    toStatus: after.status,
    actorId,
  });
  return toWorkItem(after);
}

export async function transitionWorkItemTx(
  tx: TxClient,
  input: WorkItemTransitionInput,
): Promise<WorkItemEntity | null> {
  const current = await tx.workItem.findUnique({ where: { id: input.id } });
  if (!current || !isActiveWorkItemStatus(current.status)) return null;

  const completedAt = input.toStatus === 'completed' ? new Date() : undefined;
  const canceledAt = input.canceled || input.toStatus === 'canceled' ? new Date() : undefined;
  const updated = await tx.workItem.updateMany({
    where: {
      id: input.id,
      status: activeStatusWhere(),
      ...(input.expectedVersion !== undefined ? { version: input.expectedVersion } : {}),
    },
    data: {
      status: input.toStatus,
      subStatus: input.toSubStatus,
      ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
      ...(input.claimedAt !== undefined ? { claimedAt: input.claimedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(canceledAt ? { canceledAt } : {}),
      ...(input.completedBy !== undefined ? { completedBy: input.completedBy } : {}),
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) return null;

  const after = await tx.workItem.findUniqueOrThrow({ where: { id: input.id } });
  await appendWorkItemEventTx(tx, {
    workItemId: after.id,
    orgId: after.orgId,
    ledgerBookId: after.ledgerBookId,
    eventType: `work_item.${input.toStatus}`,
    actionKey: input.actionKey,
    fromStatus: current.status,
    toStatus: after.status,
    actorId: input.actorId,
    reason: input.reason ?? null,
    metadata: input.metadata,
  });
  return toWorkItem(after);
}

export async function completeActiveWorkItemsForSourceTx(
  tx: TxClient,
  input: {
    sourceType: string;
    sourceId: string;
    actorId: string;
    actionKey?: string;
    workItemType?: string;
  },
): Promise<WorkItemEntity[]> {
  const rows = await tx.workItem.findMany({
    where: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: activeStatusWhere(),
      ...(input.workItemType ? { workItemType: input.workItemType } : {}),
    },
  });
  const completed: WorkItemEntity[] = [];
  for (const row of rows) {
    const item = await transitionWorkItemTx(tx, {
      id: row.id,
      actorId: input.actorId,
      actionKey: input.actionKey ?? 'complete',
      toStatus: 'completed',
      toSubStatus: 'done',
      completedBy: input.actorId,
    });
    if (item) completed.push(item);
  }
  return completed;
}

export async function cancelWorkItemTx(
  tx: TxClient,
  id: string,
  actorId: string,
  expectedVersion?: number,
): Promise<WorkItemEntity | null> {
  return transitionWorkItemTx(tx, {
    id,
    actorId,
    actionKey: 'cancel',
    toStatus: 'canceled',
    toSubStatus: 'done',
    canceled: true,
    expectedVersion,
  });
}

export async function appendOutboxEventTx(
  tx: TxClient,
  input: AppendOutboxEventInput,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      orgId: input.orgId,
      ledgerBookId: input.ledgerBookId ?? null,
      workItemId: input.workItemId ?? null,
      eventType: input.eventType,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
}

// ---- T-004 capture intake (ledger-scoped: call within withScope/withLedgerScope) ----

export interface AttachmentEntity {
  id: string;
  orgId: string;
  ledgerBookId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdBy: string;
  createdAt: Date;
}

export interface CreateAttachmentInput {
  orgId: string;
  ledgerBookId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdBy: string;
}

export interface IntakeEntity {
  id: string;
  orgId: string;
  ledgerBookId: string;
  source: string;
  kind: string;
  status: string;
  attachmentId: string | null;
  extraction: unknown;
  confidence: number | null;
  needsReview: boolean;
  targetType: string | null;
  targetId: string | null;
  channelRef: string | null;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIntakeInput {
  orgId: string;
  ledgerBookId: string;
  source?: string;
  kind: string;
  status?: string;
  attachmentId?: string | null;
  channelRef?: string | null;
  createdBy: string;
}

/** Patch an intake. `expectedVersion` makes the extracted→drafted transition one-shot. */
export interface UpdateIntakeInput {
  status?: string;
  extraction?: unknown;
  confidence?: number | null;
  needsReview?: boolean;
  targetType?: string | null;
  targetId?: string | null;
  expectedVersion?: number;
}

type AttachmentRow = {
  id: string;
  orgId: string;
  ledgerBookId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdBy: string;
  createdAt: Date;
};

type IntakeRow = {
  id: string;
  orgId: string;
  ledgerBookId: string;
  source: string;
  kind: string;
  status: string;
  attachmentId: string | null;
  extraction: Prisma.JsonValue | null;
  confidence: Prisma.Decimal | null;
  needsReview: boolean;
  targetType: string | null;
  targetId: string | null;
  channelRef: string | null;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

function toAttachment(row: AttachmentRow): AttachmentEntity {
  return {
    id: row.id,
    orgId: row.orgId,
    ledgerBookId: row.ledgerBookId,
    storageKey: row.storageKey,
    contentType: row.contentType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function toIntake(row: IntakeRow): IntakeEntity {
  return {
    id: row.id,
    orgId: row.orgId,
    ledgerBookId: row.ledgerBookId,
    source: row.source,
    kind: row.kind,
    status: row.status,
    attachmentId: row.attachmentId,
    extraction: row.extraction ?? null,
    confidence: row.confidence === null ? null : row.confidence.toNumber(),
    needsReview: row.needsReview,
    targetType: row.targetType,
    targetId: row.targetId,
    channelRef: row.channelRef,
    createdBy: row.createdBy,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createAttachmentTx(
  tx: TxClient,
  input: CreateAttachmentInput,
): Promise<AttachmentEntity> {
  const row = await tx.attachment.create({ data: { ...input } });
  return toAttachment(row);
}

export async function getAttachmentTx(tx: TxClient, id: string): Promise<AttachmentEntity | null> {
  const row = await tx.attachment.findUnique({ where: { id } });
  return row ? toAttachment(row) : null;
}

export async function createIntakeTx(
  tx: TxClient,
  input: CreateIntakeInput,
): Promise<IntakeEntity> {
  const row = await tx.intake.create({
    data: {
      orgId: input.orgId,
      ledgerBookId: input.ledgerBookId,
      source: input.source ?? 'web',
      kind: input.kind,
      status: input.status ?? 'received',
      attachmentId: input.attachmentId ?? null,
      channelRef: input.channelRef ?? null,
      createdBy: input.createdBy,
    },
  });
  return toIntake(row);
}

export async function getIntakeTx(tx: TxClient, id: string): Promise<IntakeEntity | null> {
  const row = await tx.intake.findUnique({ where: { id } });
  return row ? toIntake(row) : null;
}

export async function listIntakesTx(
  tx: TxClient,
  filters?: { status?: string; limit?: number },
): Promise<IntakeEntity[]> {
  const rows = await tx.intake.findMany({
    where: filters?.status ? { status: filters.status } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(filters?.limit ?? 50, 200),
  });
  return rows.map(toIntake);
}

/** Version-guarded patch; returns null when the expected version no longer matches. */
export async function updateIntakeTx(
  tx: TxClient,
  id: string,
  input: UpdateIntakeInput,
): Promise<IntakeEntity | null> {
  const data: Prisma.IntakeUpdateManyMutationInput = { version: { increment: 1 } };
  if (input.status !== undefined) data.status = input.status;
  if (input.extraction !== undefined) data.extraction = jsonOrNull(input.extraction);
  if (input.confidence !== undefined) data.confidence = input.confidence;
  if (input.needsReview !== undefined) data.needsReview = input.needsReview;
  if (input.targetType !== undefined) data.targetType = input.targetType;
  if (input.targetId !== undefined) data.targetId = input.targetId;
  const res = await tx.intake.updateMany({
    where: input.expectedVersion === undefined ? { id } : { id, version: input.expectedVersion },
    data,
  });
  if (res.count === 0) return null;
  return getIntakeTx(tx, id);
}

// ---- T-006 period close (ledger-scoped: call within withScope) ----

export interface PeriodCloseEntity {
  id: string;
  ledgerBookId: string;
  period: string;
  status: string;
  closeVoucherId: string | null;
  closedBy: string | null;
  closedAt: Date | null;
  reopenedBy: string | null;
  reopenedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type PeriodCloseRow = {
  id: string;
  ledgerBookId: string;
  period: string;
  status: string;
  closeVoucherId: string | null;
  closedBy: string | null;
  closedAt: Date | null;
  reopenedBy: string | null;
  reopenedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPeriodClose(row: PeriodCloseRow): PeriodCloseEntity {
  return { ...row };
}

export async function getPeriodCloseTx(
  tx: TxClient,
  period: string,
): Promise<PeriodCloseEntity | null> {
  const row = await tx.periodClose.findFirst({ where: { period } });
  return row ? toPeriodClose(row) : null;
}

export async function isPeriodClosedTx(tx: TxClient, period: string): Promise<boolean> {
  const row = await tx.periodClose.findFirst({ where: { period, status: 'closed' } });
  return row !== null;
}

export async function listPeriodClosesTx(tx: TxClient): Promise<PeriodCloseEntity[]> {
  const rows = await tx.periodClose.findMany({ orderBy: { period: 'desc' } });
  return rows.map(toPeriodClose);
}

/** Count vouchers in a period that are not yet posted (block close). */
export async function countUnpostedVouchersInPeriodTx(
  tx: TxClient,
  period: string,
): Promise<number> {
  return tx.journalVoucher.count({ where: { period, status: { in: ['draft', 'pending'] } } });
}

export async function closePeriodTx(
  tx: TxClient,
  input: {
    ledgerBookId: string;
    period: string;
    closeVoucherId: string | null;
    closedBy: string;
  },
): Promise<PeriodCloseEntity> {
  const row = await tx.periodClose.upsert({
    where: { ledgerBookId_period: { ledgerBookId: input.ledgerBookId, period: input.period } },
    update: {
      status: 'closed',
      closeVoucherId: input.closeVoucherId,
      closedBy: input.closedBy,
      closedAt: new Date(),
      reopenedBy: null,
      reopenedAt: null,
    },
    create: {
      ledgerBookId: input.ledgerBookId,
      period: input.period,
      status: 'closed',
      closeVoucherId: input.closeVoucherId,
      closedBy: input.closedBy,
      closedAt: new Date(),
    },
  });
  return toPeriodClose(row);
}

/** Reopen (反结账) a closed period; returns null when it was not closed. */
export async function reopenPeriodTx(
  tx: TxClient,
  input: { period: string; reopenedBy: string },
): Promise<PeriodCloseEntity | null> {
  const res = await tx.periodClose.updateMany({
    where: { period: input.period, status: 'closed' },
    data: { status: 'open', reopenedBy: input.reopenedBy, reopenedAt: new Date() },
  });
  if (res.count === 0) return null;
  return getPeriodCloseTx(tx, input.period);
}

// ---- T-006 M3b cash flow items (ledger-scoped) ----

export interface CashFlowItemEntity {
  id: string;
  ledgerBookId: string;
  code: string;
  name: string;
  activity: string;
  direction: string;
  sort: number;
  active: boolean;
}

export interface CashFlowItemSeedInput {
  code: string;
  name: string;
  activity: string;
  direction: string;
}

export async function listCashFlowItemsTx(tx: TxClient): Promise<CashFlowItemEntity[]> {
  const rows = await tx.cashFlowItem.findMany({ orderBy: [{ sort: 'asc' }, { code: 'asc' }] });
  return rows.map((r) => ({
    id: r.id,
    ledgerBookId: r.ledgerBookId,
    code: r.code,
    name: r.name,
    activity: r.activity,
    direction: r.direction,
    sort: r.sort,
    active: r.active,
  }));
}

/** Idempotent seed of the standard CF items for a ledger. */
export async function seedCashFlowItemsTx(
  tx: TxClient,
  ledgerBookId: string,
  seeds: readonly CashFlowItemSeedInput[],
): Promise<number> {
  const result = await tx.cashFlowItem.createMany({
    data: seeds.map((s, i) => ({
      ledgerBookId,
      code: s.code,
      name: s.name,
      activity: s.activity,
      direction: s.direction,
      sort: i,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Set a chart account's default 现金流量项目 (auto-suggest source). */
export async function setAccountDefaultCashFlowItemTx(
  tx: TxClient,
  code: string,
  cashFlowItem: string | null,
): Promise<void> {
  await tx.account.updateMany({ where: { code }, data: { defaultCashFlowItem: cashFlowItem } });
}

/**
 * Tag a voucher's line(s) with a 现金流量项目, post-hoc (the pre-close worklist).
 * Matches by (voucherId, accountCode) — the worklist's granularity; a `null` item
 * clears the tag. Only `cash_flow_item` changes (debit/credit untouched), so
 * 借贷必平 + balances hold. Returns the number of lines updated.
 */
export async function tagVoucherLineCashFlowTx(
  tx: TxClient,
  voucherId: string,
  accountCode: string,
  cashFlowItem: string | null,
): Promise<number> {
  const result = await tx.journalEntryLine.updateMany({
    where: { voucherId, accountCode },
    data: { cashFlowItem },
  });
  return result.count;
}

/* ---- Payment document (出纳收付款单, T-007) — ledger-scoped ---- */

export interface PaymentDocEntity {
  id: string;
  ledgerBookId: string;
  no: string;
  direction: string;
  /** YYYY-MM-DD */
  date: string;
  period: string;
  counterparty: string;
  partnerId: string | null;
  summary: string;
  /** 2dp string */
  amount: string;
  cashAccountCode: string;
  contraAccountCode: string;
  status: string;
  settlementVoucherId: string | null;
  contractId: string | null;
  maker: string;
  approver: string | null;
  confirmer: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function toPaymentDoc(p: {
  id: string;
  ledgerBookId: string;
  no: string;
  direction: string;
  date: Date;
  period: string;
  counterparty: string;
  partnerId: string | null;
  summary: string;
  amount: Prisma.Decimal;
  cashAccountCode: string;
  contraAccountCode: string;
  status: string;
  settlementVoucherId: string | null;
  contractId: string | null;
  maker: string;
  approver: string | null;
  confirmer: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): PaymentDocEntity {
  return {
    id: p.id,
    ledgerBookId: p.ledgerBookId,
    no: p.no,
    direction: p.direction,
    date: p.date.toISOString().slice(0, 10),
    period: p.period,
    counterparty: p.counterparty,
    partnerId: p.partnerId,
    summary: p.summary,
    amount: p.amount.toFixed(2),
    cashAccountCode: p.cashAccountCode,
    contraAccountCode: p.contraAccountCode,
    status: p.status,
    settlementVoucherId: p.settlementVoucherId,
    contractId: p.contractId,
    maker: p.maker,
    approver: p.approver,
    confirmer: p.confirmer,
    version: p.version,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export interface CreatePaymentDocInput {
  ledgerBookId: string;
  no: string;
  direction: string;
  date: string;
  period: string;
  counterparty: string;
  partnerId?: string | null;
  summary: string;
  amount: string;
  cashAccountCode: string;
  contraAccountCode: string;
  maker: string;
  contractId?: string | null;
}

export async function createPaymentDocTx(
  tx: TxClient,
  input: CreatePaymentDocInput,
): Promise<PaymentDocEntity> {
  const row = await tx.paymentDoc.create({
    data: {
      ledgerBookId: input.ledgerBookId,
      no: input.no,
      direction: input.direction,
      date: new Date(input.date),
      period: input.period,
      counterparty: input.counterparty,
      partnerId: input.partnerId ?? null,
      summary: input.summary,
      amount: input.amount,
      cashAccountCode: input.cashAccountCode,
      contraAccountCode: input.contraAccountCode,
      status: 'draft',
      contractId: input.contractId ?? null,
      maker: input.maker,
    },
  });
  return toPaymentDoc(row);
}

export async function getPaymentDocTx(tx: TxClient, id: string): Promise<PaymentDocEntity | null> {
  const row = await tx.paymentDoc.findUnique({ where: { id } });
  return row ? toPaymentDoc(row) : null;
}

export async function listPaymentDocsTx(
  tx: TxClient,
  filters?: { status?: string; direction?: string; partnerId?: string },
): Promise<PaymentDocEntity[]> {
  const rows = await tx.paymentDoc.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.direction ? { direction: filters.direction } : {}),
      ...(filters?.partnerId ? { partnerId: filters.partnerId } : {}),
    },
    orderBy: [{ date: 'desc' }, { no: 'desc' }],
  });
  return rows.map(toPaymentDoc);
}

/** Count documents of a direction in a period — for `收-/付-YYYY-MM-NNN` numbering. */
export async function countPaymentDocsInPeriodTx(
  tx: TxClient,
  period: string,
  direction: string,
): Promise<number> {
  return tx.paymentDoc.count({ where: { period, direction } });
}

export interface UpdatePaymentDocInput {
  expectedVersion: number;
  status?: string;
  approver?: string | null;
  confirmer?: string | null;
  settlementVoucherId?: string | null;
  /** Draft-only edits. */
  counterparty?: string;
  summary?: string;
  amount?: string;
  cashAccountCode?: string;
  contraAccountCode?: string;
  date?: string;
  period?: string;
}

/** Optimistic update (version-guarded). Returns null on a version mismatch (conflict). */
export async function updatePaymentDocTx(
  tx: TxClient,
  id: string,
  input: UpdatePaymentDocInput,
): Promise<PaymentDocEntity | null> {
  const data: Prisma.PaymentDocUpdateManyMutationInput = { version: { increment: 1 } };
  if (input.status !== undefined) data.status = input.status;
  if (input.approver !== undefined) data.approver = input.approver;
  if (input.confirmer !== undefined) data.confirmer = input.confirmer;
  if (input.settlementVoucherId !== undefined) data.settlementVoucherId = input.settlementVoucherId;
  if (input.counterparty !== undefined) data.counterparty = input.counterparty;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.cashAccountCode !== undefined) data.cashAccountCode = input.cashAccountCode;
  if (input.contraAccountCode !== undefined) data.contraAccountCode = input.contraAccountCode;
  if (input.date !== undefined) data.date = new Date(input.date);
  if (input.period !== undefined) data.period = input.period;

  const res = await tx.paymentDoc.updateMany({
    where: { id, version: input.expectedVersion },
    data,
  });
  if (res.count === 0) return null;
  return getPaymentDocTx(tx, id);
}

/* ---- Contract (合同, T-005) — ledger-scoped ---- */

export interface ContractEntity {
  id: string;
  ledgerBookId: string;
  code: string;
  title: string;
  type: string;
  counterparty: string;
  partnerId: string | null;
  amount: string | null;
  currency: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  summary: string;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function toContract(c: {
  id: string;
  ledgerBookId: string;
  code: string;
  title: string;
  type: string;
  counterparty: string;
  partnerId: string | null;
  amount: Prisma.Decimal | null;
  currency: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  summary: string;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): ContractEntity {
  return {
    id: c.id,
    ledgerBookId: c.ledgerBookId,
    code: c.code,
    title: c.title,
    type: c.type,
    counterparty: c.counterparty,
    partnerId: c.partnerId,
    amount: c.amount ? c.amount.toFixed(2) : null,
    currency: c.currency,
    status: c.status,
    startDate: c.startDate ? c.startDate.toISOString().slice(0, 10) : null,
    endDate: c.endDate ? c.endDate.toISOString().slice(0, 10) : null,
    summary: c.summary,
    createdBy: c.createdBy,
    version: c.version,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export interface CreateContractInput {
  ledgerBookId: string;
  code: string;
  title: string;
  type: string;
  counterparty: string;
  partnerId?: string | null;
  amount?: string | null;
  currency?: string;
  startDate?: string | null;
  endDate?: string | null;
  summary?: string;
  createdBy: string;
}

export async function createContractTx(
  tx: TxClient,
  input: CreateContractInput,
): Promise<ContractEntity> {
  const row = await tx.contract.create({
    data: {
      ledgerBookId: input.ledgerBookId,
      code: input.code,
      title: input.title,
      type: input.type,
      counterparty: input.counterparty,
      partnerId: input.partnerId ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? 'CNY',
      status: 'draft',
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      summary: input.summary ?? '',
      createdBy: input.createdBy,
    },
  });
  return toContract(row);
}

export async function getContractTx(tx: TxClient, id: string): Promise<ContractEntity | null> {
  const row = await tx.contract.findUnique({ where: { id } });
  return row ? toContract(row) : null;
}

export async function listContractsTx(
  tx: TxClient,
  filters?: { status?: string; type?: string; partnerId?: string },
): Promise<ContractEntity[]> {
  const rows = await tx.contract.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.partnerId ? { partnerId: filters.partnerId } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { code: 'desc' }],
  });
  return rows.map(toContract);
}

export async function countContractsTx(tx: TxClient): Promise<number> {
  return tx.contract.count();
}

export interface UpdateContractInput {
  expectedVersion: number;
  title?: string;
  type?: string;
  counterparty?: string;
  partnerId?: string | null;
  amount?: string | null;
  currency?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  summary?: string;
}

/** Optimistic update (version-guarded). Returns null on a version mismatch (conflict). */
export async function updateContractTx(
  tx: TxClient,
  id: string,
  input: UpdateContractInput,
): Promise<ContractEntity | null> {
  const data: Prisma.ContractUpdateManyMutationInput = { version: { increment: 1 } };
  if (input.title !== undefined) data.title = input.title;
  if (input.type !== undefined) data.type = input.type;
  if (input.counterparty !== undefined) data.counterparty = input.counterparty;
  if (input.partnerId !== undefined) data.partnerId = input.partnerId;
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.status !== undefined) data.status = input.status;
  if (input.startDate !== undefined)
    data.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null;
  if (input.summary !== undefined) data.summary = input.summary;

  const res = await tx.contract.updateMany({ where: { id, version: input.expectedVersion }, data });
  if (res.count === 0) return null;
  return getContractTx(tx, id);
}

/** Vouchers / payments linked to a contract — the timeline's authoritative documents (T-005). */
export async function listVouchersByContractTx(
  tx: TxClient,
  contractId: string,
): Promise<VoucherEntity[]> {
  const rows = await tx.journalVoucher.findMany({
    where: { contractId },
    orderBy: [{ date: 'asc' }, { no: 'asc' }],
  });
  return rows.map((v) => toVoucher(v));
}

export async function listPaymentDocsByContractTx(
  tx: TxClient,
  contractId: string,
): Promise<PaymentDocEntity[]> {
  const rows = await tx.paymentDoc.findMany({
    where: { contractId },
    orderBy: [{ date: 'asc' }, { no: 'asc' }],
  });
  return rows.map(toPaymentDoc);
}

/* ---- BusinessPartner (往来单位, T-012) — ledger-scoped ---- */

export interface BusinessPartnerEntity {
  id: string;
  ledgerBookId: string;
  /** organization | individual */
  partyType: string;
  name: string;
  roles: string[];
  tags: string[];
  memberUserId: string | null;
  wechat: string;
  remark: string;
  active: boolean;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBusinessPartnerInput {
  ledgerBookId: string;
  partyType: string;
  name: string;
  roles?: string[];
  tags?: string[];
  memberUserId?: string | null;
  wechat?: string;
  remark?: string;
  createdBy: string;
}

export async function createBusinessPartnerTx(
  tx: TxClient,
  input: CreateBusinessPartnerInput,
): Promise<BusinessPartnerEntity> {
  return tx.businessPartner.create({
    data: {
      ledgerBookId: input.ledgerBookId,
      partyType: input.partyType,
      name: input.name,
      roles: input.roles ?? [],
      tags: input.tags ?? [],
      memberUserId: input.memberUserId ?? null,
      wechat: input.wechat ?? '',
      remark: input.remark ?? '',
      createdBy: input.createdBy,
    },
  });
}

export async function getBusinessPartnerTx(
  tx: TxClient,
  id: string,
): Promise<BusinessPartnerEntity | null> {
  return tx.businessPartner.findUnique({ where: { id } });
}

export async function listBusinessPartnersTx(
  tx: TxClient,
  filters?: { active?: boolean; partyType?: string; role?: string; q?: string },
): Promise<BusinessPartnerEntity[]> {
  const rows = await tx.businessPartner.findMany({
    where: {
      ...(filters?.active !== undefined ? { active: filters.active } : {}),
      ...(filters?.partyType ? { partyType: filters.partyType } : {}),
      ...(filters?.role ? { roles: { has: filters.role } } : {}),
      ...(filters?.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: 'insensitive' } },
              { wechat: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  return rows;
}

export interface UpdateBusinessPartnerInput {
  expectedVersion: number;
  partyType?: string;
  name?: string;
  roles?: string[];
  tags?: string[];
  memberUserId?: string | null;
  wechat?: string;
  remark?: string;
  active?: boolean;
}

/** Optimistic update (version-guarded). Returns null on a version mismatch (conflict). */
export async function updateBusinessPartnerTx(
  tx: TxClient,
  id: string,
  input: UpdateBusinessPartnerInput,
): Promise<BusinessPartnerEntity | null> {
  const data: Prisma.BusinessPartnerUpdateManyMutationInput = { version: { increment: 1 } };
  if (input.partyType !== undefined) data.partyType = input.partyType;
  if (input.name !== undefined) data.name = input.name;
  if (input.roles !== undefined) data.roles = input.roles;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.memberUserId !== undefined) data.memberUserId = input.memberUserId;
  if (input.wechat !== undefined) data.wechat = input.wechat;
  if (input.remark !== undefined) data.remark = input.remark;
  if (input.active !== undefined) data.active = input.active;

  const res = await tx.businessPartner.updateMany({
    where: { id, version: input.expectedVersion },
    data,
  });
  if (res.count === 0) return null;
  return getBusinessPartnerTx(tx, id);
}

/* ---- AccountPreference (科目展示偏好, T-012 D5) — ledger-scoped, display-only ---- */

export interface AccountPreferenceEntity {
  ledgerBookId: string;
  /** '' = the ledger default (team recommended); else a member's personal prefs. */
  userId: string;
  recommended: string[];
  pinned: string[];
  hidden: string[];
}

export async function getAccountPreferenceTx(
  tx: TxClient,
  userId: string,
): Promise<AccountPreferenceEntity | null> {
  const row = await tx.accountPreference.findFirst({ where: { userId } });
  if (!row) return null;
  return {
    ledgerBookId: row.ledgerBookId,
    userId: row.userId,
    recommended: row.recommended,
    pinned: row.pinned,
    hidden: row.hidden,
  };
}

export interface UpsertAccountPreferenceInput {
  ledgerBookId: string;
  userId: string;
  recommended?: string[];
  pinned?: string[];
  hidden?: string[];
}

export async function upsertAccountPreferenceTx(
  tx: TxClient,
  input: UpsertAccountPreferenceInput,
): Promise<AccountPreferenceEntity> {
  const update: { recommended?: string[]; pinned?: string[]; hidden?: string[] } = {};
  if (input.recommended !== undefined) update.recommended = input.recommended;
  if (input.pinned !== undefined) update.pinned = input.pinned;
  if (input.hidden !== undefined) update.hidden = input.hidden;
  const row = await tx.accountPreference.upsert({
    where: { ledgerBookId_userId: { ledgerBookId: input.ledgerBookId, userId: input.userId } },
    update,
    create: {
      ledgerBookId: input.ledgerBookId,
      userId: input.userId,
      recommended: input.recommended ?? [],
      pinned: input.pinned ?? [],
      hidden: input.hidden ?? [],
    },
  });
  return {
    ledgerBookId: row.ledgerBookId,
    userId: row.userId,
    recommended: row.recommended,
    pinned: row.pinned,
    hidden: row.hidden,
  };
}

export { Prisma } from '@prisma/client';
export type { PrismaClient } from '@prisma/client';
