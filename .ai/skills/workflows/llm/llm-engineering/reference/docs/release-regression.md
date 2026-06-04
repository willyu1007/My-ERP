# Release & regression for LLM changes

This document defines a minimal release process for LLM-related changes.

LLM changes can regress in subtle ways (formatting drift, safety changes, increased cost) even when the code compiles.

## Changes that require a release checklist

- adding a provider
- changing routing profiles
- changing prompt templates
- changing retry/timeouts/budgets
- changing output parsing / schema

## Minimum regression suite

For each critical feature:

- a small set of **golden prompts**
- expected output invariants (format, required fields)
- negative tests (malformed input, empty input)

Track:

- output quality indicators
- token usage deltas
- latency deltas

## Rollout strategy

Use progressive delivery:

1. Dark launch (off)
2. Canary tenants/users
3. Percentage rollout
4. Full rollout

Maintain a fast rollback/fallback path:

- fallback profile
- disable flags

## Definition of Done (DoD)

- [ ] Regression suite executed and results recorded
- [ ] Observability fields present
- [ ] Budget policy validated
- [ ] Rollout plan exists (flags + fallback)

Next documents:

- `observability-cost.md`
- `prompt-governance.md`
