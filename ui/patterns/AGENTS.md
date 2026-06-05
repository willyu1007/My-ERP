# UI Patterns (v1)

## Purpose
These patterns are **usage-level contracts** for LLM-driven UI construction under the `data-ui` contract.

## Rules (MUST)
- Patterns MAY recommend structure and slot usage.
- Patterns MUST NOT introduce new visual primitives.
- Visual changes belong to `ui/tokens/` and `ui/contract/`.
- If a pattern needs new variants or states, propose a contract expansion via RFC.

## Included patterns
- `list-with-filters.md`
- `detail.md`
- `form.md`
- `wizard.md` (optional)

## Vocabulary (roles/slots)

Use these roles/slots:
- `page` slots: `header`, `content`, `footer`, `aside`
- `section` slots: `header`, `content`, `footer`
- `toolbar` slots: `start`, `center`, `end`
- `card` slots: `header`, `body`, `footer`
- `field` slots: `label`, `control`, `help`, `error`

## Tailwind boundary (B1)

Tailwind MAY be used **only** for layout (`flex`, `grid`, `position`, `overflow`, `size`, `truncate`).

Tailwind MUST NOT be used for:
- color
- typography
- radius
- shadows
- spacing

## Verification
- Pattern changes do not require new tokens or contract changes (otherwise stop and propose an RFC).
