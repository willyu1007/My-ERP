# `agent-builder` Usage Guide

`agent-builder` scaffolds a **complete, repo-integrated Agent** for a real feature request.

It produces:
- a runnable agent module (`agents/<agent_id>/`),
- maintainability docs (`agents/<agent_id>/doc/`),
- a project registry entry (`agents/registry.json`),
- plus a validated, versioned **blueprint** that becomes the single source of truth for subsequent implementation.

This guide is written for human operators. An LLM can follow the same steps programmatically.

---

## 1) What `agent-builder` is for

`agent-builder` is for building production-embedded agents, not demos.

| Embedding | Types |
|-----------|-------|
| **Primary** | `api` (HTTP) |
| **Attach** | `worker`, `sdk`, `cron`, `pipeline` |

---

## 2) Deliverables

When a blueprint is applied, `agent-builder` generates:

| Deliverable | Default Path | Contents |
|-------------|--------------|----------|
| Agent module | `agents/<agent_id>/` | `src/core/`, `src/adapters/`, `prompts/`, `schemas/`, `config/` |
| Agent docs | `agents/<agent_id>/doc/` | `overview.md`, `integration.md`, `runbook.md`, etc. |
| Registry entry | `agents/registry.json` | Discovery index with id, owners, entrypoints |

> Core/Adapters separation is mandatory. See [Adapter Behaviors](adapter-behaviors.md) for runtime details.

---

## 3) Staged Flow (A–E)

| Stage | Purpose | Artifacts | Checkpoint |
|-------|---------|-----------|------------|
| **A** | Interview | `stage-a/interview-notes.md`, `stage-a/integration-decision.md` | User approval required |
| **B** | Blueprint | `stage-b/agent-blueprint.json` | User approval required |
| **C** | Scaffold | Code + docs + registry in repo | — |
| **D** | Implement | Real domain logic in `src/core/` | — |
| **E** | Verify | Acceptance scenarios + cleanup | — |

**Rule:** During Stage A, do not write anything to the repo. Artifacts live in a temporary workdir.

---

## 4) Helper Tool: `scripts/agent-builder.mjs`

Path: `.ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs`

This script is dependency-free (Node.js only).

### Commands

| Command | Purpose |
|---------|---------|
| `start` | Create a temporary workdir and initial state |
| `status` | Show current run state and next steps |
| `approve` | Mark Stage A/B approvals (required before apply) |
| `validate-blueprint` | Validate blueprint JSON |
| `plan` | Dry-run: show files that would be created |
| `apply` | Apply scaffold into the repo |
| `verify` | Execute acceptance scenarios |
| `verify --skip-http` | Skip HTTP scenarios (for sandbox/CI) |
| `finish` | Delete the temporary workdir |

### Quickstart

```bash
# Start a new run
node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs start

# Approve Stage A
node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs approve --workdir <WORKDIR> --stage A

# Validate and approve Stage B
node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs validate-blueprint --workdir <WORKDIR>
node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs approve --workdir <WORKDIR> --stage B

# Apply scaffold
node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs apply --workdir <WORKDIR> --repo-root . --apply

# Verify acceptance scenarios
node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs verify --workdir <WORKDIR> --repo-root .

# Cleanup (--apply required to actually delete)
node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs finish --workdir <WORKDIR> --apply
```

---

## 5) Operational Invariants

| Invariant | Enforcement |
|-----------|-------------|
| No secrets in repo | Only env var names in `.env.example` |
| Kill switch required | `AGENT_ENABLED` must be in `configuration.env_vars` with `required: true` |
| Registry update required | `deliverables.registry_path` must be created/updated |
| Core/Adapters separation | Core logic must not import adapter-specific modules |

---

## 6) Deep Dive References

| Topic | Document |
|-------|----------|
| Blueprint schema and enums | [Blueprint Fields](blueprint-fields.md) |
| Adapter runtime behavior | [Adapter Behaviors](adapter-behaviors.md) |
| Conversation/memory strategies | [Conversation Modes](conversation-modes.md) |

---

## 7) Skill Pack Index

| Resource | Path |
|----------|------|
| Skill instructions | `SKILL.md` |
| Decision checklist | `reference/decision_checklist.md` |
| Blueprint schema | `templates/agent-blueprint.schema.json` |
| State schema | `templates/agent-builder-state.schema.json` |
| Scaffold templates | `templates/agent-kit/node/layout/` |
| Prompt pack templates | `templates/prompt-pack/` |
