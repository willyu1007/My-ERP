# <Task Title> — Requirements

## Purpose

This document captures aligned requirements before roadmap creation. It serves as the foundation for planning and ensures all stakeholders have a shared understanding of the task scope.

## Planning context (if applicable)

- Runtime mode signal: <Plan | Default | Unknown>
- User confirmation when signal is unknown: <yes | no | not-needed | unavailable>
- Host plan artifact path(s): <path(s) or (none)>
- Requirements collection mode: <existing doc | interactive Q&A | both>
- Requirements baseline owner: <who confirmed the baseline>

## Core goal

> One sentence describing what the task aims to achieve.

<Replace with the core goal>

## Use cases

### Use case 1: <Name>

- **Actor**: <Who performs the action>
- **Trigger**: <What initiates the use case>
- **Flow**:
  1. <Step 1>
  2. <Step 2>
  3. ...
- **Expected outcome**: <What success looks like>
- **Acceptance criteria**:
  - [ ] <Criterion 1>
  - [ ] <Criterion 2>

### Use case 2: <Name>

- **Actor**: <...>
- **Trigger**: <...>
- **Flow**: <...>
- **Expected outcome**: <...>
- **Acceptance criteria**: <...>

## Boundaries

### In scope (MUST)

- <Requirement 1>
- <Requirement 2>
- ...

### Out of scope (NOT)

- <Explicitly excluded item 1>
- <Explicitly excluded item 2>
- ...

## Constraints

### Technical constraints

- <Tech constraint 1, e.g., must use existing API>
- <Tech constraint 2, e.g., must support specific database>

### Business constraints

- <Business constraint 1, e.g., deadline>
- <Business constraint 2, e.g., budget>

### Dependencies

- <External dependency 1>
- <Internal dependency 2>

## Roadmap consistency anchors

- Goal anchor: <canonical wording that roadmap should preserve>
- Boundary anchor (in/out scope): <canonical boundary summary>
- Constraint anchor: <hard constraints roadmap must preserve>
- Phase/milestone anchor: <must-have sequence or checkpoints>
- Acceptance anchor: <minimum acceptance criteria roadmap must include>

## Open questions

| ID | Question | Owner | Options | Decision due |
|----|----------|-------|---------|--------------|
| Q1 | <Question> | <Owner> | <Option A / Option B> | <Date or "Before Phase X"> |
| Q2 | ... | ... | ... | ... |

## Assumptions

| ID | Assumption | Risk if wrong | Mitigation |
|----|------------|---------------|------------|
| A1 | <Assumption> | <What happens if wrong> | <How to detect/recover> |
| A2 | ... | ... | ... |

## Success metrics

- **Primary metric**: <How we measure success>
- **Secondary metrics**:
  - <Metric 2>
  - <Metric 3>

## Input trace and precedence notes

| Source | Path/reference | Imported facts | Notes |
|----|----|----|----|
| User-confirmed requirements | <chat/notes> | <...> | Highest precedence |
| Existing requirements docs | <path or (none)> | <...> | |
| Host plan artifact | <path or (none)> | <...> | Lower precedence than requirement.md |
| Model inference | N/A | <...> | Gap-filling only |

## Source documents (if any)

- <Link or path to original requirements document>
- <Link to related design docs>
- <Link to user research>

---

## Confirmation

- [ ] Core goal confirmed with stakeholders
- [ ] Use cases reviewed and agreed
- [ ] Boundaries (in/out scope) explicitly stated
- [ ] Open questions documented with owners
- [ ] Ready to proceed to roadmap creation
