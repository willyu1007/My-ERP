# 01 - Plan

## Sequence
1. Update the Workflow Base template package first, because My-ERP should consume a public contract instead of a
   package-internal file layout.
2. Add grouped `@my-erp/ui` facade entries that map one-to-one to the template package entries.
3. Migrate app imports by use case: shell, feedback, primitives, list, settings, queue, and contracts.
4. Add a route-level loading fallback for the workbench segment.
5. Run package and app verification; publish `0.6.6` only when registry credentials allow it.

## Import map
| Use case | My-ERP import |
|---|---|
| App shell and shell nav types | `@my-erp/ui/shell` |
| Toasts and overlays | `@my-erp/ui/feedback` |
| Sections, stats, status badges, tabs, selects, menus, icons, actions | `@my-erp/ui/primitives` |
| Rows, tables, cards, list views | `@my-erp/ui/list` |
| Settings frame and settings schema/value types | `@my-erp/ui/settings` |
| Queues | `@my-erp/ui/queue` |
| Shared display model types | `@my-erp/ui/contracts` |

## Verification plan
- Template: `typecheck`, `build`, and Node ESM resolution for every new subpath.
- My-ERP: `@my-erp/ui` typecheck, `@my-erp/web` typecheck, repo lint, and web build.
- Bundle regression: inspect regenerated route chunks for finance pages and confirm simple routes no longer pull
  unrelated settings/queue/record/hub/app-shell/sidebar modules through the root barrel.
- UX smoke: switch between `ledger`, `reports`, `payments`, and `daily-accounting`; first-time entry should show
  loading immediately and warmed routes should settle quickly.
