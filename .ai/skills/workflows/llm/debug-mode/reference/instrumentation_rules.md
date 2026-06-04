# Debug Mode — Instrumentation Rules

## Purpose
Provide a consistent, low-risk, and **removable** instrumentation strategy for `debug-mode`.

## Non-negotiables
- All debug-only changes MUST be wrapped with:
  - `DEBUG-MODE: BEGIN <run_id>`
  - `DEBUG-MODE: END <run_id>`
- Every debug log line MUST include:
  - `[DBG:<run_id>]` (or a structured field with the same run_id)

When using structured logging:
- Prefer the field name `run_id` (exact) so it can be matched deterministically.
- SHOULD also include `[DBG:<run_id>]` in the human-readable message when feasible (easier grepping / copy-paste fallback).

See `reference/terminal_evidence_collection.md` for supported run_id marker formats used during evidence extraction.
- Instrumentation must be **minimal**, **targeted**, and **reversible**.

## Run ID
- One `run_id` per debug iteration.
- Recommended format: `dbg-YYYYMMDD-HHMMSS-<4hex>`
- The `run_id` appears in:
  - code block markers,
  - every debug log line,
  - user-facing instructions (filtering and log collection).

## Logging schema (recommended)
Prefer structured logging if available. At minimum, capture:

- `run_id`: `<run_id>`
- `event`: short, stable label (e.g., `auth.token_refresh.start`)
- `path`: function / module / route identifier
- `branch`: which decision path was taken
- `state`: state machine node (if applicable)
- `timing_ms`: durations or timestamps as needed
- `ids`: correlation identifiers (request_id, user_id *hashed*, session_id)
- `error`: error name/code and stack trace (redacted as needed)

### Example (generic)
```
DEBUG-MODE: BEGIN dbg-20260115-101530-a1b2
logger.info("[DBG:dbg-20260115-101530-a1b2] event=checkout.submit.start cart_items=%d", cart.items.length)
DEBUG-MODE: END dbg-20260115-101530-a1b2
```

## Avoid changing behavior (especially for race/timing issues)
Instrumentation can accidentally “fix” timing bugs by slowing the system down.

Mitigations (use as needed):
- Prefer **buffered** logging over synchronous I/O.
- Avoid logging inside tight loops; use sampling or counters.
- Log **boundaries** (state transitions, request start/end), not every step.
- For hot paths, guard logs behind a `debugEnabled` flag or a rare conditional.
- If timing is the problem, record **timestamps** and ordering signals, not high-volume payloads.

## What not to log
Do NOT log:
- passwords, tokens, API keys, private keys,
- full request/response bodies by default,
- full PII (email, phone, addresses) unless truly necessary.

If you must identify a user/session, log a **stable hash** instead of the raw value.

See `privacy_redaction.md` for patterns.

## Instrumentation placement heuristics
Instrument where evidence has the highest information gain:

- Entry/exit points of suspected functions
- State transitions (before/after)
- Error boundaries / exception handlers
- External calls: network requests, DB queries, filesystem operations
- Concurrency boundaries: locks, queues, async boundaries, callbacks

## Redaction / minimization defaults
- Prefer boolean “is_present” markers over printing the sensitive value:
  - `token_present=true` instead of logging a token.
- Prefer lengths and types:
  - `payload_bytes=...`, `items_count=...`

## Cleanup requirement
After verification or termination:
- Remove every `DEBUG-MODE` block.
- Confirm cleanup by searching for:
  - `DEBUG-MODE: BEGIN`
  - `DEBUG-MODE: END`
  - `[DBG:`
See `cleanup_policy.md` for a step-by-step checklist.
