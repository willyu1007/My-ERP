/**
 * Standard-chart diff/import engine (T-012 Phase 2, D6).
 *
 * Existing ledgers must never be silently mutated: additions are computed as an
 * explicit diff first, and the only permitted change to an EXISTING row is the
 * leaf→branch flip of a parent that has no accounting activity (no voucher lines,
 * no opening balance). A posted/opened leaf never becomes a branch here — its
 * template children are reported as conflicts for a human to resolve.
 */
import {
  accountHasActivityTx,
  seedAccountsTx,
  setAccountLeafTx,
  type AccountEntity,
  type TxClient,
} from '@my-erp/db';
import type { ChartAccountSeed } from '@my-erp/platform';

export interface StandardChartDiff {
  /** Template accounts missing from the ledger — safe to add. */
  readonly additions: readonly ChartAccountSeed[];
  /** Existing childless leaves (no activity) that gain template children. */
  readonly parentConversions: readonly { code: string; name: string }[];
  /** Template accounts skipped because their parent is a leaf with activity. */
  readonly conflicts: readonly { code: string; name: string; reason: string }[];
  /** Template accounts already present (never touched). */
  readonly present: number;
}

export async function computeStandardChartDiffTx(
  tx: TxClient,
  chart: readonly ChartAccountSeed[],
  existing: readonly AccountEntity[],
): Promise<StandardChartDiff> {
  const byCode = new Map(existing.map((a) => [a.code, a]));
  const additions: ChartAccountSeed[] = [];
  const conversions: { code: string; name: string }[] = [];
  const conflicts: { code: string; name: string; reason: string }[] = [];
  const conflictedParents = new Set<string>();
  let present = 0;

  // Template order is code-ascending pre-order, so parents are decided before children.
  const added = new Set<string>();
  for (const seed of chart) {
    if (byCode.has(seed.code)) {
      present += 1;
      continue;
    }
    if (seed.parentCode !== null && conflictedParents.has(seed.parentCode)) {
      conflicts.push({
        code: seed.code,
        name: seed.name,
        reason: `父科目 ${seed.parentCode} 已有记账记录，需手工处理`,
      });
      continue;
    }
    const existingParent = seed.parentCode === null ? null : byCode.get(seed.parentCode);
    if (existingParent && existingParent.isLeaf) {
      if (await accountHasActivityTx(tx, existingParent.code)) {
        conflictedParents.add(existingParent.code);
        conflicts.push({
          code: seed.code,
          name: seed.name,
          reason: `父科目 ${existingParent.code} 已有记账记录，需手工处理`,
        });
        continue;
      }
      if (!conversions.some((c) => c.code === existingParent.code)) {
        conversions.push({ code: existingParent.code, name: existingParent.name });
      }
    }
    // A missing parent is either earlier in `additions` (template pre-order) or absent
    // from the template entirely — the latter cannot happen for a well-formed chart.
    if (seed.parentCode !== null && !byCode.has(seed.parentCode) && !added.has(seed.parentCode)) {
      conflicts.push({
        code: seed.code,
        name: seed.name,
        reason: `父科目 ${seed.parentCode} 不存在`,
      });
      continue;
    }
    additions.push(seed);
    added.add(seed.code);
  }

  return { additions, parentConversions: conversions, conflicts, present };
}

export interface StandardChartImportResult {
  readonly added: number;
  readonly convertedParents: number;
  readonly conflicts: StandardChartDiff['conflicts'];
}

/** Apply a computed diff: flip safe parents to branches, then insert the additions. */
export async function applyStandardChartDiffTx(
  tx: TxClient,
  ledgerBookId: string,
  diff: StandardChartDiff,
): Promise<StandardChartImportResult> {
  for (const parent of diff.parentConversions) {
    await setAccountLeafTx(tx, parent.code, false);
  }
  const added = await seedAccountsTx(tx, ledgerBookId, diff.additions);
  return { added, convertedParents: diff.parentConversions.length, conflicts: diff.conflicts };
}
