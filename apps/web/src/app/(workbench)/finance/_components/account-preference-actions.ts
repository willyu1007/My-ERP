'use server';

/** Server actions for 科目展示偏好 (T-012 D5) — display-only picker preferences. */
import type { AccountPreferences } from '@my-erp/api-client';
import { updateAccountPreferences } from '@/lib/finance/data-source';

export type PreferenceActionResult =
  | { readonly ok: true; readonly preferences: AccountPreferences }
  | { readonly ok: false; readonly message: string };

export async function updateAccountPreferencesAction(body: {
  pinned?: string[];
  hidden?: string[];
}): Promise<PreferenceActionResult> {
  try {
    return { ok: true, preferences: await updateAccountPreferences(body) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
