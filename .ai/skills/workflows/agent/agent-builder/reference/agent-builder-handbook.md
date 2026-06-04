# Agent Builder Reference Handbook

This handbook provides design principles, decision trees, boundary conditions, and common patterns for building production-embedded agents. It is intended as a reference for LLMs executing the `agent-builder` skill.

---

## 1. Design Principles

### 1.1 Core vs Adapters Separation

**Principle**: Business logic must be isolated from integration concerns.

```
agents/<agent_id>/
├── src/
│   ├── core/           # Provider-agnostic logic
│   │   ├── run.mjs      # Main orchestration
│   │   ├── tools.mjs    # Tool implementations
│   │   ├── prompts.mjs  # Prompt loading
│   │   ├── conversation.mjs  # Memory management
│   │   ├── contracts.mjs     # Schema validation
│   │   └── errors.mjs        # Error types
│   │
│   └── adapters/       # Integration-specific code
│       ├── http/       # HTTP + WebSocket server
│       ├── worker/     # Async job processing
│       ├── sdk/        # In-process API
│       ├── cron/       # Scheduled execution
│       └── pipeline/   # CI/ETL integration
```

**Why**: 
- Core logic can be tested independently of adapters.
- New adapters can be added without modifying core.
- Provider changes (e.g., switching LLM providers) affect only specific modules.

**Enforcement**: `deliverables.core_adapter_separation` must be `"required"` in blueprint.

### 1.2 Blueprint as Single Source of Truth

**Principle**: The blueprint JSON captures all architectural decisions and drives code generation.

**Benefits**:
- Deterministic scaffold generation
- Machine-readable contract for validation
- Version-controlled configuration
- Self-documenting architecture

**Required Blueprint Blocks**:
```
kind, version, meta, agent, scope, integration, interfaces, api,
schemas, contracts, model, configuration, conversation, budgets,
data_flow, observability, security, acceptance, deliverables
```

### 1.3 Five-Stage Flow Rationale

| Stage | Purpose | Reversibility |
|-------|---------|---------------|
| A (Interview) | Capture decisions without commitment | Full (temp workdir) |
| B (Blueprint) | Encode and validate decisions | Full (temp workdir) |
| C (Scaffold) | Generate initial structure | Partial (no overwrite) |
| D (Implement) | Fill in real logic | Incremental |
| E (Verify) | Prove correctness | N/A |

**Why Explicit Approvals**: Prevents costly mistakes. Stages A and B are in temp workdir, so errors are cheap. Stage C writes to repo, so approval ensures user commitment.

### 1.4 No Secrets in Repo

**Principle**: Environment variable names and placeholders only.

**Correct**:
```json
{
  "name": "LLM_API_KEY",
  "description": "API key for the LLM provider.",
  "required": true,
  "sensitivity": "secret",
  "example_placeholder": "<set-in-secret-store>"
}
```

**Incorrect**:
```json
{
  "name": "LLM_API_KEY",
  "value": "sk-abc123..."
}
```

---

## 2. Decision Trees

### 2.1 Integration Type Selection

```
User Request
    │
    ├─ "I need an API endpoint" ─────────────────────► primary: api
    │
    ├─ "Background processing needed?"
    │   ├─ Yes, async jobs ──────────────────────────► attach: [worker]
    │   ├─ Yes, scheduled tasks ─────────────────────► attach: [cron]
    │   └─ No ───────────────────────────────────────► attach: []
    │
    ├─ "Will it be called from other code directly?"
    │   ├─ Yes, same process ────────────────────────► attach: [sdk]
    │   └─ No ───────────────────────────────────────► (no sdk)
    │
    └─ "Part of a CI/ETL pipeline?"
        ├─ Yes ──────────────────────────────────────► attach: [pipeline]
        └─ No ───────────────────────────────────────► (no pipeline)
```

### 2.2 Conversation Mode Selection

```
Does the agent need to remember previous turns?
    │
    ├─ No ───────────────────────────────────────────► mode: no-need
    │
    └─ Yes
        │
        ├─ How much history?
        │   │
        │   ├─ All turns (small conversations) ──────► mode: buffer
        │   │
        │   ├─ Last N turns only ────────────────────► mode: buffer_window
        │   │
        │   ├─ Summarized history only ──────────────► mode: summary
        │   │
        │   └─ Summary + recent window ──────────────► mode: summary_buffer
        │
        └─ Storage requirements?
            │
            ├─ Ephemeral (single session) ───────────► storage.kind: in_memory
            ├─ Persistent across restarts ───────────► storage.kind: file | kv_store
            └─ Multi-instance / distributed ─────────► storage.kind: database
```

