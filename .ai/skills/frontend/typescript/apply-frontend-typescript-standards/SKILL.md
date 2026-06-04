---
name: apply-frontend-typescript-standards
description: Apply frontend TypeScript standards for safety and maintainability (strict typing, props DTOs, safe utilities, no implicit any).
---

# Apply Frontend TypeScript Standards

## Purpose
Prevent runtime UI bugs by enforcing consistent TypeScript patterns and avoiding unsafe shortcuts.

## When to use
Use this skill when you are:
- Adding new components, hooks, or API clients
- Fixing type errors and improving type safety
- Introducing new feature modules with public exports
- Reviewing PRs for TypeScript quality

## Inputs
- Existing TypeScript configuration and lint rules
- Feature types/DTOs and API shapes
- Known type pain points (implicit `any`, unions, nullability)

## Outputs
- Typed props and module public APIs
- Safe utility types and helper functions
- Reduced reliance on `any` and type assertions

## Rules
- `any` SHOULD be avoided; prefer `unknown` + refinement when needed.
- Public module APIs MUST be typed and stable.
- Narrowing MUST be explicit for `unknown` values.
- Prefer discriminated unions for complex state machines.

## Steps
1. Define types at the boundary:
   - API DTOs
   - component props
2. Prefer inference where safe; add annotations at boundaries.
3. Replace unsafe casts with:
   - runtime checks
   - schema validation (if available)
4. Use discriminated unions for complex UI state.
5. Verify:
   - TypeScript build passes
   - no new unsafe escapes introduced

## Verification

- [ ] TypeScript build passes with no errors
- [ ] No new `any` types introduced without justification
- [ ] Public module APIs are typed and exported correctly
- [ ] `unknown` values are narrowed before use
- [ ] Discriminated unions are used for complex state
- [ ] Type assertions are avoided or justified

## Boundaries

- MUST NOT use `any` without explicit justification
- MUST NOT use type assertions (`as`) to bypass type checking
- MUST NOT export untyped public APIs
- SHOULD NOT ignore TypeScript errors with `@ts-ignore`
- SHOULD NOT use `!` (non-null assertion) without runtime guarantee
- SHOULD NOT define complex types inline (extract to named types)

## Included assets
- Examples: `./examples/` includes safe patterns for `unknown` and discriminated unions.
