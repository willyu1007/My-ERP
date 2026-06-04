---
name: style-frontend-ui
description: Implement and normalize UI styling within an existing design system using theme tokens, reusable style primitives, responsive rules, and accessibility checks. Primary intent: styling execution consistency; can follow frontend-design when a creative direction needs maintainable implementation.
---

# Style Frontend UI

## Purpose
Create consistent UI styling that is easy to maintain and scales with the codebase.

## When to use
Use this skill when you are:
- Styling new components or pages
- Refactoring inconsistent styles
- Introducing theme tokens (spacing, colors, typography)
- Standardizing layout utilities and responsive patterns

## Inputs
- UI kit or styling solution used by the codebase (CSS modules, styled components, theme system, etc.)
- Design requirements (spacing scale, typography, breakpoints)
- Accessibility constraints (contrast, focus states)

## Outputs
- A styling approach decision for the component/feature
- Theme-token usage (where supported)
- Reusable style primitives (layout components, utility classes)

## Rules
- Styling MUST follow a single primary approach for consistency.
- Theme tokens SHOULD be used instead of hardcoded values where available.
- Components MUST have accessible focus states and sufficient contrast.
- Responsive behavior SHOULD be explicit and testable.

## Steps
1. Choose the styling method consistent with the codebase.
2. Identify reusable style tokens (spacing, typography).
3. Implement component styles with:
   - predictable naming
   - minimal duplication
4. Verify:
   - keyboard navigation and focus
   - responsive layout for common breakpoints

## Verification

- [ ] Styles follow the project's primary styling approach
- [ ] Theme tokens are used (no hardcoded colors/spacing where tokens exist)
- [ ] Components have accessible focus states
- [ ] Color contrast meets accessibility guidelines
- [ ] Responsive layout works for common breakpoints
- [ ] Keyboard navigation is visually clear

## Boundaries

- MUST NOT mix styling approaches within the same component
- MUST NOT hardcode values when theme tokens are available
- MUST NOT skip focus state styling
- MUST NOT ignore color contrast requirements
- SHOULD NOT duplicate style definitions (use shared utilities/tokens)
- SHOULD NOT use magic numbers for spacing/sizing

## Included assets
- Templates: `./templates/` includes a style object pattern and token checklist.
- Examples: `./examples/` includes a consistent component style pattern.
