# Adapter Behaviors Reference

This document describes the runtime behavior of each generated adapter (scaffold defaults).

---

## HTTP Adapter

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `<base_path>/health` | Returns `200 { "status": "ok" }` |
| `POST` | `<base_path>/run` | Blocking mode: returns `RunResponse` |

> **Note:** Blueprint schema `api.routes[]` only allows `run` and `health`. Streaming endpoints below are **additional** runtime routes provided by the scaffold, not declared in the blueprint.

### SSE Streaming (additional endpoint)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `<base_path>/run/stream` | SSE streaming endpoint |

1. Client sends `POST <base_path>/run/stream` with `RunRequest` JSON body
2. Server responds with `Content-Type: text/event-stream`
3. Server emits `RunEvent` messages as SSE data frames
4. Server sends a final completion event

### WebSocket Streaming (additional endpoint)

| Method | Path | Description |
|--------|------|-------------|
| `WS` | `<base_path>/ws` | WebSocket streaming endpoint |

1. Client connects to `<base_path>/ws`
2. Client sends a `RunRequest` JSON message
3. Server emits `RunEvent` messages
4. Server sends a final completion event

---

## Worker Adapter (placeholder)

The default worker is a **file-queue** implementation.

### Input/Output

| Direction | Path | Format |
|-----------|------|--------|
| Input | `AGENT_WORKER_INPUT_DIR/*.json` | `RunRequest` JSON |
| Output (success) | `AGENT_WORKER_OUTPUT_DIR/*.out.json` | `RunResponse` JSON |
| Output (error) | `AGENT_WORKER_OUTPUT_DIR/*.error.json` | `AgentError` JSON |

### File Lifecycle

After processing, input files are moved to:
- `<input_dir>/.done/` — on success
- `<input_dir>/.failed/` — on failure or invalid JSON

> This is a placeholder for real queues/topics/task tables.

---

## Cron Adapter

### Input Sources (priority order)

1. `AGENT_CRON_INPUT_JSON` environment variable (preferred)
2. `AGENT_CRON_INPUT_FILE` file path

### Output

- If `AGENT_CRON_OUTPUT_FILE` is set → writes to file
- Otherwise → writes to stdout

---

## Pipeline Adapter

### I/O Contract

| Direction | Default | Override |
|-----------|---------|----------|
| Input | stdin | `--input <file>` |
| Output | stdout | `--output <file>` |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success (`RunResponse` written to stdout/file) |
| `1` | Error (`AgentError` written to stderr) |

---

## SDK Adapter

Exports a stable in-process API:

```javascript
const { runAgent } = require('./src/adapters/sdk');

const response = await runAgent(request, options);
// response: RunResponse
```

---

## See Also

- [Usage Guide](usage.md) — main workflow overview
- [Blueprint Fields](blueprint-fields.md) — schema reference
- [Conversation Modes](conversation-modes.md) — memory strategy details

