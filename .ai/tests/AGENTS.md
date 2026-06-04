# `.ai/tests/` - Public And Maintainer Smoke Tests

## Purpose

Centralized smoke tests for feature-pack `ctl-*.mjs` scripts.

- Public tests under `.ai/tests/suites/` are template-facing feature smoke tests.
- Maintainer tests under `.ai/tests/maintainer/` are internal regressions for implementation details or heavy lifecycle flows.
- This directory verifies `.ai` tooling and generated contracts, not application business logic tests.

## When To Use

Use `.ai/tests/` when you changed:

- `.ai/scripts/` or `.ai/skills/**/scripts/`
- feature templates, generated contracts, or init wiring that a feature pack depends on
- feature-pack docs that promise a central smoke command

Do not use `.ai/tests/` as a replacement for project unit/integration/E2E tests under the app's own test stack.

## How To Use

- For normal feature-pack checks, list suites with `node .ai/tests/run.mjs --list` and run only the affected public suite with `node .ai/tests/run.mjs --suite <name>`.
- Use `node .ai/tests/run-maintainer.mjs --suite <name>` only when touching maintainer-only regressions or heavy internal flows such as UI approval ordering or cloud lifecycle behavior.
- Add `--keep-artifacts` only when debugging; PASS evidence is deleted by default.

## Quick Reference

| Public Suite | Script Under Test | Key Workflow |
|-------|-------------------|--------------|
| `ui` | `ui_gate.py`, `image_style_probe.py` | governance gate, style intake |
| `environment` | `env_contractctl.py`, `env_localctl.py` | contract -> local |
| `database` | `ctl-db-ssot.mjs`, `ctl-convex.mjs`, `ctl-db-doc.mjs` | sqlite smoke + Convex init/verify + DB doc surface |
| `context-awareness` | `ctl-context.mjs` | init -> add-artifact -> touch -> verify + glossary contract regressions |
| `api-index` | `ctl-api-index.mjs`, `ctl-openapi-quality.mjs` | generate -> verify -> diff + quality gate |
| `deployment` | `ctl-deploy.mjs` | init -> add-service -> plan -> verify |
| `iac` | `ctl-iac.mjs` | init -> verify |

| Maintainer Suite | Script Under Test | Key Workflow |
|------------------|-------------------|--------------|
| `ui` | `ui_gate.py` | approval-order regression |
| `environment` | `env_cloudctl.py` | cloud lifecycle + mockcloud regressions |

## Commands

```bash
# List available public suites
node .ai/tests/run.mjs --list

# Run a public suite
node .ai/tests/run.mjs --suite ui
node .ai/tests/run.mjs --suite environment
node .ai/tests/run.mjs --suite database
node .ai/tests/run.mjs --suite context-awareness
node .ai/tests/run.mjs --suite api-index
node .ai/tests/run.mjs --suite deployment
node .ai/tests/run.mjs --suite iac

# Keep evidence on PASS (debug)
node .ai/tests/run.mjs --suite <name> --keep-artifacts
# or: KEEP_TEST_ARTIFACTS=1 node .ai/tests/run.mjs --suite <name>

# List maintainer suites
node .ai/tests/run-maintainer.mjs --list

# Run a maintainer suite
node .ai/tests/run-maintainer.mjs --suite ui
node .ai/tests/run-maintainer.mjs --suite environment

# Keep maintainer evidence on PASS
node .ai/tests/run-maintainer.mjs --suite <name> --keep-artifacts
# or: KEEP_TEST_ARTIFACTS=1 node .ai/tests/run-maintainer.mjs --suite <name>
```

## Evidence

| Outcome | Evidence Location | Behavior |
|---------|-------------------|----------|
| PASS | `.ai/.tmp/tests/<suite>/<run-id>/` | Auto-deleted |
| FAIL | `.ai/.tmp/tests/<suite>/<run-id>/` | Kept for debugging |
| Maintainer PASS/FAIL | `.ai/.tmp/tests/maintainer/<suite>/<run-id>/` | Same behavior as public runner |

Evidence includes: `run.json`, `runner.log`, per-test `*.stdout.log`, `*.stderr.log`.

## Classification Rules

Public tests must:

- validate public commands, public directories, or public contracts
- use throwaway fixtures only
- avoid asserting private implementation details such as file ordering or internal mock state

Maintainer tests are appropriate when they:

- assert internal ordering, `mtime`, naming, or historical regression behavior
- depend on internal mock provider state
- cover heavier lifecycle flows than template users need as the default smoke layer

## Adding A New Suite

Public:

1. Create `suites/<name>/index.mjs` exporting `run(ctx)`
2. Create test files (e.g. `suites/<name>/<test>-smoke.mjs`)
3. Register in `run.mjs`

Maintainer:

1. Create `maintainer/<name>/index.mjs` exporting `run(ctx)`
2. Create maintainer regression files under that directory
3. Register in `run-maintainer.mjs`

## Dependencies

- Node.js >= 18
- Python 3.9+ (for `ui`, `environment`, `database`, and maintainer suites that exercise Python controllers)
