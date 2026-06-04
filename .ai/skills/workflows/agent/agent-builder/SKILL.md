---
name: agent-builder
description: Build a complete, production-embedded Agent module for a real feature request (API + optional worker/sdk/cron/pipeline), including blueprint, scaffolded runtime, prompt pack, docs, and registry entry. Enforces explicit user approvals, no-secrets-in-repo, fixed API route names (run/health), and conversation/memory strategy decisions.
metadata:
  short-description: Turn a feature request into a runnable agent module embedded into a project.
  version: 2
---

# Agent Builder

You are `agent-builder`: an **Agent Build Engineer** who turns a real feature request into a **repo-integrated, production-ready Agent**.

The agent-builder skill is designed for **actual workflows** (not demos). The generated agent may be non-generic, but the agent must be:
- embedded into a concrete production integration point,
- runnable (not just a scaffold — tools and prompts are implemented),
- configurable without secrets committed to the repo,
- testable and maintainable (docs + registry entry + verification evidence),
- structured with **Core vs Adapters** separation.

---

## LLM Execution Protocol

When a user requests "I want an Agent with X capability", execute the following protocol:

### Phase 0: Requirement Parsing

**Trigger**: User describes an Agent need (explicit or implicit).

**Actions**:
1. Extract from user request:
   - Functional goal (what the agent should do)
   - Integration target (where the agent will be embedded)
   - Trigger type (how the agent will be invoked)
   - Expected output format
2. Identify implicit constraints:
   - Data sensitivity (PII, confidential, internal, public)
   - Performance requirements (latency, throughput)
   - Availability requirements (kill switch, fallback)
3. Summarize understanding and confirm with user before proceeding.

**Output**: Verbal confirmation of understanding.

### Phase 1: Stage A — Interview

**Actions**:
1. Run: `node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs start`
2. Note the temporary workdir path returned.
3. Walk through `reference/decision_checklist.md` with the user:
   - For each decision point, ask clarifying questions if needed
   - Record answers in structured format
4. Generate `stage-a/interview-notes.md` in the workdir.
5. Generate `stage-a/integration-decision.md` in the workdir.

**Checkpoint**: Present the integration decision summary and request explicit user approval.

```
[APPROVAL REQUIRED]
Stage A complete. Please review the integration decision:
- Primary embedding: API (HTTP)
- Attachments: [worker/sdk/cron/pipeline]
- Integration target: [kind] / [name]
- Failure mode: [propagate_error/return_fallback/enqueue_retry]

Type "approve A" to proceed to Blueprint generation.
```

**On Approval**: Run `node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs approve --workdir <WORKDIR> --stage A`

### Phase 2: Stage B — Blueprint

**Actions**:
1. Encode all decisions into `stage-b/agent-blueprint.json` following the schema at `templates/agent-blueprint.schema.json`.
2. Ensure all required blocks are present and valid.
3. Run validation: `node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs validate-blueprint --workdir <WORKDIR>`
4. If validation fails, fix errors and re-validate.

**Checkpoint**: Present blueprint summary and request explicit user approval.

```
[APPROVAL REQUIRED]
Blueprint validated successfully. Key configuration:
- Agent ID: {{agent_id}}
- Interfaces: [http, worker, ...]
- Conversation mode: {{conversation.mode}}
- Tools: [{{tool_ids}}]
- Acceptance scenarios: {{scenario_count}}

Type "approve B" to proceed to scaffolding.
```

**On Approval**: Run `node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs approve --workdir <WORKDIR> --stage B`

### Phase 3: Stage C — Scaffold

**Actions**:
1. Run plan first: `node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs plan --workdir <WORKDIR> --repo-root .`
2. Present the file list to be created.
3. Run apply: `node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs apply --workdir <WORKDIR> --repo-root . --apply`
4. Report created files and any skipped files.

**Output**: List of generated files organized by category (code, docs, config).

### Phase 4: Stage D — Implement (Manual / LLM-assisted)

> **Note:** Stage D is manual; the scaffold generates placeholders that require implementation.

**Actions** (performed by developer or LLM):
1. **Implement Tools**: For each tool in `blueprint.tools.tools[]`:
   - Read tool specification (kind, schemas, timeouts, auth)
   - Implement logic in `src/core/tools.mjs` using patterns from `reference/stage_d_implementation_guide.md`
   - Add required env vars to `.env.example` if not present

2. **Write Prompt Pack**: Based on `agent.summary`, `scope`, and `security`:
   - Write `prompts/system.md` with role, capabilities, boundaries
   - Write `prompts/examples.md` with in-scope and out-of-scope examples
   - Write `prompts/developer.md` with internal instructions

3. **Expand Tests**: For each scenario in `acceptance.scenarios[]`:
   - Add/extend tests under `tests/` (scaffold includes `tests/smoke.test.mjs`)
   - Include given/when/then structure
   - Include expected_output_checks as assertions

**Output**: Implemented components with file paths.

### Phase 5: Stage E — Verify

**Actions**:
1. Run verification: `node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs verify --workdir <WORKDIR> --repo-root .`
2. Review generated evidence:
   - `stage-e/verification-evidence.json` (structured data)
   - `stage-e/verification-report.md` (human-readable summary)
3. If any scenario fails, investigate and fix.
4. Update docs if needed based on implementation.
5. Cleanup: `node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs finish --workdir <WORKDIR> --apply`

**Output**: Verification report and final delivery summary.

---

## Non-negotiable Constraints

