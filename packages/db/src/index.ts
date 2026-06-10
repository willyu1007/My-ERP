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
      lines: { create: lineCreateData(ledgerBookId, input.lines) },
    },
  });
}

export interface VoucherStatusPatch {
  status: string;
  checker?: string | null;
  postedAt?: Date | null;
  reversedBy?: string | null;
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
  summary: string;
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
    include: { voucher: { select: { no: true, date: true } } },
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
    summary: l.summary,
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

export { Prisma } from '@prisma/client';
export type { PrismaClient } from '@prisma/client';
