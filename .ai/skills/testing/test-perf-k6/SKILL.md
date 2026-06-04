---
name: test-perf-k6
description: k6 performance testing: scenario templates, thresholds, CI gating, and regression interpretation with standardized outputs.
---

# k6 Performance Testing (workflow)

## Operating mode (token-efficient)
- Treat this skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow it end-to-end.
- Optimize for reproducible performance signals (thresholds + stable environments).

## Routing (pick one procedure)

| Task | Open this procedure | Optional examples |
|---|---|---|
| Bootstrap k6 perf testing in a repo | `reference/procedures/bootstrap.md` | `reference/examples/thresholds.mjs` |
| Add a new scenario (smoke/load/stress/soak) | `reference/procedures/add-scenario.md` | `reference/examples/smoke.mjs`, `reference/examples/load.mjs` |
| Run locally | `reference/procedures/run-local.md` | — |
| Add CI gating (threshold-based) | `reference/procedures/ci-gate.md` | `reference/examples/thresholds.mjs` |
| Interpret regressions | `reference/procedures/interpret-regressions.md` | — |

## Shared non-negotiables (apply to all procedures)
1) **Versioned scenarios**
   - Store k6 scripts in-repo and review like code.
   - Keep scenarios small and composable.

2) **Explicit thresholds**
   - Every CI-gated scenario must have thresholds (p95/p99 latency, error rate).
   - Thresholds must be justified and documented.

3) **Environment control**
   - Prefer stable staging environments for consistent results.
   - Do not run load/stress tests against production unless explicitly approved.

4) **Artifact contract (for CI + trend analysis)**
   - Standardize under: `artifacts/k6/`
   - Export at least a JSON summary (and optionally JUnit-like output if you convert).

5) **No secrets in repo**
   - Inject tokens via CI secrets / env vars.
   - Never commit API tokens in scripts.

## Minimal inputs you should capture before changing code
- Target endpoint(s) and base URL(s)
- Auth strategy for load tests (token acquisition and rotation strategy)
- Target SLOs / acceptable latency and error rates
- Load model (users, arrival rate, duration)
- Whether tests are PR-gating vs scheduled (nightly)

## Verification
- If you changed **skills**:
  - Prefer host-repo tooling if present:
    - `node .ai/scripts/lint-skills.mjs --strict`
  - Always run the local validator:
    - `node .ai/skills/testing/test-perf-k6/scripts/validate-skill.mjs`

- If you changed **perf scripts**:
  - `k6 version` (or `docker run --rm grafana/k6 version`)
  - `k6 run <script.mjs>`

## Boundaries
- Do not edit `.codex/skills/` or `.claude/skills/` directly (generated).
- Do not set thresholds so loose that regressions pass unnoticed.
- Do not run high-load tests without coordinating capacity and rate limits.