- **Stage A Interview must not write to the repo.** Use a temporary workdir and delete it at the end.
- **User must explicitly approve**:
  - the integration decision (Stage A → B),
  - the blueprint (Stage B → C).
- **Primary embedding is API (HTTP).**
- **Attach types implemented in v1** (not future work): `worker`, `sdk`, `cron`, `pipeline`.
- API routes must include **fixed names**: `run` and `health`.
- `integration.failure_contract.mode` must NOT include any suppression mode (no `suppress_and_alert`).
- **Kill switch** is mandatory (`AGENT_ENABLED` required in `configuration.env_vars`).
- **Registry update** is mandatory (`deliverables.registry_path` must be created/updated).
- **Core / Adapters separation** is mandatory.
- **Tools must be implemented** (not left as TODO stubs).
- **Verification evidence must be generated** (JSON + Markdown).

---

## Workflow Stages (A–E)

### Stage A — Interview (temporary workdir only)

1. Create a temporary workdir via `agent-builder.mjs start`.
2. Use the **Decision Checklist** (`reference/decision_checklist.md`) to capture all required decisions.
3. Produce in the workdir:
   - `stage-a/interview-notes.md`
   - `stage-a/integration-decision.md`
4. **Stop and request explicit user approval.**

### Stage B — Blueprint (JSON)

1. Encode decisions into `stage-b/agent-blueprint.json`.
2. Ensure required blocks and enums are present (API + selected attachments).
3. Run validation (`validate-blueprint`).
4. **Stop and request explicit user approval of the blueprint.**

### Stage C — Scaffold (repo writes)

1. Generate the complete agent module under `agents/<agent_id>/`.
2. Generate docs under `agents/<agent_id>/doc/`.
3. Create/update registry at `agents/registry.json`.
4. Do not overwrite existing files; skip and report.

### Stage D — Implement (manual / LLM-assisted)

1. Implement real tool logic in `src/core/tools.mjs` based on blueprint tool definitions.
2. Write prompt pack content (`prompts/*.md`) based on agent scope and security policy.
3. Write acceptance test cases based on `acceptance.scenarios[]`.
4. See `reference/stage_d_implementation_guide.md` for patterns and best practices.

> Stage D is performed manually by the developer or with LLM assistance. The scaffold provides placeholders; actual implementation is project-specific.

### Stage E — Verify + Cleanup

1. Run `verify` command to execute acceptance scenarios.
2. Generate verification evidence (JSON + Markdown).
3. Review and fix any failures.
4. Update docs/runbook if needed.
5. Ensure registry entry is correct.
6. Delete the temporary workdir via `finish --apply`.

---

## Verification

- [ ] Stage A docs exist in the temporary workdir and **not** in the repo.
- [ ] Stage B blueprint validates (`validate-blueprint`).
- [ ] Stage C scaffold created expected files without overwriting.
- [ ] Stage E verification completed and evidence files generated.
- [ ] Registry entry created/updated as specified.

## Boundaries

- MUST NOT write to the repo during Stage A.
- MUST NOT proceed from Stage A→B or Stage B→C without explicit user approval.
- MUST NOT commit secrets to the repo.
- MUST NOT change fixed API route names (`run`, `health`).
- SHOULD NOT skip verification evidence generation.

---

## Helper Tool Commands

Use the dependency-free helper script:

```
.ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs
```

| Command | Purpose |
|---------|---------|
| `start` | Create temporary workdir and initial state |
| `status` | Show current run state and next steps |
| `approve --stage <A\|B>` | Mark stage approval (required before apply) |
| `validate-blueprint` | Validate blueprint JSON for required fields and constraints |
| `plan` | Dry-run: show files that would be created/updated |
| `apply --apply` | Apply scaffold into the repo (requires approvals A+B) |
| `verify` | Execute acceptance scenarios and generate evidence |
| `finish --apply` | Delete the temporary workdir (safe-guarded) |

---

## Reference Documents

| Document | Purpose |
|----------|---------|
| `reference/decision_checklist.md` | 15 decision points to capture during interview |
| `reference/agent-builder-handbook.md` | Design principles, decision trees, boundary conditions |
| `reference/stage_d_implementation_guide.md` | Tool, prompt, and test implementation patterns |
| `templates/agent-blueprint.schema.json` | Blueprint JSON Schema (canonical) |
| `examples/usage.md` | Operator-oriented quick start guide |

---

## Output Expectations

When executing this skill, always produce:

1. **Stage A**: Interview notes and integration decision (in workdir, not repo).
2. **Stage B**: Validated blueprint JSON (in workdir).
3. **Stage C**: Scaffold plan (file list) before applying, then apply summary.
4. **Stage D**: Implemented tools, prompt pack, and test cases (in repo).
5. **Stage E**: Verification evidence (JSON + Markdown) and delivery summary.

### Final Delivery Summary Template

```
## Agent Delivery Summary

### Agent
- ID: {{agent_id}}
- Name: {{agent_name}}
- Module Path: {{agent_module_path}}

### Interfaces
| Type | Entrypoint | Response Mode |
|------|------------|---------------|
| http | node src/adapters/http/server.mjs | blocking |
| http (SSE) | POST /run/stream | streaming |
| http (WS) | ws://.../ws | streaming |
| ... | ... | ... |

### Verification
- Scenarios: {{passed}}/{{total}} passed
- Evidence: agents/{{agent_id}}/doc/verification-report.md

### Next Steps
- [ ] Configure environment variables (see .env.example)
- [ ] Deploy to target environment
- [ ] Enable kill switch (AGENT_ENABLED=true)
```
