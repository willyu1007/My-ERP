# 03 Execution Log

Log all commands executed and files written. Do not include secrets.

## Commands

```bash
# Example
python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py run --mode full
# If approval is required:
python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py approval-approve --request .ai/.tmp/ui/<run-id>/approval.request.json --approved-by "<name>" --expires-at-utc "<iso>"
```

## Files written/updated

{{FILES_WRITTEN}}