**Summary Mode Timing Decision**:
```
Is the interface interactive (streaming)?
    │
    ├─ Yes ──────────────────────► update_timing: async_post_turn
    │                               (don't block user waiting for summary)
    │
    └─ No (blocking) ────────────► update_timing: after_turn
                                   (summary complete before response)
```

### 2.3 Failure Handling Strategy

```
What should happen when the agent fails?
    │
    ├─ Caller handles retry logic ───────────────────► mode: propagate_error
    │   (Return structured error with retryable hint)
    │
    ├─ Return safe default / cached response ────────► mode: return_fallback
    │   (Requires fallback_value definition)
    │
    └─ Enqueue for later processing ─────────────────► mode: enqueue_retry
        (Requires worker attachment)

⚠️ NEVER use: suppress_and_alert (explicitly disallowed)
```

### 2.4 Response Mode Selection

```
What response style does the caller expect?
    │
    ├─ Wait for complete response ───────────────────► response_mode: blocking
    │   (Simple, good for short operations)
    │
    ├─ Stream tokens/progress as generated ──────────► response_mode: streaming
    │   (Better UX for long operations)
    │   │
    │   └─ Streaming protocol?
    │       ├─ Web browser ──────────────────────────► protocol: websocket | sse
    │       └─ Server-to-server ─────────────────────► protocol: chunked_jsonl
    │
    └─ Fire-and-forget, poll for result ─────────────► response_mode: async
        (Best for very long operations, requires worker)
```

---

## 3. Boundary Conditions

### 3.1 Blueprint Validation Rules

| Field | Constraint | Error if Violated |
|-------|------------|-------------------|
| `kind` | Must be `"agent_blueprint"` | Invalid blueprint kind |
| `version` | Integer >= 1 | Invalid version |
| `integration.primary` | Must be `"api"` | Only API primary supported |
| `integration.attach[]` | Only `worker\|sdk\|cron\|pipeline` | Unknown attach type |
| `integration.failure_contract.mode` | No `suppress_and_alert` | Suppression not allowed |
| `api.routes[]` | Must include `run` and `health` | Missing required routes |
| `configuration.env_vars[]` | Must include `AGENT_ENABLED` | Kill switch required |
| `acceptance.scenarios[]` | Minimum 2 scenarios | Insufficient acceptance criteria |
| `deliverables.core_adapter_separation` | Must be `"required"` | Core/adapter separation required |

### 3.2 Schema Version Compatibility

**Contract Version Flow**:
```
Request                              Response
────────────────────────────────────────────────────────────────
{ contract_version: "1.0.0", ... }  →  { contract_version: "1.0.0", ... }
```

**Compatibility Policy Options**:
- `strict`: Request version must exactly match agent version.
- `additive_only`: New fields may be added, none removed.
- `backward_compatible`: Old clients continue to work.

**Deprecation Window**: When changing schemas, old versions remain valid for `contracts.deprecation_window_days`.

### 3.3 Kill Switch Behavior

When `AGENT_ENABLED` is `false` or missing:

| Adapter | Expected Behavior |
|---------|-------------------|
| HTTP | Return 503 with `AgentError { code: "agent_disabled", retryable: false }` |
| Worker | Skip job, log warning, do not process |
| SDK | Throw `AgentDisabledError` |
| Cron | Exit 0 with log message |
| Pipeline | Exit 1 with stderr message |

### 3.4 Tool Side Effect Boundaries

| Policy | Read-Only Tools | Write Tools | Destructive Tools |
|--------|-----------------|-------------|-------------------|
| `read_only_only` | ✅ Allowed | ❌ Error | ❌ Error |
| `writes_require_approval` | ✅ Allowed | ⚠️ Approval Required | ⚠️ Approval Required |
| `writes_allowed` | ✅ Allowed | ✅ Allowed | ✅ Allowed |

---

## 4. Common Patterns

### 4.1 Pure API Agent (Minimal)

**Use Case**: Simple request-response agent, no state, no tools.

```json
{
  "integration": {
    "primary": "api",
    "attach": []
  },
  "conversation": {
    "mode": "no-need"
  },
  "tools": {
    "tools": []
  }
}
```

**Characteristics**:
- Stateless
- Fast startup
- Minimal resource usage
- Single HTTP adapter

