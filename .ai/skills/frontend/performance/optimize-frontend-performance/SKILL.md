---
name: optimize-frontend-performance
description: Optimize frontend performance through measurement-driven improvements (render optimization, code splitting, caching, virtualization).
---

# Optimize Frontend Performance

## Purpose
Improve frontend performance without premature optimization by using a measurement-driven approach.

## When to use
Use this skill when you are:
- Seeing slow rendering or sluggish interactions
- Experiencing large bundle sizes or slow initial load
- Implementing large lists or complex pages
- Introducing code splitting and lazy loading
- Reducing network chatter and redundant fetches

## Inputs
- The performance symptom (slow load, slow interaction, jank)
- Reproduction steps and target devices/browsers
- Existing profiling tools available (browser profiler, build analyzer)

## Outputs
- A prioritized list of performance fixes with acceptance criteria
- A code splitting plan (what to lazy load)
- Render optimization plan (memoization, derived state)
- List optimization plan (virtualization) when applicable

## Rules
- Optimization MUST be guided by evidence (profiling/metrics).
- Avoid adding memoization that reduces readability without measurable benefit.
- Large lists SHOULD use virtualization.
- Expensive computations SHOULD be memoized or moved off the critical render path.

## Steps
1. Measure:
   - profile render time
   - inspect network waterfall
   - inspect bundle analyzer (if available)
2. Identify the biggest contributor.
3. Apply targeted fixes:
   - code splitting for large routes/features
   - caching for server state
   - memoization for expensive derived values
   - virtualization for long lists
4. Re-measure and confirm improvement.
5. Add a regression guard (test or metric) where practical.

## Verification

- [ ] Performance issue is measured before and after optimization
- [ ] Optimization reduces the identified bottleneck (render time, bundle size, etc.)
- [ ] No functionality regression introduced
- [ ] Code splitting loads correct chunks for routes
- [ ] Virtualized lists render smoothly with large datasets
- [ ] Memoization does not reduce code readability without measurable benefit

## Boundaries

- MUST NOT optimize without profiling evidence
- MUST NOT add memoization that reduces readability without measurable gain
- MUST NOT skip re-measurement after applying fixes
- SHOULD NOT over-split bundles (too many small chunks can hurt performance)
- SHOULD NOT virtualize small lists (adds complexity without benefit)
- SHOULD NOT cache data indefinitely without invalidation strategy

## Included assets
- Templates: `./templates/` includes a performance investigation checklist.
- Examples: `./examples/` includes common optimization scenarios.
