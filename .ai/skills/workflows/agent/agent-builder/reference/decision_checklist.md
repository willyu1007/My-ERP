# Agent Builder Decision Checklist

## Purpose
This checklist enumerates the decisions that MUST be made before scaffolding a new agent with `agent-builder`.

## Audience
Human operator or LLM running `agent-builder` for a real feature request.

## How to use
1) Capture decisions in temporary Stage A notes under `stage-a/interview-notes.md` and `stage-a/integration-decision.md`.
2) Encode decisions in `stage-b/agent-blueprint.json` (schema: `templates/agent-blueprint.schema.json`).
3) Validate with `node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs validate-blueprint --workdir <WORKDIR>`.

## Decision Inventory

### 1) Problem framing and scope
- MUST define the single primary outcome, the primary callers, and the Definition of Done.
- MUST list `scope.in_scope` and `scope.out_of_scope`.
- SHOULD document non-goals to prevent scope creep (in `scope.out_of_scope` or interview notes).
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`scope.*`).

### 2) Integration embedding and interfaces
- MUST choose the primary embedding (`integration.primary`) and any attachments (`integration.attach`).
- MUST define `integration.trigger` and `integration.target`.
- MUST define `interfaces[]` for every enabled entrypoint (http/worker/sdk/cron/pipeline).
Record in: `stage-a/integration-decision.md`, `stage-b/agent-blueprint.json` (`integration.*`, `interfaces[]`).

### 3) API contract and routing
- MUST set `api.protocol`, `api.base_path`, and `api.timeout_budget_ms`.
- MUST include `run` and `health` routes in `api.routes[]`.
- MUST define `api.auth` and `api.degradation` modes.
Record in: `stage-a/integration-decision.md`, `stage-b/agent-blueprint.json` (`api.*`).

### 4) Input/output schemas and versioning
- MUST define `schemas.RunRequest`, `schemas.RunResponse`, `schemas.AgentError`.
- MUST ensure all schema refs (`#/schemas/...`) resolve.
- SHOULD define a backward-compatibility policy for schema changes.
Record in: `stage-b/agent-blueprint.json` (`schemas.*`, schema refs).

### 5) Conversation and state
- MUST decide whether conversation state is needed (`no-need`, `buffer`, `buffer_window`, `summary`, `summary_buffer`).
- MUST define storage location, retention window, and redaction policy if state is persisted.
- SHOULD define memory eviction rules and multi-tenant isolation rules.
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`data_flow.*`, `operations.*`, or a new `conversation` block).

### 6) Output format and interaction model
- MUST define response mode per interface (`blocking`, `streaming`, `async`).
- SHOULD define which intermediate outputs are surfaced to users vs kept internal.
- SHOULD define front-end interaction contract when a UI is involved (fields, validations, callbacks).
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`interfaces[]` notes or a new `output` block).

### 7) Tools and side effects
- MUST declare tools that perform external calls or side effects.
- MUST provide tool input/output schema refs, timeouts, retries, and idempotency strategy.
- MUST define tool permission boundaries and audit requirements.
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`tools.tools[]`, `security.*`).

### 8) Model selection and prompting
- MUST specify `model.primary` (provider, model, reasoning profile).
- SHOULD define fallback profiles if high availability is required.
- SHOULD declare prompting tier and examples strategy.
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`model.*`, `prompting.*`).

### 9) Reliability and failure handling
- MUST specify `integration.failure_contract` and `integration.rollback_or_disable`.
- MUST include an explicit kill switch (`AGENT_ENABLED` in `configuration.env_vars`).
- SHOULD define retries, backoff, and idempotency per interface.
Record in: `stage-a/integration-decision.md`, `stage-b/agent-blueprint.json` (`integration.*`, `worker.*`, `configuration.env_vars`).

### 10) Performance and cost
- MUST define latency and throughput budgets for the primary path.
- SHOULD define token/step limits and cache strategy if needed.
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`api.timeout_budget_ms`, `model.*`, `operations.*`).

### 11) Data handling and compliance
- MUST classify data (`PII`, `confidential`, `internal`) and document what is sent to the LLM.
- MUST specify retention and redaction policies if any data is stored.
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`data_flow.*`, `security.*`).

### 12) Observability and operations
- MUST define required log fields and correlation IDs.
- SHOULD define metrics, tracing, and alert thresholds.
- SHOULD define on-call ownership and runbook notes.
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`observability.*`, `operations.*`).

### 13) Acceptance scenarios and verification
- MUST provide at least 2 end-to-end scenarios with explicit checks.
- SHOULD include a failure scenario and a kill-switch scenario.
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`acceptance.scenarios[]`).

### 14) Deliverables and registry
- MUST define `deliverables.agent_module_path`, `deliverables.docs_path`, `deliverables.registry_path`.
- MUST ensure core/adapters separation is `required`.
Record in: `stage-b/agent-blueprint.json` (`deliverables.*`).

### 15) Lifecycle and versioning
- SHOULD define versioning, migration notes, and deprecation policy for the agent.
Record in: `stage-a/interview-notes.md`, `stage-b/agent-blueprint.json` (`lifecycle.*`).

## Verification
- `stage-a/` artifacts exist only in the temporary workdir (not in the repo).
- `stage-b/agent-blueprint.json` passes `validate-blueprint` with no errors.
- All required decisions above are represented in `stage-b/agent-blueprint.json`.

## Prompt Template
```
Goal:
Constraints (MUST / DON'T):
Relevant paths:
Decisions to capture:
Acceptance criteria:
```
