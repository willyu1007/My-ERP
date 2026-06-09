/**
 * @my-erp/ui — morethan workbench kit (scenario-agnostic).
 * Ported from the morethan ecosystem; carries no domain vocabulary. A scenario
 * (finance first) supplies nav config + view-models and composes these pieces.
 * Styles: import '@my-erp/ui/styles.css' once at the app root.
 */

// Presentation models (scenario-agnostic contracts)
export * from './model/nav';
export * from './model/card-model';
export * from './model/table-model';
export * from './model/row-model';

// Shell
export * from './components/app-shell';
export * from './components/sidebar';
export * from './components/sidebar-create';
export * from './components/account-menu';
export * from './components/breadcrumb';
export * from './components/topbar-slot';

// Scene + List paradigm
export * from './components/scene';
export * from './components/list-view';
export * from './components/entity-table';
export * from './components/entity-row';
export * from './components/entity-card';
export * from './components/table-cells';

// Atoms / primitives
export * from './components/primitives';
export * from './components/badge';
export * from './components/menu';
export * from './components/overlay';
export * from './components/tabs';
export * from './components/toast';
export * from './components/copy-field';
export * from './components/icons';
