# Task List Report

Use when user asks about current tasks, task inventory, or what's being tracked.

## Data Source

```bash
node .ai/scripts/ctl-project-governance.mjs query --json
```

## Output Template

```markdown
## Tasks

| Task ID | Name | Status | Feature | Path |
|---------|------|--------|---------|------|
| T-001 | <slug> | <status> | F-xxx | dev-docs/active/<slug>/ |

**Quick actions**:
- View details: `cat dev-docs/active/<slug>/00-overview.md`
- Filter by status: `node .ai/scripts/ctl-project-governance.mjs query --status in-progress`
```

## Rules
- List all tasks from query results
- Sort by status priority: in-progress > blocked > planned > done
- Include path for quick navigation
