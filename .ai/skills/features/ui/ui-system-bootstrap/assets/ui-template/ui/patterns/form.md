# Pattern: Form

Use for create/edit workflows.

## Structure (recommended)

- `page (layout=app)`
  - `page[slot=header]`
    - `toolbar` (start: title/breadcrumb, end: secondary actions)
  - `page[slot=content]`
    - `card` (padding=lg)
      - `card[slot=body]`
        - `form (layout=vertical)`
          - repeated `field` blocks:
            - `field[slot=label]` + `field[slot=control]` + optional `field[slot=help]` / `field[slot=error]`
          - `form[slot=actions]`: primary submit + secondary cancel

## Error handling

- When validation fails:
  - Set `aria-invalid=true` and `data-state=error` on the control (`input/select/textarea`).
  - Render error text in `field[slot=error]`.

## Tailwind boundary

Tailwind only for layout. Do not use `text-*`, `bg-*`, `p-*`, `m-*`, `rounded-*`, `shadow-*`.
