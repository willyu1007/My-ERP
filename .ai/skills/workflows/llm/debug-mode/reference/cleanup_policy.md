# Debug Mode — Cleanup Policy

## Purpose
Ensure the codebase is left in a clean, maintainable state after debugging:
- no leftover debug logs,
- no leftover conditional debug flags,
- no “temporary” instrumentation committed by accident.

## When cleanup happens
Cleanup is mandatory in two cases:
1) **After verified success** (before final handoff).
2) **On user termination** ("STOP") if any debug-only changes were introduced.

## Cleanup checklist (must complete)
1) Identify all `run_id`s used in the session.
2) Remove all blocks marked with:
   - `DEBUG-MODE: BEGIN <run_id>`
   - `DEBUG-MODE: END <run_id>`
3) Remove any debug-only:
   - global flags / env toggles added just for this investigation,
   - counters/samplers introduced only for debugging,
   - commented-out alternate code paths.
4) Search the repo to confirm no leftovers:
   - `DEBUG-MODE: BEGIN`
   - `DEBUG-MODE: END`
   - `[DBG:`
   - Note: if the project used structured `run_id` fields and messages do not contain `[DBG:...]`, cleanup relies on removing the `DEBUG-MODE: BEGIN/END` blocks. Do not grep `run_id` across the repo (avoid false positives).
5) Re-run the minimal validation commands (if available):
   - build / lint / unit tests (or at least the relevant module tests).
6) Final review:
   - ensure error handling and logs remain sensible (no missing imports, no unused vars),
   - ensure removal did not reintroduce the bug (quick sanity repro if feasible).

## If the user stops mid-stream
If the user terminates while instrumentation exists:
- Provide exact file paths and markers to remove.
- Suggest a low-risk “revert instrumentation” patch.
- Provide a log snippet showing the last useful evidence collected.

## Optional: retain long-term observability (only if explicitly desired)
Sometimes a subset of instrumentation should become permanent (e.g., a new metric for regression detection).

This is NOT the default. If proposed:
- treat it as a product/ops decision,
- ensure the permanent signal is low-volume and privacy-safe,
- remove the `DEBUG-MODE` markers and convert to standard logging/metrics conventions.
