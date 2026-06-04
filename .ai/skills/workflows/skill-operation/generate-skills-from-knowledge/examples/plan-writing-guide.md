# Writing a Good Conversion Plan (for an LLM)

A plan is a contract: it should be reviewable before any files are written.

## What a good plan contains
- Stable skill names (kebab-case).
- A high-signal `description` sentence per skill.
- A clean mapping from skill -> source docs.
- Explicit taxonomy (tier1/tier2) when you want a categorized layout.
- A small list of examples/templates to extract.

## How to prompt an LLM to produce the plan
Provide:
- the list of source documents
- your portability constraints (provider-agnostic, no repo paths, etc.)
- your desired taxonomy (if any)
- what you consider “dev-docs exception” (if applicable)

Prompt template:

Goal:
- Convert the provided knowledge docs into a provider-agnostic Agent Skills bundle.

Inputs:
- Source docs: <list>
- Target taxonomy: <tier1/tier2 or none>
- Constraints: <MUST / DON'T>

Output required:
- A JSON file that matches `templates/conversion-plan.schema.json`.

Quality rules:
- One skill per intent/capability.
- Use progressive disclosure: SKILL.md short; details in examples/templates/reference.
- Do not include cross-skill references.

## Common mistakes
- One skill per file (instead of one skill per capability).
- Descriptions that are generic (“do the thing”).
- Skills that include multiple unrelated procedures.
- Massive `SKILL.md` files that should have been split.
