import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  appendAuditRecordTx,
  countActiveChildrenTx,
  createAccountTx,
  getAccountByCodeTx,
  listAccountsTx,
  seedAccountsTx,
  setAccountActiveTx,
  setAccountLeafTx,
  updateAccountTx,
  withLedgerScope,
} from '@my-erp/db';
import {
  isAccountCategory,
  isAccountDirection,
  isAuxType,
  STANDARD_CHART,
  withSpan,
  type Identity,
} from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';

interface CreateAccountBody {
  code: string;
  name: string;
  category: string;
  direction: string;
  parentCode?: string;
  auxTypes: string[];
}

function parseCreateBody(body: unknown): CreateAccountBody {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.code !== 'string' || !/^\d+$/.test(b.code)) throw new BadRequestException('code must be a numeric string');
  if (typeof b.name !== 'string' || b.name.trim() === '') throw new BadRequestException('name is required');
  if (!isAccountCategory(b.category)) throw new BadRequestException('invalid category');
  if (!isAccountDirection(b.direction)) throw new BadRequestException('invalid direction');
  const parentCode = typeof b.parentCode === 'string' && b.parentCode !== '' ? b.parentCode : undefined;
  // A child code must extend its parent's code (e.g. 1002 → 100201) so that
  // ordering by code stays a valid tree pre-order.
  if (parentCode !== undefined && (!b.code.startsWith(parentCode) || b.code.length <= parentCode.length)) {
    throw new BadRequestException('child code must extend the parent code (e.g. 1002 → 100201)');
  }
  const auxTypes = Array.isArray(b.auxTypes) ? b.auxTypes : [];
  if (!auxTypes.every(isAuxType)) throw new BadRequestException('invalid auxTypes');
  const result: CreateAccountBody = { code: b.code, name: b.name.trim(), category: b.category, direction: b.direction, auxTypes };
  if (parentCode !== undefined) result.parentCode = parentCode;
  return result;
}

/**
 * Chart of accounts (会计科目) — ledger-scoped (RLS by app.current_ledger; the
 * ledger is bound to the caller's org by LedgerScopeGuard). Read for all roles;
 * create/update for accountant/admin (操作级). Mutations are audited.
 */
@Controller('accounts')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class AccountsController {
  @Get()
  @RequirePermission('read', 'Account')
  async list(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity) {
    return withSpan('accounts.list', { userId: identity.userId, ledgerBookId, action: 'read' }, () =>
      withLedgerScope(ledgerBookId, (tx) => listAccountsTx(tx)),
    );
  }

  /** Idempotent: seed the 《小企业准则》 standard chart (skips existing codes). */
  @Post('seed-standard')
  @RequirePermission('create', 'Account')
  async seedStandard(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      const seeded = await seedAccountsTx(tx, ledgerBookId, STANDARD_CHART);
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'SEED_STANDARD_CHART',
        entityType: 'Account',
        ledgerBookId,
      });
      return { seeded };
    });
  }

  @Post()
  @RequirePermission('create', 'Account')
  async create(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity, @Body() body: unknown) {
    const input = parseCreateBody(body);
    return withLedgerScope(ledgerBookId, async (tx) => {
      if (await getAccountByCodeTx(tx, input.code)) {
        throw new BadRequestException(`account ${input.code} already exists`);
      }
      let level = 1;
      if (input.parentCode !== undefined) {
        const parent = await getAccountByCodeTx(tx, input.parentCode);
        if (!parent) throw new BadRequestException('parent account not found');
        level = parent.level + 1;
        if (parent.isLeaf) await setAccountLeafTx(tx, parent.code, false); // parent becomes a branch
      }
      const account = await createAccountTx(tx, {
        ledgerBookId,
        code: input.code,
        name: input.name,
        category: input.category,
        direction: input.direction,
        parentCode: input.parentCode ?? null,
        level,
        isLeaf: true,
        auxTypes: input.auxTypes,
      });
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'CREATE_ACCOUNT',
        entityType: 'Account',
        entityId: account.id,
        ledgerBookId,
      });
      return account;
    });
  }

  @Patch(':code')
  @RequirePermission('update', 'Account')
  async update(@LedgerBookId() ledgerBookId: string, @Param('code') code: string, @Body() body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    const patch: { name?: string; auxTypes?: string[] } = {};
    if (b.name !== undefined) {
      if (typeof b.name !== 'string' || b.name.trim() === '') throw new BadRequestException('name must be non-empty');
      patch.name = b.name.trim();
    }
    if (b.auxTypes !== undefined) {
      if (!Array.isArray(b.auxTypes) || !b.auxTypes.every(isAuxType)) throw new BadRequestException('invalid auxTypes');
      patch.auxTypes = b.auxTypes;
    }
    return withLedgerScope(ledgerBookId, async (tx) => {
      if (!(await getAccountByCodeTx(tx, code))) throw new NotFoundException('account not found');
      await updateAccountTx(tx, code, patch);
      return getAccountByCodeTx(tx, code);
    });
  }

  /** Deactivate — blocked if the account still has active children (停用末级校验). */
  @Post(':code/deactivate')
  @HttpCode(200)
  @RequirePermission('update', 'Account')
  async deactivate(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity, @Param('code') code: string) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      const account = await getAccountByCodeTx(tx, code);
      if (!account) throw new NotFoundException('account not found');
      if (!account.active) return account;
      if ((await countActiveChildrenTx(tx, code)) > 0) {
        throw new BadRequestException('cannot deactivate an account with active children');
      }
      await setAccountActiveTx(tx, code, false);
      await appendAuditRecordTx(tx, {
        actorId: identity.userId,
        action: 'DEACTIVATE_ACCOUNT',
        entityType: 'Account',
        entityId: account.id,
        ledgerBookId,
      });
      return getAccountByCodeTx(tx, code);
    });
  }
}
