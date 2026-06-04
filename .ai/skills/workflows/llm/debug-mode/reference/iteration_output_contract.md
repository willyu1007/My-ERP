# Debug Mode — Iteration Output Contract

## Purpose
Make each debug iteration **auditable**, **repeatable**, and **easy to hand off**.

Every `debug-mode` response must follow a stable structure so humans can quickly answer:
- What are we trying to prove?
- What evidence did we get?
- What changed in the code?
- What do we do next?

## Required header (every response)
- **Status**: one of
  - Intake
  - Awaiting Gate 1 (Instrumentation)
  - Instrumented
  - Awaiting Logs
  - Awaiting Gate 2 (Fix)
  - Fix Applied
  - Verifying
  - Cleanup
  - Terminated
- **run_id**: `<run_id>` (or `n/a` during initial Intake)
- **task_id**: `<task_id>` (path-safe; or `n/a` during initial Intake)
- **journal**: `.ai/.tmp/<task_id>/journal.md` (or `chat-only` if user opted out or file writes failed)

## Journal context block (start of each iteration)
At the start of a new iteration (before hypotheses), read only:
- Rolling Summary (if present)
- The last 1–3 entries (default: 2)

Then include a short “Journal context” block:
- last `run_id` and last outcome
- hypotheses/instrumentation already ruled out (avoid repetition)
- pass count toward verification threshold (if applicable)

## Hypotheses block (every response after Intake)
List 3–6 hypotheses. Each must be marked:
- ✅ Supported
- ❌ Ruled out
- ❓ Uncertain

Each hypothesis must include:
- expected observable signal,
- where we instrumented or will instrument,
- the deciding evidence (when available).

## Evidence block
- Include key signal summaries and **verbatim log excerpts** (short; avoid sensitive content).
- Always include enough context to justify a decision (e.g., timestamps, ordering, errors, branch markers).

## Changes block
When instrumentation or fixes were applied:
- File path
- Exact location (function/class)
- What changed and why
- Markers used (BEGIN/END + [DBG:<run_id>])

If you cannot edit code directly, provide a patch-like snippet the user can copy.

## Next action block
Precisely state:
- what the user must do next (step-by-step),
- what to reply/confirm back (e.g., `DONE` after a repro run),
- what to paste back only if requested (run_id-filtered excerpts, screenshots, etc.; prefer Terminal Hook auto-collection when available),
- acceptance criteria for the next checkpoint.

## Iteration Record (Journal)
When an iteration produces new evidence or a verification attempt completes:
- Append an Iteration Record to `.ai/.tmp/<task_id>/journal.md` (see `reference/journal_policy.md`).
- Report journal write status in the response:
  - `Journal: wrote entry to .ai/.tmp/<task_id>/journal.md`
  - or `Journal: write failed (entry included below)`
- If write failed, include the entry in-chat under:
  - `## Iteration Record (Journal Write Failed)`

## Approval blocks (when a gate is pending)
When a gate is pending, include the full block:

### Gate 1 — Instrumentation Plan
```
[APPROVAL REQUIRED — INSTRUMENTATION PLAN]
...
Type "APPROVE INSTRUMENTATION" to proceed, or "STOP" to terminate.
```

### Gate 2 — Fix Plan
```
[APPROVAL REQUIRED — FIX PLAN]
...
Type "APPROVE FIX" to apply the fix, or "STOP" to terminate.
```

No gate may be bypassed.

## Termination output (mandatory on STOP)
If the user stops:
- Summarize current best root-cause hypothesis and confidence.
- Provide a cleanup checklist (remove any inserted debug code).
- Provide recommended next evidence to collect if debugging resumes later.
- Write a Termination Record to the journal (or in-chat if journal write fails).

## Resolution output (when verified)
When the fix is verified:
- Write a Resolution Record that includes pass count and cleanup confirmation.
