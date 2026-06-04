# 03 Execution Log

Log all commands executed and files written. Do not include secrets.

## Commands

```bash
# Example
python3 .ai/skills/features/ui/ui-style-intake-from-image/scripts/image_style_probe.py <image-path> --out .ai/.tmp/ui/<run-id>/image-style-probe.json
python3 .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py codegen
python3 .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py validate
python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py run --mode full
```

## Files written/updated

{{FILES_WRITTEN}}
