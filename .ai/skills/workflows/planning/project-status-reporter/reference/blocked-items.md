# Blocked Items Report

Use when user asks about blockers, obstacles, or what's stuck.

## Data Source

```bash
node .ai/scripts/ctl-project-governance.mjs query --status blocked --json
```

## Output Template

```markdown
## Blockers

| Task ID | Name | Reason | Suggested Action |
|---------|------|--------|------------------|
| T-xxx | <slug> | <reason if known> | <suggestion> |

**Steps to unblock**:
1. <specific action>
2. <verification>
```

## Rules
- If no blockers exist, report "No blocked tasks"
- Read task's `00-overview.md` for blocking reason if not in metadata
- Report "unknown" if reason not documented; do not invent reasons
- Suggest concrete unblocking actions when possible
