import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  getAccountPreferenceTx,
  listAccountsTx,
  upsertAccountPreferenceTx,
  withLedgerScope,
  type TxClient,
} from '@my-erp/db';
import type { Identity } from '@my-erp/platform';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentIdentity } from '../auth/current-identity.decorator';
import { LedgerBookId } from '../auth/ledger-book-id.decorator';
import { LedgerScopeGuard } from '../auth/ledger-scope.guard';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionGuard } from '../auth/permission.guard';

/** The ledger-default row uses userId '' (one team row per ledger). */
const LEDGER_DEFAULT = '';
const MAX_CODES = 300;

/** Sanitize a code list: strings, deduped, capped, and existing in this ledger. */
async function sanitizeCodes(tx: TxClient, value: unknown, field: string): Promise<string[]> {
  if (!Array.isArray(value) || !value.every((c) => typeof c === 'string'))
    throw new BadRequestException(`${field} must be an array of account codes`);
  const unique = [...new Set(value.map((c) => c.trim()).filter(Boolean))].slice(0, MAX_CODES);
  const known = new Set((await listAccountsTx(tx)).map((a) => a.code));
  return unique.filter((code) => known.has(code));
}

/**
 * 科目展示偏好 (T-012 D5): ledger default (recommended) + personal (pinned/hidden).
 * Display/ranking only — validity, hierarchy, leaf-only posting, and permissions
 * are untouched; hidden accounts stay searchable in the picker.
 */
@Controller('account-preferences')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class AccountPreferencesController {
  /** Merged view for the picker: team default + the caller's personal prefs. */
  @Get()
  @RequirePermission('read', 'Account')
  async get(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      const ledgerDefault = await getAccountPreferenceTx(tx, LEDGER_DEFAULT);
      const personal = await getAccountPreferenceTx(tx, identity.userId);
      return {
        recommended: ledgerDefault?.recommended ?? [],
        pinned: personal?.pinned ?? [],
        hidden: personal?.hidden ?? [],
      };
    });
  }

  /** Update the caller's personal pinned/hidden lists. */
  @Patch()
  @RequirePermission('read', 'Account')
  async updatePersonal(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Body() body: Record<string, unknown>,
  ) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      const patch: { pinned?: string[]; hidden?: string[] } = {};
      if (body.pinned !== undefined) patch.pinned = await sanitizeCodes(tx, body.pinned, 'pinned');
      if (body.hidden !== undefined) patch.hidden = await sanitizeCodes(tx, body.hidden, 'hidden');
      const row = await upsertAccountPreferenceTx(tx, {
        ledgerBookId,
        userId: identity.userId,
        ...patch,
      });
      const ledgerDefault = await getAccountPreferenceTx(tx, LEDGER_DEFAULT);
      return {
        recommended: ledgerDefault?.recommended ?? [],
        pinned: row.pinned,
        hidden: row.hidden,
      };
    });
  }

  /** Update the team's recommended list (authorized accounting/admin — D5). */
  @Patch('ledger-default')
  @RequirePermission('update', 'Account')
  async updateLedgerDefault(
    @LedgerBookId() ledgerBookId: string,
    @CurrentIdentity() identity: Identity,
    @Body() body: Record<string, unknown>,
  ) {
    return withLedgerScope(ledgerBookId, async (tx) => {
      const recommended = await sanitizeCodes(tx, body.recommended ?? [], 'recommended');
      const row = await upsertAccountPreferenceTx(tx, {
        ledgerBookId,
        userId: LEDGER_DEFAULT,
        recommended,
      });
      const personal = await getAccountPreferenceTx(tx, identity.userId);
      return {
        recommended: row.recommended,
        pinned: personal?.pinned ?? [],
        hidden: personal?.hidden ?? [],
      };
    });
  }
}
