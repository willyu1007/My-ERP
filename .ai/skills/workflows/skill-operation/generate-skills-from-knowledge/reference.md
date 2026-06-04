# Reference: Converting Knowledge Docs into Agent Skills

## Goal
Turn “knowledge documents” (guides, runbooks, standards, architecture notes) into **capability-oriented** skills that an agent can select via the `description` signal and execute via the `Steps` section.

## Key decisions (apply in this order)
1. **Discovery-first**: the first sentence (`description`) must help an agent decide “use me now”.
2. **One intent per skill**: if a user can reasonably ask for two different things, split into two skills.
3. **Progressive disclosure**: keep `SKILL.md` short; move depth into `reference.md`, `examples/`, `templates/`.
4. **Portability by default**: remove provider- and repo-specific coupling unless explicitly required.

## Skill identification heuristic
A good skill is typically centered on one of these:
- a repeatable workflow (“debug X”, “migrate Y”, “write Z spec”)
- a concrete artifact (“generate a config”, “produce a report”, “create a test plan”)
- a bounded domain action (“add middleware”, “validate input”, “instrument tracing”)

Signals that a source doc should be split:
- multiple “How to …” sections with different objects
- multiple audiences (developer vs SRE vs PM)
- step sequences that share little overlap
- heavy branching (“if A then … else …”) that can be separated by trigger

Signals that multiple source docs should be merged:
- same trigger and same output, different phrasing
- one doc is prerequisites/background, another is procedure

## Writing a high-signal `description`
The description should:
- start with an action verb (“Generate…”, “Convert…”, “Debug…”, “Validate…”)
- include a discriminating noun phrase (“skills bundle”, “API route”, “deployment manifest”)
- include at least one trigger phrase that a user might say
- avoid internal jargon unless it is stable and shared

Examples (style, not content):
- “Generate an API smoke-test plan for authenticated routes.”
- “Convert Markdown runbooks into portable Agent Skills.”

## Converting source content: what goes where
### `SKILL.md` (keep short)
Keep only:
- purpose + when-to-use triggers
- required inputs and expected outputs
- a numbered procedure that an agent can execute
- boundaries and verification

### `reference.md`
Put:
- rationale, tradeoffs
- fuller explanation of edge cases
- alternative approaches
- extended checklists

### `examples/`
Put:
- scenario-specific examples (one scenario per file)
- “good/bad” examples for prompts and outputs
- minimal but copy/pasteable samples

### `templates/`
Put:
- skeletons for outputs (report outline, checklist, config stub)
- reusable snippets (schema, folder layout stubs)
- anything intended to be copied and filled

## Portability and sanitization checklist
When converting from repo-specific or provider-specific docs:
- Replace hard-coded paths with **placeholders** (e.g., `<repo_root>`, `<skills_root>`).
- Replace script names with **functional descriptions** unless the script is shipped with the skill.
- Remove tool/platform instructions that require a specific vendor, unless you keep them under “Optional provider notes”.
- Remove cross-skill links (“See also”, “Related docs”). Skills should be discoverable without reading chains.

## A plan file is the contract
The conversion plan is intended to be produced by an agent (or a human) and then applied by the helper script.

Principles:
- the plan is **reviewable** before any write happens
- the plan enumerates the blast radius (directories/files that will be created)
- the plan explicitly records split/merge decisions and rationale

## Minimal prompt template (for any LLM)
Use the following template when asking an LLM to generate or refine a plan:

Goal:
- Convert the provided knowledge docs into a provider-agnostic Agent Skills bundle.

Inputs:
- Source docs: <list paths>
- Constraints: <portability constraints>
- Target taxonomy: <tier1/tier2 or none>