### 4.2 API + Worker Async Pattern

**Use Case**: Long-running tasks with immediate acknowledgment.

```json
{
  "integration": {
    "primary": "api",
    "attach": ["worker"]
  },
  "api": {
    "degradation": {
      "mode": "route_to_worker"
    }
  },
  "worker": {
    "source": { "kind": "queue", "name": "agent-tasks" },
    "execution": { "max_concurrency": 5, "timeout_ms": 300000 }
  }
}
```

**Flow**:
1. HTTP receives request
2. If overloaded or long task, enqueue to worker
3. Return 202 Accepted with task ID
4. Worker processes asynchronously
5. Result stored for polling or callback

### 4.3 Conversational Agent (Summary Buffer)

**Use Case**: Multi-turn chat with long conversation support.

```json
{
  "conversation": {
    "mode": "summary_buffer",
    "scope": "per_conversation",
    "storage": { "kind": "database" },
    "summary": {
      "update_method": "llm",
      "refresh_policy": "threshold",
      "update_timing": "async_post_turn",
      "threshold": {
        "max_tokens_since_update": 2000,
        "max_turns_since_update": 10
      }
    },
    "summary_buffer": {
      "window_turns": 5,
      "window_tokens": 1500
    }
  }
}
```

**Memory Strategy**:
- Keep last 5 turns in raw form (immediate context)
- Older turns compressed into running summary
- Summary updated asynchronously to avoid blocking
- Token-first threshold (update when raw exceeds 2000 tokens)

### 4.4 Tool-Heavy Agent (with Approval Flow)

**Use Case**: Agent that performs external actions requiring human oversight.

```json
{
  "security": {
    "side_effect_policy": "writes_require_approval",
    "approvals": [{
      "id": "write_approval",
      "mode": "human_required",
      "applies_to": {
        "side_effect_level": ["write", "destructive"]
      }
    }]
  },
  "tools": {
    "tools": [
      {
        "id": "search_database",
        "side_effect_level": "read_only"
      },
      {
        "id": "update_record",
        "side_effect_level": "write"
      }
    ]
  }
}
```

**Approval Flow**:
1. Agent decides to call `update_record`
2. Tool execution returns `approval_required` error
3. Host workflow presents to human for approval
4. If approved, retry with approval token
5. Tool executes with audit log

### 4.5 Multi-Tenant Agent

**Use Case**: Single agent instance serving multiple isolated tenants.

```json
{
  "conversation": {
    "mode": "buffer_window",
    "scope": "per_tenant",
    "key": {
      "source": "header",
      "name": "x-tenant-id"
    },
    "storage": { "kind": "database" },
    "retention": {
      "ttl_seconds": 604800,
      "max_items": 10000
    }
  },
  "data_flow": {
    "data_classes": ["confidential"],
    "llm_egress": {
      "what_is_sent": "Tenant-scoped data only, no cross-tenant leakage",
      "redaction": "strict"
    }
  }
}
```

**Isolation Guarantees**:
- Conversation state keyed by tenant ID
- Strict redaction to prevent data leakage
- TTL ensures cleanup of inactive tenants
- Audit logs include tenant context

---

## 5. Troubleshooting

### 5.1 Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Missing required block: X" | Blueprint missing top-level section | Add the required block |
| "AGENT_ENABLED must be required=true" | Kill switch not properly configured | Add to env_vars with required: true |
| "api.routes must include run and health" | Missing standard routes | Add both route definitions |
| "Schema ref does not resolve" | Reference to undefined schema | Define schema or fix ref path |
| "worker block required" | attach includes worker but no config | Add worker configuration block |

### 5.2 Runtime Issues

| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| 503 on all requests | AGENT_ENABLED=false | Set AGENT_ENABLED=true |
| Tool returns "not implemented" | Stage D incomplete | Implement tool logic in tools.mjs |
| Conversation not persisting | storage.kind=none | Configure persistent storage |
| Summary never updates | threshold too high | Lower threshold values |
| Streaming not working | Wrong protocol | Ensure client uses websocket |

### 5.3 Performance Tuning

| Issue | Metric | Tuning |
|-------|--------|--------|
| Slow response | latency > p95 budget | Reduce max_output_tokens, use faster model |
| High memory | conversation storage | Reduce window_turns/window_tokens |
| Rate limiting | throughput > rps | Add worker for overflow |
| Cost overrun | cost > max_usd_per_task | Set stricter token limits |
