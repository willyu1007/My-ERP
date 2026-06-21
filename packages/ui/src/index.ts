/**
 * @my-erp/ui — host UI surface for the My-ERP web app.
 *
 * Composition over fork: the scenario-agnostic workbench kit (Scene/List
 * paradigms, primitives, contracts, icons, styles) comes from the shared
 * `@willyu1007/web-workbench` package. This package adds only the HOST CHROME
 * the shared kit does not own (a copy-to-clipboard field) and re-exports the
 * kit, so apps/web keeps a single `@my-erp/ui` import surface.
 *
 * Styles: import '@willyu1007/web-workbench/styles/index.css' once at the app root.
 */

// Shared workbench kit: app shell + sidebar + breadcrumb + scenario switcher +
// nav config, Scene/SceneNav, ListView, EntityTable/Row/Card, cell kit, primitives,
// icons, menu, tabs, StatusBadge, InsightCard, Drawer, Toast (ToastProvider/useToast),
// and the contract types.
export * from '@willyu1007/web-workbench';

// Host chrome the kit still leaves to the host: a copy-to-clipboard field.
// Toast + Drawer now come from the kit (0.5.0) via the star re-export above —
// the hand-rolled toast.tsx + overlay.tsx duplicates were removed.
export * from './components/copy-field';
