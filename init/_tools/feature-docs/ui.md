# Feature: ui

## Conclusions (read first)

- Bootstraps the repo UI SSOT: `ui/tokens/`, `ui/contract/`, `ui/styles/`, `ui/codegen/`
- Generates LLM-readable UI context: `docs/context/ui/ui-spec.json`
- Uses the Python controller: `.ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py` (idempotent; non-destructive unless forced)

## How to enable

In `init/_work/project-blueprint.json`:

```json
{
  "capabilities": { "frontend": { "enabled": true } },
  "features": { "ui": true }
}
```

## What Stage C `apply` does

When enabled, Stage C runs:

Note (Windows): prefer `py -3` (Python Launcher). The pipeline will also try `python3`, then `python`.

```bash
python3 -B -S .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py init
```

Optional verification (when Stage C is run with `--verify-features`):

```bash
python3 -B -S .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py codegen
python3 -B -S .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py validate
```

## Key outputs

- `ui/**` (tokens, contract, styles, codegen)
- `docs/context/ui/ui-spec.json`
- `.ai/.tmp/ui/**` (evidence root)

## Common commands

```bash
# Re-run code generation for CSS + TS types + UI context
python3 -B -S .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py codegen

# Validate tokens + contract
python3 -B -S .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py validate
```
