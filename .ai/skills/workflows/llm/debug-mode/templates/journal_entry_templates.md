# Debug Mode — Journal Entry Templates

Use these templates for `.ai/.tmp/<task_id>/journal.md`.
Keep content minimal, redacted, and evidence-linked.

## Journal header (write once)
```md
# Debug Journal — <task_id>

- Created: <ISO8601 UTC timestamp>
- Workspace: <repo name or path if available>
- Owner: debug-mode skill
- Default Verification Threshold: 3 passes (user may continue or terminate anytime)

## Rolling Summary (optional, <= 12 lines)
- Problem: ...
- Current best root cause hypothesis: ...
- Status: Investigating | Fix Proposed | Fix Applied | Verified | Terminated
- Last run_id: ...
- Last outcome: ...
- Terminal map (optional): <dbg_src>=<terminal_key>, ...
```

## Iteration Record (full)
```md
---

## Iteration <n> — run_id: <run_id> — <ISO8601 UTC>

### Context
- Expected: ...
- Actual: ...
- Repro frequency: always | intermittent | unknown
- Environment deltas / recent changes: ...

### Hypotheses (with status)
- [kept] H1: ...
- [ruled out] H2: ... (evidence: ...)
- [new] H3: ...

### Instrumentation
- Approval: granted | not required (no code changes)
- Markers used: DEBUG-MODE: BEGIN/END <run_id>
- Log tag: [DBG:<run_id>]
- Locations:
  - `path/to/file.ext:line` — intent — fields captured

### Reproduction & Evidence
- Repro steps executed: 1,2,3...
- Evidence summary (<= 8 bullets):
  - ...
- Log excerpts (redacted, max 10 lines total):
  - ...

### Fix (only if applied)
- Approval: granted
- Change summary: ...
- Risk notes: ...
- Patch reference: <commit/branch/PR if available>

### Verification
- Result: pass | fail | inconclusive
- Pass count toward threshold: <k>/3
- If fail: observed failure signature: ...

### Decision
- Next step: add instrumentation | adjust hypotheses | propose fix | re-run verification | terminate
- Rationale: ...
```

## Iteration Record (minimal)
```md
---

## Iteration <n> — run_id: <run_id> — <ISO8601 UTC>

### Hypotheses
- [kept] ...
- [ruled out] ...

### Instrumentation
- Locations:
  - ...

### Evidence
- ...

### Fix
- ...

### Verification
- Result: pass | fail | inconclusive
- Pass count: <k>/3

### Decision
- Next step: ...
```

## Termination Record
```md
---

## Termination — <ISO8601 UTC>

- Reason for termination: user chose to stop | blocked by environment | cannot reproduce | other
- Current best hypothesis: ...
- What has been ruled out: ...
- Recommended next step if resumed: ...
- Cleanup required: remove DEBUG-MODE markers for run_ids: ...
```

## Resolution Record
```md
---

## Resolution — <ISO8601 UTC>

- Root cause: ...
- Fix summary: ...
- Verification: <k>/3 (and notes)
- Cleanup: completed (instrumentation removed) | pending (instructions included)
- Cleanup run_ids: <run_id_1>, <run_id_2>, ...
- Suggested regression guard: ...
```

## Compaction Record (optional)
```md
---

## Compaction — <ISO8601 UTC>

- Why: journal exceeded <threshold> (e.g., 200KB or 400 lines)
- Summary of earlier iterations (10–15 bullets):
  - ...
- Retained detail: last 10 iterations kept verbatim
```
