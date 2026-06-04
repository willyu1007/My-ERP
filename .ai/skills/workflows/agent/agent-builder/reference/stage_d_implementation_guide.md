# Stage D Implementation Guide

Stage D is where real logic gets implemented: tools, prompts, and tests.

---

## Overview

After Stage C scaffolds the agent module, Stage D fills in the actual implementation:

| Component | Source | Implementation Task |
|-----------|--------|---------------------|
| Tools | `blueprint.tools.tools[]` | Write function implementations |
| Prompts | `blueprint.scope`, `blueprint.agent` | Write system/examples/developer prompts |
| Tests | `blueprint.acceptance.scenarios[]` | Convert scenarios to test cases |

---

## Decision Flow

```
┌─────────────────────────────────────────────┐
│               Start Stage D                 │
└─────────────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   Has tools defined?      Has acceptance
   in blueprint?           scenarios?
          │                       │
          ▼                       ▼
   ┌──────────────┐        ┌──────────────┐
   │ Implement    │        │ Write tests  │
   │ each tool    │        │ for each     │
   │              │        │ scenario     │
   │ See: stage_d/│        │              │
   │ tool_patterns│        │ See: stage_d/│
   │ .md          │        │ test_writing │
   └──────────────┘        │ .md          │
          │                └──────────────┘
          │                       │
          └───────────┬───────────┘
                      ▼
            ┌──────────────────┐
            │ Write prompt pack│
            │                  │
            │ See: stage_d/    │
            │ prompt_writing.md│
            └──────────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │ Run tests        │
            │ All P0 passing?  │
            └──────────────────┘
                      │
              ┌───────┴───────┐
              │ Yes           │ No
              ▼               ▼
        Stage D Done    Fix and retry
```

---

## File Index

| Topic | File | When to Read |
|-------|------|--------------|
| Tool implementation patterns | [`stage_d/tool_patterns.md`](stage_d/tool_patterns.md) | Implementing tools (HTTP, DB, MCP) |
| Prompt pack writing | [`stage_d/prompt_writing.md`](stage_d/prompt_writing.md) | Writing system/examples/developer prompts |
| Test writing | [`stage_d/test_writing.md`](stage_d/test_writing.md) | Converting acceptance scenarios to tests |

---

## Tool Registration

Tools are registered in `src/core/tools.mjs` via the `toolImplementations` object:

```javascript
const { toolImplementations } = require('./tools');

// Register a tool implementation
toolImplementations['my_tool'] = async (input, context) => {
  // context contains: { manifest, contract_version, logger }
  // Return success:
  return { ok: true, output: { result: 'success' } };
  // Return error:
  // return { ok: false, error: { code: 'tool_error', message: '...' } };
};
```

---

## Configuration Options

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| `tools.max_steps` | manifest/env | 5 | Maximum tool loop iterations (`AGENT_TOOLS_MAX_STEPS`) |
| `api.max_request_size_bytes` | manifest | 1MB | Max HTTP/WebSocket request body size |
| `worker.max_concurrency` | env | 4 | Worker parallel jobs (`AGENT_WORKER_MAX_CONCURRENCY`) |
| `conversation.retention.max_items` | manifest | unlimited | Max conversation entries in store |
| `conversation.retention.ttl_seconds` | manifest | unlimited | Conversation entry TTL |

---

## Quick Checklist

### Tools
- [ ] Each tool in `blueprint.tools.tools[]` has implementation
- [ ] Tool implementations are registered in `src/core/tools.mjs` via `toolImplementations` registry
- [ ] Retry logic for tools with `max_attempts > 1`
- [ ] Audit logging for tools with `audit.required`
- [ ] Tool loop `maxSteps` configured if needed (env: `AGENT_TOOLS_MAX_STEPS`, default: 5)

### Prompts
- [ ] `prompts/system.md` reflects agent role
- [ ] `prompts/examples.md` has 3-6 examples
- [ ] `prompts/developer.md` has internal instructions

### Tests
- [ ] Each `acceptance.scenarios[]` has a test
- [ ] All P0 scenarios pass
- [ ] Mocks in place for external dependencies

### Integration
- [ ] `.env.example` includes all required env vars
- [ ] README updated with run instructions

### Custom Storage (if using kv_store/database)
- [ ] Custom store adapter implemented in `src/core/conversation.mjs`
- [ ] Store adapter follows `InMemoryStore`/`FileStore` interface (get/set/delete methods)
- [ ] TTL and max_items eviction implemented if required

---

## Next Steps

After completing Stage D:
1. Run all tests: `node --test tests/`
2. Verify P0 scenarios pass
3. Proceed to Stage E (Verify + Cleanup)