Constraints (MUST / DON'T):
- MUST follow the SKILL.md format (YAML frontmatter with name/description).
- MUST keep SKILL.md short and move detail into examples/templates/reference.
- DON'T include cross-skill references.
- DON'T keep provider-specific instructions unless explicitly required.

Acceptance criteria:
- Each skill directory has SKILL.md and an unambiguous description.
- Examples/templates extracted into subfolders as appropriate.
- Lint passes with no errors.

## Suggested review workflow
1. Review the plan JSON for naming, taxonomy, and blast radius.
2. Run `apply`.
3. Edit generated skills.
4. Run `lint`.
5. Package (optional).

---

# Skill Authoring Standards

The following section defines the skill authoring standard for the repository.

## Source of Truth (SSOT)

- You MUST edit skills only in `.ai/skills/`
- You MUST NOT edit `.codex/skills/` or `.claude/skills/` directly
- After adding or updating a skill, you MUST sync stubs:
  - Full sync (all skills): `node .ai/scripts/sync-skills.mjs --scope all --providers both --mode reset --yes`
  - Incremental (one skill): `node .ai/scripts/sync-skills.mjs --scope specific --skills <skill-name> --mode update`

## Naming and Layout

### Naming (MUST)

- Skill leaf directory name MUST be kebab-case: `.ai/skills/.../<skill-name>/`
- The skill `name` in `SKILL.md` MUST match the **leaf** directory name
- Use a capability-oriented name (verb + domain/tool) and avoid ambiguous names

### Layout (MUST)

Required:
- `.ai/skills/.../<skill-name>/SKILL.md` (taxonomy directories are allowed)

Optional supporting files (recommended for progressive disclosure):
- `<skill-dir>/reference.md`
- `<skill-dir>/examples.md`
- `<skill-dir>/scripts/`
- `<skill-dir>/templates/`

Forbidden:
- You MUST NOT create `.ai/skills/<skill-name>/resources/`

## SKILL.md Format

### Frontmatter (MUST)

`SKILL.md` MUST begin with YAML frontmatter:

```yaml
---
name: skill-name
description: One sentence that helps the agent choose this skill.
---
```

Rules:
- `name` MUST be stable (changing it breaks discovery and references)
- `description` MUST be high-signal: include trigger phrases and when-to-use guidance
- Keep frontmatter compatible across platforms: use only widely supported keys unless you have a strong reason

### Optional Frontmatter Keys (SHOULD be used sparingly)

- Codex supports an optional `metadata` section (for example `metadata.short-description`)
- Claude Code supports `allowed-tools` to restrict tool access for that skill

If you use platform-specific keys (like `allowed-tools`), you MUST ensure the skill remains correct even if another platform ignores that key.

### Body Structure (SHOULD)

Write the Markdown body to be executable and token-efficient. Recommended sections:

1. `# <Human Readable Title>`
2. `## Purpose` (1-2 sentences)
3. `## When to use` (bullet triggers; include negative triggers if important)
4. `## Inputs` (what the user must provide; file paths; required context)
5. `## Outputs` (expected artifacts, file changes, or reports)
6. `## Steps` (numbered, imperative, minimal ambiguity)
7. `## Boundaries` (MUST NOT / SHOULD NOT; safety constraints)
8. `## References` (relative links to `reference.md`, `examples.md`, etc.)

## Progressive Disclosure and Size Limits

- `SKILL.md` MUST be <= 500 lines
- Put deep explanations in `reference.md` and keep `SKILL.md` focused on:
  - triggers
  - inputs/outputs
  - step-by-step procedure
  - constraints and verification

## Examples and Scripts

- Examples SHOULD be small and copy-pasteable
- If a skill requires executable helpers, place them under `scripts/` and document:
  - prerequisites (runtime, dependencies)
  - exact commands to run
  - expected output

## Language and Encoding

- Skill docs in `.ai/skills/` SHOULD be written in English for consistency and portability
- Use plain ASCII punctuation where possible to avoid encoding/display issues across environments

## Verification Checklist

Before finishing a skill change:
- `SKILL.md` has valid YAML frontmatter with `name` and `description`
- The directory name matches `name`
- No `resources/` directory exists under the skill
- `SKILL.md` is <= 500 lines and uses progressive disclosure
- `node .ai/scripts/sync-skills.mjs` has been run and stubs are up to date

## Syncing Notes

- Stub generation discovers skills by recursively finding `SKILL.md` under `.ai/skills/`
- Provider stubs preserve the SSOT directory hierarchy under `.codex/skills/` and `.claude/skills/`
- The current selection is configured via `.ai/skills/_meta/sync-manifest.json` and synced with:
  - `node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes`

---

# Skill Design Principles (borrowed)

The following section captures core design principles for authoring high-quality skills.

## Core Principles

### Concise is Key

Context is a shared resource. Only add information that the LLM does not already know:
- Omit well-known programming patterns and language syntax
- Focus on project-specific conventions, non-obvious constraints, and domain knowledge
- Prefer links and references over inline repetition

### Degrees of Freedom

Match instruction specificity to task fragility:

| Freedom Level | When to Use | Example |
|---------------|-------------|---------|
| High (text instructions) | Multiple approaches are valid; decision depends on context | "Choose caching strategy based on data access patterns" |
| Medium (pseudocode / parameterized script) | Preferred pattern exists; some variation allowed | "Use template, adjust timeout as needed" |
| Low (concrete script, few parameters) | Operation is fragile; consistency is critical | "First run: `python migrate.py --dry-run`" |

Guidelines:
- Use high freedom for strategic decisions where context matters
- Use medium freedom for repeatable patterns with known variations
- Use low freedom for operations where mistakes are costly or hard to reverse

## Progressive Disclosure Design

### Three-Level Loading System

1. **Metadata** (name + description) - Always in context (~100 words)
   - Must be high-signal: include trigger phrases
   - Agent uses this to decide "use me now"

2. **SKILL.md body** - Loaded when skill is triggered (<5k words)
   - Contains purpose, inputs/outputs, steps, boundaries, verification
   - Should be self-contained for the happy path

3. **Bundled resources** - Loaded on demand (no limit)
   - `reference.md`: rationale, tradeoffs, edge cases
   - `examples/`: scenario-specific examples
   - `templates/`: reusable skeletons and snippets

### Organization Patterns

Choose the pattern that best fits your content:

**Pattern 1: High-Level Guide + References**
- `SKILL.md` contains the procedure
- `reference.md` contains deep rationale
- Best for: single-intent skills with complex background

**Pattern 2: Domain-Organized**
- `SKILL.md` routes to domain-specific references
- e.g., `reference/finance.md`, `reference/sales.md`
- Best for: skills that vary by domain but share structure

**Pattern 3: Variant-Organized**
- `SKILL.md` routes to variant-specific procedures
- e.g., `procedures/aws.md`, `procedures/gcp.md`
- Best for: skills that work differently per platform/provider

## Bundled Resources Best Practices

### What to include

- **`scripts/`**: Executable code that requires deterministic reliability or would be rewritten repeatedly
- **`reference/`** or **`reference.md`**: Documentation loaded on-demand into context
- **`templates/`**: Output skeletons and reusable snippets
- **`examples/`**: Scenario-specific examples (one scenario per file)

### What NOT to include

- `README.md` (use `SKILL.md` instead)
- `CHANGELOG.md` (use git history)
- User documentation (belongs in project docs, not skills)
- Large binary files or logs
- `resources/` directory (forbidden by lint)

### File naming

- Use kebab-case for all files and directories
- Use descriptive names that indicate purpose
- Prefer `.md` for documentation, language-appropriate extensions for code
