'use client';

import { useState } from 'react';
import type { AccountPreferences } from '@my-erp/api-client';
import { updateAccountPreferencesAction } from './account-preference-actions';

const EMPTY: AccountPreferences = { recommended: [], pinned: [], hidden: [] };

/**
 * Client state for 科目展示偏好 (T-012 D5): optimistic pin toggling persisted via
 * the server action. Display-only — failures quietly keep the optimistic state
 * for the session (preferences never affect posting validity).
 */
export function useAccountPreferences(initial: AccountPreferences | undefined) {
  const [preferences, setPreferences] = useState<AccountPreferences>(initial ?? EMPTY);

  function togglePin(code: string, pinned: boolean): void {
    const next = pinned
      ? [...preferences.pinned, code]
      : preferences.pinned.filter((c) => c !== code);
    setPreferences({ ...preferences, pinned: next });
    void updateAccountPreferencesAction({ pinned: next }).then((res) => {
      if (res.ok) setPreferences(res.preferences);
    });
  }

  return { preferences, togglePin };
}
