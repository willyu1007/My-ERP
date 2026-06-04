# Global CSS vs Feature CSS (Responsibilities)

## Layer model

Layer order is fixed:

1. `reset`
2. `tokens`
3. `contract`
4. `utilities`
5. `feature`

Entrypoint: `ui/styles/ui.css`.

## Global CSS (tokens + contract)

**Global is the single source of styling truth.**

- `tokens` sets **CSS variables only**.
- `contract` defines how `data-ui` roles/attrs map to tokens.

Global CSS is allowed to set:
- color, typography, spacing, radius, shadow, borders
- component-like appearance for contract roles

Global CSS must be:
- small and predictable
- token-driven (no random hard-coded values unless they are tokens)

## Feature CSS

Feature CSS may exist, but it is restricted to:
- structural layout only (grid-template-areas, container queries, minor overrides)

Feature CSS MUST NOT set:
- `color`, `background*`
- `font*`, `line-height`
- `border-radius`
- `box-shadow`
- `margin` / `padding` (use contract roles and density instead)

Rationale: feature CSS is the #1 source of drift.

## Pitfalls

- If features set colors locally, themes become unmaintainable.
- If features set spacing locally, density cannot be controlled by tokens.
- If features use Tailwind for padding/margins, contract spacing becomes irrelevant.
