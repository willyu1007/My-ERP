# Example — Web: Browser Console & Network Panel

## When to use this example
Use when the issue occurs in a browser (frontend web app) and involves:
- UI state bugs,
- network/API failures,
- authentication/session issues,
- performance regressions.

## Evidence sources
Ask for:
- browser console logs (including stack traces),
- network requests around reproduction (status codes, timing, payload *metadata*),
- screenshots/recordings for UI issues,
- browser version + OS, and whether extensions/ad-blockers are involved.

## Debug-mode instrumentation
- Add `[DBG:<run_id>]` tagged logs around:
  - event handlers,
  - state transitions (reducers/stores),
  - API call start/end, status code, durations,
  - feature flag branches.

Avoid dumping full payloads. Prefer counts, types, and safe identifiers.

## Reproduction steps
Ask for:
- exact URL and navigation path,
- login state (fresh session vs existing),
- whether it reproduces in an incognito window,
- whether it reproduces with cache cleared.

## What to request back
- console logs filtered by `[DBG:<run_id>]`,
- a short export/screenshot of the relevant network requests (redacted).
