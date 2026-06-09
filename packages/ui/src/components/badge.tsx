import type { ReactNode } from 'react';
import type { CardTone } from '../model/card-model';

export type BadgeTone = CardTone;

/**
 * Generic status badge: a semantic tone + label. Domain status→tone mapping
 * lives in the consuming scenario (e.g. apps/web/lib/finance), keeping this
 * component domain-agnostic.
 */
export function Badge({
  tone,
  dot,
  children,
}: {
  readonly tone?: BadgeTone;
  readonly dot?: boolean;
  readonly children: ReactNode;
}): React.ReactElement {
  const cls = ['mt-badge'];
  if (tone) cls.push(`mt-badge--${tone}`);
  if (dot) cls.push('mt-badge--dot');
  return <span className={cls.join(' ')}>{children}</span>;
}
