# Example — Backend (Python)

## When to use this example
Use when debugging Python services, scripts, workers, or data pipelines.

## Evidence sources
- application logs (structured if available),
- exception tracebacks (full stack),
- timing/latency measurements around critical sections,
- resource usage snapshots (for memory/perf issues), if available.

## Instrumentation guidance
- Use the project’s existing logger (`logging`, structured logger, etc.).
- Wrap debug-only changes with `DEBUG-MODE: BEGIN/END <run_id>`.
- Tag every debug log with `[DBG:<run_id>]`.

Good targets:
- boundaries between stages (pipeline step start/end),
- external calls (DB/API/filesystem),
- parsing/validation steps where data shape may differ.

## What to request back
- `[DBG:<run_id>]`-filtered logs,
- the traceback (if any),
- the exact command used to run the code and the environment (Python version, dependencies).
