# Locked System Parameters (Robustness-first)

These parameters are intentionally **locked** to minimize drift in LLM-led UI development.
Change only via an explicit RFC + approval gate.

## 1) Contract: minimal role set (31 roles)

The `data-ui` contract is the only allowed semantic styling interface.

Roles (stable):
- layout: `page`, `section`, `toolbar`, `stack`, `grid`, `card`, `divider`
- typography: `text`, `link`
- controls: `button`, `icon-button`, `input`, `textarea`, `select`, `checkbox`, `radio`, `switch`
- forms: `form`, `field`
- data display: `table`, `list`, `badge`
- feedback: `alert`, `toast`, `empty-state`
- overlays: `modal`
- navigation: `tabs`, `tab`, `nav`, `breadcrumb`
- identity: `avatar`

Attribute vocabulary is intentionally small and enumerated in `ui/contract/contract.json`.

## 2) Tokens: semantic schema

Tokens are the only place where visual values live.

Required top-level groups:
- `color` (semantic, not brand names)
- `typography` (font families, sizes, weights, line heights)
- `space` (spacing scale)
- `radius` (rounded corners)
- `shadow` (elevation)
- `border` (widths)
- `motion` (durations/easing)
- `z` (z-index)

Optional (use sparingly):
- `sizing` (component widths/heights that must remain tokenized to avoid drift)

Themes MUST override only tokens (ideally `color.*` and at most a small subset of typography/radius/shadow).

## 3) Governance gates: minimum required checks

A change is considered compliant only if it passes these gates:
- Spec validation: tokens + contract JSON are structurally valid
- Code audit:
  - no inline styles (`style=`)
  - no hard-coded color literals in feature code
  - Tailwind B1 respected (no bg/text/font/rounded/shadow/border/padding/margin classes)
  - `data-ui` roles and enumerations are valid per contract
- Evidence captured in `.ai/.tmp/ui/<run-id>/`

Optional (recommended in real repos): visual regression and a11y checks.
