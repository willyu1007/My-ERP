---
name: {{skill-name}}
description: {{One sentence that helps the agent choose the skill - include trigger phrases and when-to-use guidance.}}
---

# {{Human Readable Title}}

## Purpose

{{1-2 sentences: what problem does the skill solve?}}

## When to use

Use the skill when:
- {{Primary trigger condition}}
- {{Secondary trigger condition}}

Do not use the skill when:
- {{Negative trigger - when to skip}}

## Inputs

- **{{input_name}}**: {{description of required input}}
- **{{input_name_2}}**: {{optional input}}

## Outputs

- {{Description of expected artifacts, file changes, or reports}}

## Steps

### Scenario A: {{Primary use case}}

1. {{First step - imperative verb}}
2. {{Second step}}
3. {{Third step}}

### Scenario B: {{Alternative use case}} (optional)

1. {{First step}}
2. {{Second step}}

## Verification

- [ ] {{Concrete verification command or check}}
- [ ] {{Expected outcome or pass criteria}}
- [ ] Run: `node .ai/scripts/lint-skills.mjs --strict`

## Boundaries

- MUST NOT {{critical constraint}}
- MUST NOT edit `.codex/skills/` or `.claude/skills/` directly (generated)
- SHOULD NOT {{recommended constraint}}
- {{Additional safety or scope constraints}}

## Included assets

- `./scripts/` - {{placeholder for executable helpers, if any}}
- `./reference.md` - {{placeholder for deep details, rationale, tradeoffs}}
- `./examples/` - {{placeholder for scenario-specific examples}}
- `./templates/` - {{placeholder for reusable snippets/skeletons}}
