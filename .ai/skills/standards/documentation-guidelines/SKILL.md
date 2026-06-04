---
name: documentation-guidelines
description: Apply LLM-first documentation standards when writing or reviewing docs - covers structure, semantic precision, token efficiency, and verification.
---

# Documentation Guidelines (LLM-first)

## Purpose

Provide standards for repository documentation that is **maintained for both LLMs and human collaborators**.

Goals:
- **Semantic precision**: minimize ambiguity and "guesswork"
- **Balanced information density**: surface key decisions quickly; details available on demand
- **Token efficiency**: avoid non-essential verbosity so the model can act reliably within limited context

## When to use

Use the documentation-guidelines skill when:
- Writing or reviewing `README.md`, `AGENTS.md`, `CLAUDE.md`
- Creating specs, ADRs, design notes
- Authoring SSOT content under `.ai/skills/`
- Writing bootstrap materials under `init/`

## Inputs

- The document to write or review
- Target audience (LLM, human developer, or both)
- Document type (entry/rules, standards/design, skill/command, task/implementation)

## Outputs

- Documentation that follows LLM-first principles
- Self-review checklist results


## Steps
1. Confirm the document's purpose and target reader (who will use the document, and for what decision or task).
2. Write the main path first (the smallest set of steps or facts needed to succeed) and defer deep detail to later sections.
3. Add explicit inputs/outputs, and include verification criteria whenever the document describes a process or checklist.
4. Run a readability pass: short paragraphs, scannable headings, consistent terminology, and minimal jargon.
5. Ensure all examples and templates are placed in the most appropriate section (or extracted into dedicated example/template files if available).

## Core Principles

### Information Structure

- **Conclusion first**: start each section with decisions/constraints, then explain rationale/details
- **One paragraph, one intent**: do not mix multiple topics in the same paragraph
- **Verifiable**: key claims must include "how to verify" (commands, paths, checkpoints)
- **Progressive disclosure**: keep top doc to "overview + navigation"; move deep detail to supporting files

### Semantic Precision

- Use **MUST/SHOULD/MAY** to express requirement strength
- Avoid vague references ("it/this/above/related"); use explicit nouns and paths instead
- Define terms on first use (e.g., SSOT, skill stub)
- Make assumptions explicit (OS differences, relative vs absolute paths, workspace roots)

### Token Efficiency

- Prefer bullet lists over long paragraphs
- Do not paste large code blocks/logs into docs; reference paths and include only minimal excerpts
- Avoid repeating background across documents; use links + 1-line summaries
- Keep examples minimal; move complex examples to an appendix

## Document Templates

### Standards/Spec Docs

1. Purpose & scope
2. Core principles
3. Rules (MUST/SHOULD/MAY)
4. Exceptions & boundaries
5. Verification (how to check compliance)
6. Change log (optional)

### Task/Implementation Docs

1. Background (<= 5 lines)
2. Goals (verifiable)
3. Scope (IN/OUT)
4. Constraints (MUST / DON'T)
5. Steps (executable)
6. Verification (commands/checkpoints)
7. Risks & rollback (if generating/overwriting)

### Skill/Command Docs (SSOT)

- **Purpose (1-2 sentences)**: what problem the skill solves
- **Trigger/usage**: when to use; required inputs; expected outputs
- **Steps**: bullet list; minimal examples only
- **Notes**: boundaries, forbidden actions, failure handling
- **References**: optional (file paths / external links)

## Readability Rules (MUST)

- Keep heading depth <= 4 levels (`#` to `####`)
- Wrap all paths/commands/identifiers in backticks
- Any action that generates/overwrites files MUST specify:
  - blast radius (which directories/files are written)
  - idempotency (whether repeated runs are safe)
  - rollback plan (if available)

## Prompt-Oriented Writing

When a doc is meant to guide an LLM, write the "inputs/outputs/invariants" like an interface:
- **Inputs**: required fields (e.g., project profile, target directory)
- **Outputs**: which files/directories are generated
- **Invariants**: rules that must not be violated

Include a minimal prompt template at the end:
```
Goal:
Constraints (MUST / DON'T):
Relevant paths:
Acceptance criteria:
```

## Verification

Self-review checklist:
- Can the key decisions be extracted within 30 seconds?
- Are there any terms/references that require guessing?
- Are MUST/SHOULD/MAY used correctly (no "nice-to-have" phrased as MUST)?
- Is verification included?
- Can any redundant background be removed or replaced by a link + 1-line summary?

## Boundaries

- Do NOT create documentation that exceeds 500 lines without progressive disclosure
- Do NOT use vague terms like "it", "this", "above" without explicit references
- Do NOT mix multiple intents in a single paragraph

## Iterative co-authoring loop (borrowed)

For substantial docs/specs, prefer an explicit loop:

1. **Context gathering**: ask targeted questions to close gaps.
2. **Structure first**: create section headers with placeholders.
3. **Draft section-by-section** with review feedback.
4. **Reader testing**: validate that a fresh reader (or fresh agent) can answer the obvious questions without extra context.

## Included assets

None.
