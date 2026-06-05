# Pattern: Detail

Use when the page shows a single entity and related sub-sections.

## Structure (recommended)

- `page (layout=app)`
  - `page[slot=header]`
    - `toolbar` (start: breadcrumb/title, end: entity actions)
  - `page[slot=content]`
    - `grid` (2 cols on desktop; 1 col on small screens)
      - left: `section`(main details)
      - right: `card`(summary/metadata)

## Notes
- Prefer `section` blocks for related information groups.
- Use `badge` for statuses; avoid ad-hoc colors.
- Use `divider` to separate major blocks if needed.
