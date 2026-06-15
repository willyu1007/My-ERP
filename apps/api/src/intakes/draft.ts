import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  appendAuditRecordTx,
  countVouchersInPeriodTx,
  createVoucherTx,
  listAccountsTx,
  updateIntakeTx,
  type IntakeEntity,
  type TxClient,
  type VoucherLineInput,
} from '@my-erp/db';
import { ExtractionResultSchema, type ExtractionResult } from '@my-erp/contracts';
import {
  buildDraftFromExtraction,
  Money,
  selectPostingTemplate,
  type PostingExtraction,
} from '@my-erp/finance-domain';
import type { Identity } from '@my-erp/platform';
import { createVoucherConfirmWorkItemTx } from '../work-items/voucher-workflow';
import { appendIntakeOutboxEventTx } from './intake-outbox';

const HIGH_CONFIDENCE = 0.8;

/** Flatten the contracts `ExtractionResult` (fields with confidence) to the
 *  value-only `PostingExtraction` the finance posting templates consume. */
export function flattenExtraction(x: ExtractionResult): PostingExtraction {
  const f = x.fields;
  return {
    docType: x.docType,
    direction: f.direction?.value,
    amount: f.amount?.value,
    date: f.date?.value,
    summary: f.summary?.value,
    docNo: f.docNo?.value,
    counterparty: f.counterparty?.value,
  };
}

/** G1: auto-draft only when a template matches and overall confidence is high. */
export function shouldAutoDraft(x: ExtractionResult): boolean {
  return x.confidence >= HIGH_CONFIDENCE && selectPostingTemplate(flattenExtraction(x)) !== null;
}

/** Complete (all lines have accounts) + high confidence → one-tap confirm; else manual completion. */
export function confirmSubStatus(
  complete: boolean,
  confidence: number | null,
): 'pending_confirmation' | 'pending_completion' {
  return complete && (confidence ?? 0) >= HIGH_CONFIDENCE
    ? 'pending_confirmation'
    : 'pending_completion';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sumColumn(
  lines: readonly VoucherLineInput[],
  pick: (l: VoucherLineInput) => string | null | undefined,
): string {
  return lines
    .reduce((acc, l) => {
      const v = pick(l);
      return v ? acc.add(Money.of(v)) : acc;
    }, Money.zero())
    .toString();
}

/**
 * Build + persist a voucher draft from an extracted intake, in one transaction,
 * and open a `voucher.confirm` work item. Version-guarded one-shot (extracted →
 * drafted). Only account-bearing lines are persisted (JournalEntryLine.accountCode
 * is NOT NULL); the contra line is left for the human to fill in the fast-entry
 * grid (→ pending_completion). Returns the drafted intake.
 */
export async function draftVoucherFromIntakeTx(
  tx: TxClient,
  input: { identity: Identity; ledgerBookId: string; intake: IntakeEntity; occurredAt: string },
): Promise<IntakeEntity> {
  const { identity, ledgerBookId, intake, occurredAt } = input;
  const parsed = ExtractionResultSchema.safeParse(intake.extraction);
  if (!parsed.success) throw new BadRequestException('intake has no valid extraction');
  const posting = flattenExtraction(parsed.data);
  const built = buildDraftFromExtraction(posting);

  const accounts = new Map((await listAccountsTx(tx)).map((a) => [a.code, a]));
  const lines: VoucherLineInput[] = (built?.draft.lines ?? [])
    .filter((l) => l.accountCode)
    .map((l) => {
      const acct = accounts.get(l.accountCode as string);
      if (!acct) throw new BadRequestException(`account ${l.accountCode} not found`);
      return {
        accountCode: l.accountCode as string,
        accountName: acct.name,
        summary: l.summary,
        debit: l.debit ?? null,
        credit: l.credit ?? null,
      };
    });

  const date = posting.date ?? todayIso();
  const period = date.slice(0, 7);
  const summary = built?.draft.summary ?? posting.summary ?? '待补全凭证（票据捕获）';
  const seq = (await countVouchersInPeriodTx(tx, period)) + 1;
  const no = `记-${period}-${String(seq).padStart(3, '0')}`;
  const voucher = await createVoucherTx(tx, {
    ledgerBookId,
    no,
    date,
    period,
    summary,
    maker: identity.userId,
    totalDebit: sumColumn(lines, (l) => l.debit),
    totalCredit: sumColumn(lines, (l) => l.credit),
    lines,
  });

  const updated = await updateIntakeTx(tx, intake.id, {
    status: 'drafted',
    targetType: 'JournalVoucher',
    targetId: voucher.id,
    expectedVersion: intake.version,
  });
  if (!updated) throw new ConflictException('intake changed concurrently');

  await createVoucherConfirmWorkItemTx(tx, {
    orgId: identity.orgId,
    ledgerBookId,
    voucherId: voucher.id,
    actorId: identity.userId,
    subStatus: confirmSubStatus(built?.complete ?? false, intake.confidence),
  });
  await appendAuditRecordTx(tx, {
    actorId: identity.userId,
    action: 'DRAFT_VOUCHER_FROM_INTAKE',
    entityType: 'Voucher',
    entityId: voucher.id,
    ledgerBookId,
  });
  await appendIntakeOutboxEventTx(tx, updated, 'intake.drafted', occurredAt);
  return updated;
}
