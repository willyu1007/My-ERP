# Procedure: Release / major change check (LLM)

**Base (references):** `.ai/skills/workflows/llm/llm-engineering/reference/`

## Goal
Ship LLM changes safely: predictable behavior, bounded failure, observable cost/latency, and rollback readiness.

## Trigger examples
- new provider/model integration
- routing profile changes
- prompt template changes
- retry/timeout/budget changes

## Checklist (minimum)
1) **Registry consistency**
   - Providers updated (if applicable): `.ai/llm-config/registry/providers.yaml`
   - Profiles updated (if applicable): `.ai/llm-config/registry/model_profiles.yaml`
   - Prompts updated (if applicable): `.ai/llm-config/registry/prompt_templates.yaml`
   - Config keys registered: `.ai/llm-config/registry/config_keys.yaml`

2) **Config key gate**
   - Run: `node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs`

3) **Correctness regression**
   - Contract tests for adapters/wrapper
   - Prompt regression set (goldens/snapshots)

4) **Reliability**
   - Timeouts set
   - Retries only on transient failures
   - Fallback path validated (provider/model/profile)

5) **Observability**
   - Trace/log fields include: provider/model/profile/prompt version/tenant/user
   - Metrics for latency, errors, tokens/cost

6) **Safety + policy**
   - No secrets committed
   - Budget limits applied
   - Data handling constraints met (if any)

7) **Rollout plan**
   - Canary/feature-flag plan documented
   - Rollback steps documented

## Outputs
- A release note / change log for LLM behavior changes
- Evidence of passing checks (links/logs)

## Optional deep references
- Observability & cost: `reference/docs/observability-cost.md`
- Release/regression: `reference/docs/release-regression.md`
