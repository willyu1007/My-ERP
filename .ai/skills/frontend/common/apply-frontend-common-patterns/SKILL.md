---
name: apply-frontend-common-patterns
description: Apply local React patterns (derived state, memoization, callback stability, controlled inputs) to improve predictability and render efficiency inside components. Primary intent: component-internal logic quality and render behavior; complements but does not replace routing/data/styling skills.
---

# Apply Frontend Common Patterns

## Purpose
Standardize common React + TypeScript patterns so components remain predictable, readable, and efficient.

## When to use
Use this skill when you are:
- Designing components with multiple interactions
- Managing derived state or expensive computations
- Stabilizing callbacks and preventing re-renders
- Implementing controlled inputs and forms
- Reviewing UI code for maintainability


Avoid using this skill when:
- you are primarily changing routing, data fetching, or styling rather than local component behavior
- a simpler component structure would solve the problem without introducing memoization, derived state, or complex hooks

## Inputs
- Component responsibilities and data dependencies
- Performance concerns (slow renders, frequent updates)
- Existing conventions in the codebase (state management, form library)

## Outputs
- A component/hook plan with clear state boundaries
- A memoization strategy (what to memoize, what not to)
- A checklist to prevent common React pitfalls

## Rules
- State SHOULD be minimal; prefer derived values via memoization instead of duplicating state.
- Side effects MUST be explicit and isolated.
- Memoization MUST be used intentionally (avoid cargo-cult `useMemo`/`useCallback`).

## Practical guidance

### useMemo
Use when:
- computing a derived value is expensive
- the derived value is used in render and depends on stable inputs

Avoid when:
- computation is cheap
- it complicates readability without measurable benefit

### useCallback
Use when:
- passing callbacks to memoized children
- the callback is a dependency of another hook

Avoid when:
- it adds complexity and child components do not rely on referential stability

### Prefer composition
- Break large components into smaller ones that compose together.
- Extract hooks for non-visual logic.

## Steps
1. Identify stateful concerns (UI state vs server state).
2. Implement server state via a query/cache layer (if applicable).
3. Implement UI state with minimal primitives (`useState`, `useReducer`).
4. Add memoization only after identifying an actual need.
5. Verify:
   - basic render
   - key interactions
   - error states

## Verification

- [ ] Components render without errors
- [ ] State is minimal (no duplicated state that could be derived)
- [ ] Memoization is intentional (justified by profiling or known expensive computation)
- [ ] Side effects are isolated in hooks, not inline in render
- [ ] Key interactions work as expected
- [ ] No unnecessary re-renders (verify with React DevTools if needed)

## Boundaries

- MUST NOT add `useMemo`/`useCallback` without a clear reason
- MUST NOT duplicate state that can be derived
- MUST NOT mix side effects with rendering logic
- SHOULD NOT create deeply nested component trees without decomposition
- SHOULD NOT use inline object/array literals as hook dependencies
- SHOULD NOT ignore referential stability for memoized children

## Included assets
- Examples: `./examples/` contains patterns for derived state and callback stability.
