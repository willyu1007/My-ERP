# Conversation Modes Reference

This document explains the conversation/memory management strategies available in `agent-builder`.

---

## Mode Overview

| Mode | Description | Storage |
|------|-------------|---------|
| `no-need` | No conversation state | None |
| `buffer` | Store all turns | Full history |
| `buffer_window` | Store recent N turns | Sliding window |
| `summary` | Store only summary | Compressed state |
| `summary_buffer` | Summary + recent window | Hybrid |

---

## `no-need` Mode

- No conversation state is maintained
- Each request is independent
- Use for stateless, single-turn interactions

---

## `buffer` Mode

- Stores all conversation turns
- Simple but grows unbounded
- Use for short conversations or when full history is required

---

## `buffer_window` Mode

- Stores only the most recent N turns
- Older turns are discarded
- Configure via `window_turns` or `window_tokens`

---

## `summary` Mode

Stores only a summary state (not full raw buffer).

### Summary Updates

| Setting | Options | Default |
|---------|---------|---------|
| `update_method` | `llm`, `heuristic` | `llm` |
| `refresh_policy` | `every_turn`, `threshold`, `periodic` | `threshold` |

### Threshold Policy (default)

Update summary only when pending raw content exceeds a token/turn threshold.

---

## `summary_buffer` Mode

Hybrid approach combining summary and recent turns.

### Storage

1. **Summary state** — compressed history
2. **Recent raw window** — configured by `window_turns` / `window_tokens`

### Overflow Handling

When the raw window overflows, overflow content is summarized into the summary state.

### Update Timing

| Setting | Options | Recommended Default |
|---------|---------|---------------------|
| `update_timing` | `after_turn`, `async_post_turn` | varies |

**Recommendations:**
- Interactive streaming → `async_post_turn` (non-blocking)
- Blocking mode → `after_turn` (synchronous)

---

## Configuration Example

```json
{
  "conversation": {
    "mode": "summary_buffer",
    "summary": {
      "update_method": "llm",
      "refresh_policy": "threshold",
      "update_timing": "async_post_turn"
    },
    "summary_buffer": {
      "window_turns": 10,
      "window_tokens": 2000
    }
  }
}
```

> **Note:** `window_turns` and `window_tokens` must be nested under `summary_buffer`, not at the top level of `conversation`.

---

## See Also

- [Usage Guide](usage.md) — main workflow overview
- [Blueprint Fields](blueprint-fields.md) — schema reference
- [Adapter Behaviors](adapter-behaviors.md) — entrypoint runtime details

