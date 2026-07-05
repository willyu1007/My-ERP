'use server';

/** Server actions for 会计科目 settings (T-012 Phase 2: standard chart v2 import). */
import type { StandardChartImportResult } from '@my-erp/api-client';
import { importStandardChart } from '@/lib/finance/data-source';

export type ChartImportActionResult =
  | { readonly ok: true; readonly result: StandardChartImportResult }
  | { readonly ok: false; readonly message: string };

export async function importStandardChartAction(): Promise<ChartImportActionResult> {
  try {
    return { ok: true, result: await importStandardChart() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
