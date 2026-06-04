# Configuration registry (env/config/credentials)

This document defines how LLM-related configuration is named, stored, reviewed, and validated.

The goal is to avoid:

- scattered “magic strings” for env vars
- duplicated or conflicting configuration keys
- accidental secret leakage

## Single source of truth

All LLM configuration keys MUST be registered in:

- `.ai/llm-config/registry/config_keys.yaml`

This registry is enforced by:

```bash
node .ai/skills/workflows/llm/llm-engineering/scripts/check-llm-config-keys.mjs
```

## Key categories

### 1) Non-secret config

Examples:

- default profile id
- max tokens default
- feature flags for routing

These may live in env vars, config files, or a config service.

### 2) Credential references (never raw secrets)

**Never** store API keys in env vars that end up in `.env` committed files.

Instead store a **reference**:

- `credential_ref`: `vault://path/to/secret` / `aws-secrets://...` / `gcp-secret://...`

The runtime resolves the reference to a real secret at call time.

## How to add a new config key

1. Add the key to `.ai/llm-config/registry/config_keys.yaml`
2. Decide the storage location (env/config service) and default behavior
3. Update your LLM layer config loader (repo-specific)
4. Run the check script

## Naming conventions (recommended)

- Use `LLM_` prefix for LLM-layer keys
- Uppercase snake case: `LLM_DEFAULT_PROFILE`
- Avoid provider-specific keys leaking into feature code; prefer generic keys resolved by registry

## Boundaries

- Do not add new env vars without registering them
- Do not commit `.env` files with secrets
- Do not hardcode provider API keys in code or docs

Next documents:

- `observability-cost.md`
