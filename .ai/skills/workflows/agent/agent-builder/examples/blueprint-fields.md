# Blueprint Field Reference

This document provides detailed reference for `agent-blueprint.json` fields.

For the canonical JSON Schema, see:
- `templates/agent-blueprint.schema.json`

---

## Required Top-level Blocks (v1)

- `kind` (must be `agent_blueprint`)
- `version` (integer >= 1)
- `meta`
- `agent`
- `scope`
- `integration`
- `interfaces`
- `api`
- `schemas`
- `contracts`
- `model`
- `configuration`
- `conversation`
- `budgets`
- `data_flow`
- `observability`
- `security`
- `acceptance`
- `deliverables`

> Optional blocks may include `tools`, `operations`, `prompting`, `lifecycle`, and others.

---

## Enums (selected)

### Integration

| Field | Allowed Values |
|-------|---------------|
| `integration.primary` | `api` |
| `integration.attach[]` | `worker`, `sdk`, `cron`, `pipeline` |
| `integration.trigger.kind` | `sync_request`, `async_event`, `scheduled`, `manual`, `batch` |
| `integration.target.kind` | `service`, `repo_module`, `pipeline_step`, `queue`, `topic`, `job`, `function`, `other` |
| `integration.failure_contract.mode` | `propagate_error`, `return_fallback`, `enqueue_retry` (suppression modes not allowed) |
| `integration.rollback_or_disable.method` | `feature_flag`, `config_toggle`, `route_switch`, `deployment_rollback` |

### Interfaces (per entrypoint)

| Field | Allowed Values |
|-------|---------------|
| `interfaces[].type` | `http`, `worker`, `sdk`, `cron`, `pipeline`, `cli` |
| `interfaces[].response_mode` | `blocking`, `streaming`, `async` |
| `interfaces[].exposure_level` | `none`, `progress`, `debug` |
| `interfaces[].streaming.protocol` | `websocket`, `sse`, `chunked_jsonl` (default: `websocket` for HTTP streaming) |

### Conversation / Memory

| Field | Allowed Values | Default |
|-------|---------------|---------|
| `conversation.mode` | `no-need`, `buffer`, `buffer_window`, `summary`, `summary_buffer` | — |
| `conversation.summary.update_method` | `llm`, `heuristic` | `llm` |
| `conversation.summary.refresh_policy` | `every_turn`, `threshold`, `periodic` | `threshold` |
| `conversation.summary.update_timing` | `after_turn`, `async_post_turn` | varies (see below) |

**Recommended `update_timing` defaults:**
- Interactive streaming: `async_post_turn`
- Blocking: `after_turn`

---

## See Also

- [Usage Guide](usage.md) — main workflow overview
- [Adapter Behaviors](adapter-behaviors.md) — entrypoint runtime details
- [Conversation Modes](conversation-modes.md) — memory strategy details

