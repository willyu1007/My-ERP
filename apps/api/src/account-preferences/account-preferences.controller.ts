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
function sanitizeCodes(known: ReadonlySet<string>, value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((c) => typeof c === 'string'))
    throw new BadRequestException(`${field} must be an array of account codes`);
  const unique = [...new Set(value.map((c) => c.trim()).filter(Boolean))].slice(0, MAX_CODES);
  return unique.filter((code) => known.has(code));
}

async function knownCodes(tx: TxClient): Promise<ReadonlySet<string>> {
  return new Set((await listAccountsTx(tx)).map((a) => a.code));
}

/** The merged picker view: team default + the caller's personal prefs. */
async function mergedPreferences(tx: TxClient, ledgerBookId: string, userId: string) {
  const ledgerDefault = await getAccountPreferenceTx(tx, ledgerBookId, LEDGER_DEFAULT);
  const personal = await getAccountPreferenceTx(tx, ledgerBookId, userId);
  return {
    recommended: ledgerDefault?.recommended ?? [],
    pinned: personal?.pinned ?? [],
    hidden: personal?.hidden ?? [],
  };
}

/**
 * 科目展示偏好 (T-012 D5): ledger default (recommended) + personal (pinned/hidden).
 * Display/ranking only — validity, hierarchy, leaf-only posting, and permissions
 * are untouched; hidden accounts stay searchable in the picker.
 */
@Controller('account-preferences')
@UseGuards(AuthGuard, PermissionGuard, LedgerScopeGuard)
export class AccountPreferencesController {
  @Get()
  @RequirePermission('read', 'Account')
  async get(@LedgerBookId() ledgerBookId: string, @CurrentIdentity() identity: Identity) {
    return withLedgerScope(ledgerBookId, (tx) =>
      mergedPreferences(tx, ledgerBookId, identity.userId),
    );
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
      const known = await knownCodes(tx);
      const patch: { pinned?: string[]; hidden?: string[] } = {};
      if (body.pinned !== undefined) patch.pinned = sanitizeCodes(known, body.pinned, 'pinned');
      if (body.hidden !== undefined) patch.hidden = sanitizeCodes(known, body.hidden, 'hidden');
      await upsertAccountPreferenceTx(tx, { ledgerBookId, userId: identity.userId, ...patch });
      return mergedPreferences(tx, ledgerBookId, identity.userId);
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
      const recommended = sanitizeCodes(await knownCodes(tx), body.recommended ?? [], 'recommended');
      await upsertAccountPreferenceTx(tx, { ledgerBookId, userId: LEDGER_DEFAULT, recommended });
      return mergedPreferences(tx, ledgerBookId, identity.userId);
    });
  }
}
