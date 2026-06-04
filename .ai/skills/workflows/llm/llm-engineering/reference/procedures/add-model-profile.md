# Procedure: Add / change a model routing profile

**Base (references):** `.ai/skills/workflows/llm/llm-engineering/reference/`

## Goal
Introduce or modify a `model_profile` / `profile_id` so feature code can request intent (quality/cost/latency) instead of hardcoding provider/model names.

## Inputs (collect before edits)
- Profile intent (e.g., `quality`, `balanced`, `cheap`, `long_context`)
- Target use-cases (codegen, chat support, summarization, embeddings)
- Constraints (latency budget, max context, data residency)
- Candidate models/providers in order of preference

## Steps
1) **Define a stable profile ID**
   - Use a short, descriptive, stable id (snake_case or kebab-case; keep consistent with your registry).

2) **Register/update the profile (SSOT)**
   - Edit: `.ai/llm-config/registry/model_profiles.yaml`
   - Include:
     - candidate list (provider_id + model_id)
     - selection strategy (priority/weights)
     - fallback policy
     - limits (max_tokens, timeout)

3) **Ensure the calling wrapper honors profiles (repo-specific)**
   - Wrapper must resolve `profile_id` → concrete provider/model using the registry.
   - Feature code should pass `profile_id` (not provider/model).

4) **Add guardrails**
   - Enforce per-profile budgets and safety limits.
   - Ensure profile changes are versioned via config/registry changes, not scattered constants.

5) **Telemetry**
   - Ensure calls record both:
     - requested `profile_id`
     - resolved `provider_id` + `model_id`

6) **Regression**
   - Add or update a routing test that proves:
     - correct candidate selection
     - fallback triggers when primary fails

## Outputs
- Updated: `.ai/llm-config/registry/model_profiles.yaml`
- Wrapper routing behavior aligned with the registry

## Required verification
- Run wrapper routing tests (or add a minimal routing contract test)

## Optional deep references
- Architecture: `reference/docs/architecture.md`
- Observability & cost: `reference/docs/observability-cost.md`
- Release/regression: `reference/docs/release-regression.md`
