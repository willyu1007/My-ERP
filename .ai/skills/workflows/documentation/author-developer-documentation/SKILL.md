---
name: author-developer-documentation
description: Author or update developer documentation with progressive disclosure, explicit requirements, examples/templates, and actionable verification steps.
---

# Author Developer Documentation

## Purpose
Create high-quality developer documentation that is accurate, discoverable, and actionable, using progressive disclosure and verifiable guidance.

## When to use
Use this skill when:
- You implemented a new feature and need docs
- You changed an API contract and must update references
- A workflow is complex and needs explanation and examples
- Onboarding friction indicates missing or outdated docs

## Inputs
- The code or feature to document
- Intended audience (new contributor, on-call engineer, API consumer)
- Required level of detail (overview vs deep reference)
- Portability constraints (avoid repo-specific paths/scripts unless explicitly allowed)

## Outputs
- A documentation plan:
  - what files to create/update
  - what information belongs where
- Documentation content:
  - overview and purpose
  - step-by-step instructions
  - verification steps
  - troubleshooting notes
- Examples/templates placed in adjacent `examples/` and `templates/` folders where applicable

## Documentation principles
- Start with the conclusion: what the reader can do after reading.
- One paragraph SHOULD have one intent.
- Use **MUST/SHOULD/MAY** to express requirements clearly.
- Prefer progressive disclosure:
  - keep top-level docs short
  - move deep details to references, examples, and templates
- Keep guidance verifiable: include commands/checks and expected outcomes.

## Steps
1. Gather context:
   - read existing docs
   - inspect relevant code paths
   - identify assumptions and environment constraints
2. Define the doc structure:
   - overview
   - when to use
   - inputs/outputs
   - workflow steps
   - verification
   - troubleshooting
3. Write the “happy path” first:
   - minimal steps to succeed
   - explicit prerequisites
4. Add progressive disclosure:
   - move long code blocks into `examples/`
   - move reusable scaffolds into `templates/`
   - put deep rationale into `reference.md` (optional)
5. QA (required):
   - verify examples are coherent and do not include secrets
   - ensure requirements are explicit
   - ensure the doc matches current implementation

## Verification
- [ ] Documentation structure follows the defined outline
- [ ] Requirements are explicit (MUST/SHOULD/MAY) where relevant
- [ ] Examples are coherent and do not include secrets
- [ ] Verification steps are actionable (commands/checks + expected results)
- [ ] Documentation matches current implementation
- [ ] Progressive disclosure is applied (top-level docs are short)

## Boundaries
- MUST NOT include secrets, credentials, or internal-only URLs in documentation
- MUST NOT publish unverifiable instructions (“just run it”) without commands and expected outcomes
- MUST NOT copy large code blocks verbatim into top-level docs; move them into `examples/`
- SHOULD NOT mix multiple topics in a single document section
- SHOULD keep top-level docs within a reasonable length by using progressive disclosure

## Included assets
- Templates: `./templates/doc-outline.md` includes a documentation outline.
- Examples: `./examples/` includes a sample progressive doc structure.
