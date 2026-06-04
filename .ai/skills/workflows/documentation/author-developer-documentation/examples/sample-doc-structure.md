# Example: Progressive developer doc structure

## Scenario
You added a new CLI command `tool sync` and need docs for contributors.

## Proposed file layout
```
docs/
  tool/
    README.md
    examples/
      sync-basic.md
      sync-with-flags.md
    templates/
      config.example.json
```

## `docs/tool/README.md` (sketch)

### Purpose
`tool sync` synchronizes local configuration into the shared registry.

### When to use
- Use when you updated configuration and need to publish it.
- Do not use in production environments without review.

### Quickstart
```bash
tool sync --dry-run
```

### Workflow
1. Validate inputs.
2. Run a dry-run.
3. Apply only after reviewing the diff.

### Verification
- `tool sync --dry-run` shows expected changes.
- `tool sync` applies changes and exits 0.

### Troubleshooting
- If you see permission errors, confirm credentials and environment.

## Notes
- Long command outputs and multiple scenarios live in `examples/`.
- Reusable config skeletons live in `templates/`.
