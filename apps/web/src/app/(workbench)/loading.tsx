import type { ReactElement } from 'react';
import { SceneSkeleton } from '@my-erp/ui/primitives';

/**
 * Route-group loading state. Rendered instantly on navigation (before the target
 * page's server work resolves), so a nav click paints an on-brand skeleton rather
 * than freezing on the previous page. SceneSkeleton mirrors the Scene layout, so
 * the swap to real content lands without a layout jump.
 */
export default function WorkbenchLoading(): ReactElement {
  return <SceneSkeleton />;
}
