---
name: apply-frontend-ui-guidelines
description: Orchestrate end-to-end frontend feature implementation across components, hooks, routing, data fetching, styling, and user-visible states with consistent architecture and verification. Primary intent: cross-cutting implementation alignment; pairs with specialized skills when one concern needs deeper treatment.
---

# Frontend UI Guidelines

## Purpose
Provide a consistent, maintainable baseline for building modern frontend applications with TypeScript: component patterns, data fetching, routing, styling, and UX states.

## When to use
Use this skill when you are:
- Building or refactoring UI components
- Introducing or updating data fetching patterns
- Designing feature/module structure
- Implementing routing and lazy loading
- Standardizing styling and theme usage
- Handling loading, empty, and error states


Avoid using this skill when:
- you are making a single small UI tweak (for example, a minor CSS change) with no structural impact
- you only need to fix one isolated issue with a known solution and do not need broader consistency checks

## Inputs
- Feature requirements and UX expectations
- Data sources (API endpoints, caching needs)
- Existing frontend stack (framework, router, query/cache library, UI kit)

## Outputs
- A consistent implementation plan (component tree + data dependencies)
- Component and hook scaffolds
- A UX-state plan (loading/empty/error)
- A minimal test strategy (where applicable)

## Core rules
- Components MUST have typed props and clear responsibilities.
- Side effects MUST be isolated (prefer hooks or service modules).
- Data fetching MUST have a consistent caching and invalidation strategy.
- UI MUST handle loading, empty, and error states explicitly.
- Styling MUST follow a single primary approach (theme-first where possible).

## Steps
1. Identify the feature boundary and public API (what the feature exports).
2. Design the component tree and state boundaries.
3. Define data dependencies:
   - what is fetched
   - when it is fetched
   - how it is cached and invalidated
4. Implement components using:
   - typed props
   - composition over inheritance
   - small reusable hooks
5. Implement loading/error UX.
6. Add verification:
   - basic render
   - one representative interaction
   - one representative error path

## Verification

- [ ] Components have typed props (no implicit `any`)
- [ ] Data fetching uses a consistent cache strategy
- [ ] Loading, empty, and error states are explicitly handled
- [ ] Basic render test passes
- [ ] One representative interaction works
- [ ] One error path renders correctly

## Boundaries

- MUST NOT use implicit `any` in props or state
- MUST NOT fetch data without handling loading and error states
- MUST NOT mix styling approaches within the same feature
- SHOULD NOT bypass the caching layer for server state
- SHOULD NOT embed business logic in UI components
- SHOULD NOT skip accessibility considerations (focus, keyboard nav)

## Included assets
- Templates: `./templates/` provides component and hook scaffolds.
- Examples: `./examples/` provides a feature layout blueprint.
