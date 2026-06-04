# Pattern: List with Filters

Use when the page is primarily a list/table with search, filters, and primary actions.

## Structure (recommended)

- `page (layout=app)`
  - `page[slot=header]`
    - `toolbar` (start: title/breadcrumb, center: search, end: actions)
  - `page[slot=content]`
    - `section`
      - `section[slot=header]`: filters summary / secondary actions
      - `section[slot=content]`: `table` or `list`
      - `section[slot=footer]`: pagination

## Notes
- Prefer a single primary action in the top-right (toolbar end).
- Filters should not be styled ad-hoc; express with `field` + controls.
- Empty states should use `empty-state` role.
