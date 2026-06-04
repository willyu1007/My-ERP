# Progress Summary Report

Use when user asks about overall progress, project status, or completion state.

## Data Source

```bash
node .ai/scripts/ctl-project-governance.mjs query --json
```

## Output Template

```markdown
## Progress Overview

| Status | Count | Ratio |
|--------|-------|-------|
| done | N | X% |
| in-progress | N | X% |
| blocked | N | X% |
| planned | N | X% |

**In Progress**:
- T-xxx <slug> - <brief description or current phase>

**Blocked** (if any):
- T-xxx <slug> - <blocking reason if known>

**Recommended Next Step**: <prioritized recommendation>
```

## Rules
- Calculate percentages from actual counts
- Only show "Blocked" section if blockers exist
- Next step follows priority rules (see next-action.md)
