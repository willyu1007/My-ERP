---
name: build-react-components
description: Build or refactor React components with typed props, clear composition, and explicit interaction/loading/empty/error behavior. Primary intent: component contract and behavior correctness; pairs with styling or design-direction skills for visual decisions.
---

# Build React Components

## Purpose
Provide patterns for building reusable, testable React components with clear responsibilities and predictable behavior.

## When to use
Use this skill when you are:
- Creating new components (pages, feature components, shared UI)
- Refactoring large components into smaller units
- Implementing modals/dialogs and forms
- Building lists with filtering, pagination, and empty states

## Inputs
- Component responsibilities and expected interactions
- Data dependencies (what inputs come via props vs fetched)
- Styling approach (UI kit, CSS modules, styled components, etc.)

## Outputs
- Typed component props and public API
- Component structure (container vs presentational as needed)
- Explicit handling for loading/empty/error states
- Example usage and acceptance criteria

## Rules
- Components MUST have typed props (no implicit `any`).
- Components SHOULD be small and composable.
- Components MUST render explicit loading/empty/error states when dependent on async data.
- Components SHOULD avoid hidden side effects; prefer hooks.

## Steps
1. Define the component contract (props, callbacks, UI states).
2. Decide whether it is:
   - presentational (props in, UI out)
   - container (fetching/orchestration + composition)
3. Implement rendering logic:
   - default state
   - loading/empty/error
4. Implement interactions:
   - event handlers
   - accessibility considerations
5. Add a minimal verification:
   - renders
   - primary interaction works
   - error state renders

## Verification

- [ ] Component renders with valid props
- [ ] Component handles loading state (when applicable)
- [ ] Component handles empty state (when applicable)
- [ ] Component handles error state (when applicable)
- [ ] Primary interaction triggers expected callback
- [ ] Component is accessible (keyboard navigation, focus visible)

## Boundaries

- MUST NOT use implicit `any` for props
- MUST NOT hide side effects in render (use hooks)
- MUST NOT skip loading/empty/error states for async-dependent components
- SHOULD NOT create large components (decompose into smaller units)
- SHOULD NOT mix container and presentational concerns without clear boundaries
- SHOULD NOT ignore accessibility (aria labels, focus management)

## Included assets
- Templates: `./templates/` includes component scaffolds (presentational, container, list, modal).
- Examples: `./examples/` includes a complete "profile-style" component example.
