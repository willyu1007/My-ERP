# 02 - Architecture

## Boundary
This task changes only public frontend module boundaries. It does not alter finance data ownership, ledger-scope
authorization, RLS assumptions, API routes, or accounting workflows.

## Public API stance
- `@willyu1007/web-workbench` root entry remains available for legacy consumers.
- New grouped entries are additive and become the recommended public surface.
- `./components/*` and `./dist/*` remain internal and are not consumed by My-ERP.
- `@my-erp/ui` root entry remains as a temporary compatibility barrel, but app code must use grouped entries.

## Expected effect
Narrow imports give Next.js a smaller static dependency graph per route. A ledger route that needs stats and badges
should not require settings frames, queue components, record views, hub components, or app shell code just because it
imports from a root facade.
