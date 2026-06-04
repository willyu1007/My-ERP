// Template: React hook scaffold (TypeScript)

import { useCallback, useState } from 'react';

export function useExample() {
  const [value, setValue] = useState<string>('');

  const update = useCallback((next: string) => {
    setValue(next);
  }, []);

  return { value, update };
}
