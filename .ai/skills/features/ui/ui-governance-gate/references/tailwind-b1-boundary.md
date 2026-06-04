# Tailwind Boundary: B1 (Layout-only)

B1 means Tailwind is permitted **only** for structural layout and sizing.

## Allowed (examples)

- Display/layout: `flex`, `grid`, `hidden`, `block`
- Alignment: `items-*`, `justify-*`, `content-*`, `self-*`
- Flex/grid structure: `flex-row`, `flex-col`, `grow`, `shrink`, `basis-*`, `grid-cols-*`, `col-span-*`
- Positioning: `relative`, `absolute`, `sticky`, `top-*`, `left-*`
- Overflow and truncation: `overflow-*`, `truncate`, `whitespace-nowrap`, `break-words`
- Size: `w-*`, `h-*`, `min-w-*`, `min-h-*`, `max-w-*`

## Disallowed (non-exhaustive)

- Color/visual: `bg-*`, `text-*`, gradients (`from-*`, `to-*`), `decoration-*`
- Typography: `font-*`, `leading-*`, `tracking-*`
- Shape/elevation: `rounded*`, `shadow*`, `ring-*`, `outline-*`
- Borders: `border*`, `divide-*`
- Spacing: `p*`, `m*` (padding/margin) — spacing must come from contract roles
- Arbitrary values: any `[...]`

## Compatibility note

This boundary is enforced by `ui-governance-gate` with regex-based checks. If your codebase uses complex class composition, you may need to adjust `ui/config/governance.json`.
