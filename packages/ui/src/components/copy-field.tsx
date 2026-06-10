'use client';

import { useState } from 'react';
import { IconCheck, IconCopy } from '@willyu1007/web-workbench';

export function CopyField({
  value,
  label,
}: {
  readonly value: string;
  readonly label?: string;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div className="wb-copy">
      {label && (
        <span className="wb-hint" style={{ flexShrink: 0 }}>
          {label}
        </span>
      )}
      <span className="wb-copy__text" title={value}>
        {value || '—'}
      </span>
      <button
        type="button"
        className="wb-iconbtn"
        onClick={() => void copy()}
        aria-label="复制"
        disabled={!value}
      >
        {copied ? (
          <IconCheck size={15} style={{ color: 'var(--mt-success)' }} />
        ) : (
          <IconCopy size={15} />
        )}
      </button>
    </div>
  );
}
