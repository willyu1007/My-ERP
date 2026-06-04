# E2E Example 03 — Add a model routing profile end-to-end

## Scenario
You want feature code to request a **business intent** (profile) instead of a hard-coded provider/model.

- User request (example): "Add a `code_review` profile that prefers a high-quality model, but has a cheaper fallback."
- Chosen workflow: `../procedures/add-model-profile.md`

## Inputs you must have
- `profile_id`: `code_review`
- Primary candidate: (provider/model) pair
- Fallback candidate(s): (provider/model) pair(s)
- Budget constraints: max retries, timeout, max tokens

## End-to-end steps
1) **Ensure provider(s) exist in SSOT**
   - Verify `.ai/llm-config/registry/providers.yaml` contains all referenced `provider_id` values.

2) **Add the profile (SSOT)**
   - Edit: `.ai/llm-config/registry/model_profiles.yaml`
   - Add an entry like:

```yaml
- profile_id: code_review
  intent: code_review_assistance
  candidates:
    - provider_id: openai
      model_id: gpt-4.1
      weight: 100
  fallback:
    - provider_id: openai
      model_id: gpt-4.1-mini
      weight: 100
```

3) **Wire profile selection in the calling wrapper (repo-specific)**
   - Wrapper resolves `profile_id` → candidate list.
   - Wrapper enforces:
     - timeouts
     - retries only on transient failures
     - fallback selection on eligible errors

4) **(Optional) Tie the profile to a prompt template**
   - If your design uses profile → prompt mapping:
     - update `.ai/llm-config/registry/prompt_templates.yaml` (new version, if changed)

5) **Add minimal routing tests**
   - Ensure routing picks the expected candidate.
   - Ensure fallback is exercised on simulated transient failures.

## Verification
Run from repo root:

- Registry sanity (recommended):
  - `node .ai/skills/workflows/llm/llm-engineering/scripts/validate-llm-registry.mjs`
- Config key gate (only if new in-scope keys were introduced):
  - `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`
- Run wrapper routing tests.

## Expected outputs
- A stable `profile_id` feature code can request
- A tested fallback path
- Registry-first, reviewable routing changes

