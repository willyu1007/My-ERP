# Debug Mode — Templates

This folder contains copy/paste friendly templates. Use them only when relevant.

## 1) Marker block template
```text
DEBUG-MODE: BEGIN <run_id>
<debug-only code changes here>
DEBUG-MODE: END <run_id>
```

## 2) Log line template (string logging)
```text
logger.info("[DBG:<run_id>] event=<event> key1=%s key2=%d", value1, value2)
```

## 3) Log line template (structured logging)
```json
{
  "level": "info",
  "run_id": "<run_id>",
  "event": "<event>",
  "component": "<component>",
  "branch": "<branch>",
  "timing_ms": 123,
  "note": "avoid logging secrets"
}
```

## 4) Approval block template (Gate 1)
```text
[APPROVAL REQUIRED — INSTRUMENTATION PLAN]
run_id: <run_id>
...
Type "APPROVE INSTRUMENTATION" to proceed, or "STOP" to terminate.
```

## 5) Approval block template (Gate 2)
```text
[APPROVAL REQUIRED — FIX PLAN]
...
Type "APPROVE FIX" to apply the fix, or "STOP" to terminate.
```

## 6) Journal entry templates
See: `journal_entry_templates.md`
