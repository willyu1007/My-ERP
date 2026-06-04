# Debug Mode — Journal Policy

## Purpose
Preserve an auditable **evidence → decision → result** trail across iterations and sessions, and reduce repeated work by remembering what has already been tried.

## Default path
- `.ai/.tmp/<task_id>/journal.md` (append-only)
- `.ai/.tmp/` is intended for temporary artifacts and is typically gitignored.

## `task_id` resolution
Use the first available:
1. Environment/platform task identifier (if provided by the runtime)
2. User-provided task id (ticket/issue id, etc.)
3. Fallback: `session-YYYYMMDD-HHMMSS` (UTC) — explicitly disclose that a fallback is being used

## `task_id` normalization (path-safe)
The `task_id` becomes part of a directory name on disk. If the chosen `task_id` contains path-unsafe characters:
- sanitize it to a safe slug (kebab-case recommended)
- explicitly disclose the sanitized value you are using

Minimum rule set:
- replace whitespace with `-`
- replace path separators or Windows-forbidden characters (`<`, `>`, `:`, `"`, `/`, `\\`, `|`, `?`, `*`) with `-`
- collapse repeated `-` and trim leading/trailing `-`
- if the result is empty, use the fallback `session-YYYYMMDD-HHMMSS`

## Progressive disclosure (read rules)
Read journal context **only at the start of a new iteration** (before generating hypotheses), and load:
- Rolling Summary (if present)
- The last 1–3 entries (default: 2; increase to 3 for intermittent or multi-component issues)

Do not load or quote the full journal unless:
- the user explicitly requests a full recap, or
- the last entries are missing critical context.

## Write rules (append-only)
Append a record in these cases:
1. **After each verification attempt** (pass/fail/inconclusive), even if no fix was applied.
2. **After each instrumentation-only run** that produced new evidence (even before a fix).
3. **On user termination**: write a Termination Record.
4. **On verified resolution**: write a Resolution Record that includes cleanup confirmation.

Journal writing must **not** bypass Gate 1/Gate 2 and is not a behavior-changing fix.

## File structure
- A small header written once (created timestamp, workspace, owner, default verification threshold, optional rolling summary)
- Append-only entries separated by `---`

Use copy/paste templates from:
- `templates/journal_entry_templates.md`

## Iteration Record schema
- Iteration number + `run_id` + timestamp (ISO8601 UTC)
- Context: expected/actual, repro frequency, environment deltas
- Hypotheses: `[kept]`, `[ruled out]`, `[new]` with evidence pointers
- Instrumentation: approval status, markers used, log tag, locations (`path:line` + intent + fields)
- Evidence: steps, evidence summary (<= 8 bullets), log excerpts (<= 10 lines, redacted)
- Fix (only if applied): approval, change summary, risk notes, patch reference
- Verification: result + pass count toward threshold, failure signature if fail
- Decision: next step + rationale

## Resolution Record (minimum fields)
- Root cause and fix summary
- Verification result (including pass count toward threshold)
- Cleanup confirmation (include run_id list that was removed)

## Failure handling
- If the journal cannot be created or written (permissions, missing workspace, tool limitations):
  - continue the debugging workflow
  - emit the record in-chat under `## Iteration Record (Journal Write Failed)`
- If the user opts out (“no journal” / “keep in chat”):
  - do not write to disk; emit records in-chat only

## Privacy & minimization
Follow `reference/privacy_redaction.md`:
- Never store secrets/PII
- Never paste raw/full logs (store short redacted excerpts only)
- Replace secrets with `***REDACTED***`
- Use stable placeholders when needed for correlation:
  - `<email:user1>`, `<phone:user1>`
- MAY store a stable `Terminal map` line in Rolling Summary (example: `backend=<terminal_key>`) to reduce repeated terminal scans. Do not store per-attempt collection metadata.

## Journal growth (optional compaction)
If the journal becomes noisy (example thresholds: 200 KB or 400 lines):
- Append a Compaction Record summarizing older iterations into 10–15 bullets
- Keep only the last 10 iterations in full detail (optional; only if needed)
