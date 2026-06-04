# Stage E Templates

This directory contains templates for verification evidence generated during Stage E.

## Files Generated

| File | Format | Purpose |
|------|--------|---------|
| `verification-evidence.json` | JSON | Structured verification data for automation |
| `verification-report.md` | Markdown | Human-readable verification summary |

## Evidence Schema

See `verification-evidence.schema.json` for the JSON schema of the evidence file.

## Usage

These templates are used by the `agent-builder.mjs verify` command to generate verification evidence. They are also copied to the agent's `doc/` directory for project documentation.

