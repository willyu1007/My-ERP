/**
 * @my-erp/ui — host UI surface for the My-ERP web app.
 *
 * Composition over fork: the scenario-agnostic workbench kit (Scene/List
 * paradigms, primitives, contracts, icons, styles) comes from the shared
 * `@willyu1007/web-workbench` package. New app code should import from grouped
 * subpaths such as `@my-erp/ui/primitives`, `@my-erp/ui/list`, and
 * `@my-erp/ui/feedback`. This root entry is kept as a legacy compatibility
 * barrel only.
 *
 * Styles: import '@willyu1007/web-workbench/styles/index.css' once at the app root.
 */

// Legacy compatibility root barrel. Avoid this entry in app source.
export * from '@willyu1007/web-workbench';

export * from './components/copy-field';
