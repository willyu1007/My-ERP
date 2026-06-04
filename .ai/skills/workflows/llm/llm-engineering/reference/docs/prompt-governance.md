# Prompt governance (templates, versions, variables)

This document standardizes how prompts are authored and changed so that:

- changes are reviewable and reversible
- prompts are reusable across features
- variables are strongly typed and validated
- regressions are caught before rollout

## Core identifiers

Every prompt is addressed as:

- `prompt_template_id` (stable)
- immutable `version` (monotonically increasing or semver)

Feature code MUST reference prompts by ID + version, never by copying text.

## Storage model

This template repo provides a simple registry file:

- `.ai/llm-config/registry/prompt_templates.yaml`

Your production system may store templates in a DB or config service. Keep the same IDs.

## Variables schema

Each template must define a schema for `variables`.

Guidelines:

- prefer explicit fields over “blob JSON”
- define enums for values that affect output behavior
- forbid untrusted raw HTML / code unless intentionally allowed

## Versioning rules

- A version is **immutable**. Edits require a new version.
- A new version must include:
  - change notes
  - regression evidence (tests/evals)

## Prompt structure (recommended)

Use a structured message layout:

- system: stable, safety/policy constraints
- developer: product rules and formatting constraints
- user: user input and context

Keep “business rules” out of the user message when possible.

## Regression testing (minimum)

For any version change:

- run a small set of golden prompts
- verify formatting, safety constraints, and key behaviors
- track token usage deltas

## Boundaries

- Do not inline prompts in feature code.
- Do not change prompt text without bumping version.
- Do not log raw prompts or user content in production by default.

Next documents:

- `release-regression.md`
