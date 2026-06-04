---
name: perform-web-research
description: Perform targeted web research by defining the question, prioritizing primary sources, capturing evidence in a table, and producing a cited, decision-oriented summary.
---

# Perform Web Research

## Purpose
Produce high-signal research outputs that are actionable and evidence-backed, without over-relying on low-quality sources.

## When to use
Use this skill when:
- You need up-to-date information (APIs, specs, releases, regulations)
- You must compare options (libraries, services, standards)
- You need citations for a technical or product decision
- You suspect prior knowledge may be outdated

## Inputs
- Research question(s) and decision context
- Constraints (time, allowed sources, required recency)
- Definitions of success (what the output must enable)

## Outputs
- A cited summary answering the question
- An evidence table mapping key claims to sources
- A short list of recommended actions or options (if applicable)
- A log of key sources and why they were trusted

## Source selection rules
- Prefer primary sources:
  - official documentation
  - standards bodies
  - release notes / changelogs
  - peer-reviewed papers (when applicable)
- Use reputable secondary sources only when needed to interpret or compare primary sources.
- Treat low-quality sources as last resort and label them clearly.
- Prefer sources that are current enough for the decision and specific to the claim.

## Steps
1. Write a short research brief (question, why it matters, recency requirements).
2. Identify 3-5 primary sources as anchors.
3. Add secondary sources only as needed for interpretation.
4. Extract facts and constraints:
   - capture the version/date context
   - record only the minimal supporting excerpt
5. Populate an evidence table (claim -> source -> why trust -> notes).
6. Produce the decision-oriented summary:
   - answer the question directly
   - list tradeoffs and risks
   - propose next actions
7. Sanity check:
   - citations support the key claims
   - uncertainties and conflicts are called out explicitly

## Verification
- [ ] Primary sources back the most important claims
- [ ] Evidence table exists and supports the summary
- [ ] Dates/versions are included where they matter
- [ ] Claims are cited and not overstated
- [ ] Output includes actionable next steps (if a decision is implied)

## Boundaries
- MUST NOT fabricate sources or citations
- MUST NOT rely solely on low-quality sources for critical claims
- MUST NOT present speculation as fact
- MUST NOT omit dates/versions when they materially affect correctness
- SHOULD prefer official docs/standards/release notes over blogs
- SHOULD call out uncertainty and conflicting sources explicitly

## Included assets
- Templates:
  - `./templates/research-brief.md`
  - `./templates/evidence-table.md`
- Examples: `./examples/` includes a sample research output format.
