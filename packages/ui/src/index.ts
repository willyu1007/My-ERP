/**
 * @my-erp/ui — host UI surface for the My-ERP web app.
 *
 * Composition over fork: the scenario-agnostic workbench kit (Scene/List
 * paradigms, primitives, contracts, icons, styles) comes from the shared
 * `@willyu1007/web-workbench` package. This package adds only the HOST CHROME
 * the shared kit intentionally leaves to the host (app shell, sidebar, toast,
 * overlay, breadcrumb context, nav config) and re-exports the kit, so apps/web
 * keeps a single `@my-erp/ui` import surface.
 *
 * Styles: import '@willyu1007/web-workbench/styles/index.css' once at the app root.
 */

// Shared workbench kit: Scene/SceneNav, ListView, EntityTable/Row/Card, cell kit,
// primitives (Section/Stat/StatStrip/EmptyState/Meter/Breadcrumb), icons, menu,
// tabs, topbar-slot, StatusBadge, InsightCard, and the contract types.
export * from '@willyu1007/web-workbench';

// Host chrome — not in the shared kit ("lock the chrome, vary the content").
export * from './components/app-shell';
export * from './components/sidebar';
export * from './components/sidebar-create';
export * from './components/account-menu';
export * from './components/breadcrumb';
export * from './components/toast';
export { Drawer as HostDrawer } from './components/overlay';
export * from './components/copy-field';
export * from './model/nav';
