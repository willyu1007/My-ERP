# Debug Mode — Terminal Evidence Collection (Terminal Hook)

## Purpose
Reduce manual copy/paste by collecting IDE terminal output (when available) and extracting **minimal, deterministic evidence** for analysis.

The reference describes:
- how to probe tool availability,
- how to choose terminals,
- how to progressively expand collection,
- how to extract evidence with strict budgets,
- how to fall back when automatic collection fails.

## Non-goals
- Do not add or require new MCP servers.
- Do not paste raw/full terminal tails into chat or journal.
- Do not store terminal collection attempt metadata in `.ai/.tmp/<task_id>/journal.md` (only keep outcome + short excerpts per existing journal policy). A stable `Terminal map` in Rolling Summary is allowed (see `reference/journal_policy.md`).

## Terminology
- `terminal_key`: the identifier used to fetch output. Use the value returned by `list_terminals()` that can be passed to `get_terminal_output(...)`.
  - Prefer a stable unique id when present (e.g., `terminal.id`).
  - Otherwise use `terminal.name` and ensure the name is unique (rename terminals if needed).
  - Note: the tool parameter may be called `terminal_name`, but `get_terminal_output(...)` accepts the `terminal_key` value (name or id).
  - Retry rule (SHOULD): if `get_terminal_output(terminal_key, ...)` fails and the terminal has both `id` and `name`, retry once using the other field before falling back.
- `run_id`: the debug iteration id. The run_id may appear in logs as:
  - `[DBG:<run_id>]` (preferred), or
  - structured variants like `run_id=<run_id>` / `"run_id":"<run_id>"`.

## Tool name mapping (platform-specific)
This reference uses `list_terminals()` and `get_terminal_output(...)` as generic names. In tool-enabled environments, call the equivalent Terminal Hook tools exposed to you.

- Codex CLI (VS Code Terminal Hook MCP): `mcp__terminal_hook__list_terminals` and `mcp__terminal_hook__get_terminal_output`
- If your environment exposes different names, map accordingly and keep the same budgets/guardrails.

## Budgets (MUST)
- Broad scan (all terminals): default `lines=200`.
- Optional broad rescan: if terminal count is small and there are no candidates at `lines=200`, you MAY rescan all terminals once at `lines=500`.
- Candidate expansion (candidate terminals only): `lines = 500 → 1000 → 2000` (max 2000).
- Global pull guardrails (per iteration): if the next tool call would exceed either limit, stop and follow **Fallback A** (ask for terminal hint).
  - `terminals_fetched > 4`
  - `total_lines_fetched > 4000`
  - Definitions (deterministic):
    - `terminals_fetched`: number of unique terminals fetched via `get_terminal_output(...)` during the current iteration.
    - `total_lines_fetched`: sum of requested `lines=N` values across `get_terminal_output(...)` calls during the current iteration (count requests, not returned length).
- Evidence shown in chat (post-extraction, across all terminals combined): **<= 150 lines OR <= 8KB** (whichever limit hits first).
  - If using two terminals: allocate `primary <= 100 lines / 6KB`, `secondary <= 50 lines / 2KB` (do not exceed the global evidence budget).
- Journal excerpts remain governed by `reference/journal_policy.md` and `templates/journal_entry_templates.md` (short, redacted).

## Tool availability probe
1) Attempt to call the terminal listing tool (`list_terminals()`; Codex CLI: `mcp__terminal_hook__list_terminals`).
2) If the tool does not exist or the call fails, follow **Fallback B** (manual paste).

## Terminal selection
### Prefer known terminals first (optional)
If the journal Rolling Summary includes a `Terminal map` (example: `backend=<terminal_key>`), use it to fetch the most likely terminal(s) first and avoid broad scans.

### Default: scan terminals (terminal-level)
If you do not have a reliable terminal hint:
1) Enumerate terminals via `list_terminals()`.
2) If there are many terminals (rule of thumb: > 8), ask for a terminal hint before scanning (same questions as **Fallback A step 2**).
3) Otherwise, scan terminals at `lines=200` up to the global pull guardrails and mark a terminal as a candidate if its output contains:
   - a run_id marker (see “Run-id hit windows”), or
   - a failure signal (see “Failure block extraction”).
4) If you hit the global pull guardrails before finding a candidate, stop and ask for a terminal hint (same questions as **Fallback A step 2**).

### Candidate ranking & merging (deterministic)
If multiple terminals are candidates:
1) Rank candidates:
   - Prefer terminals with `run_id_hit_count > 0` (descending by hit count).
   - If none have run_id hits: prefer the terminal with the most recent failure signal near the tail (closest to the end), and the most readable/complete stacktrace within budget.
2) Default behavior: show evidence from **1 primary terminal** only.
3) Add a **secondary terminal** only if the primary evidence is insufficient to decide the next hypothesis/fix step.
4) Evidence budget split (hard cap):
   - primary: `<= 100 lines / 6KB`
   - secondary: `<= 50 lines / 2KB`
   - combined: still must satisfy `<= 150 lines OR <= 8KB`.

### If no candidates are found at `lines=200`
Choose one path (deterministic; do not do both in the same iteration):
- If terminal count is small and the global pull guardrails allow it: increase to `lines=500` and rescan all terminals once.
- Otherwise (preferred when there are many terminals): ask for a terminal hint (same questions as **Fallback A step 2**).

Do NOT expand all terminals beyond `lines=500` without a terminal hint. If you have candidates, only expand the candidate terminal(s).

### If candidates still not found
Follow **Fallback A** (progressive disclosure: ask for terminal selection hints before asking for pasted logs).

### Terminal name collisions (SHOULD handle)
If you only have terminal names and multiple terminals share the same name:
- Ask the user to rename terminals to unique names (e.g., `backend`, `frontend`, `worker`) and re-run collection.
- Prefer terminal ids when available.

## Evidence extraction (deterministic rules)
### Run-id hit windows (preferred)
If the run_id appears in any supported marker form, treat the matching line as a hit:
- `[DBG:<run_id>]`
- `run_id=<run_id>` (optionally quoted / spaced)
- `"run_id":"<run_id>"` (JSON-ish logs; spacing variants allowed)

Then:
- For each hit line, extract a context window:
  - `before = 3` lines
  - `after = 15` lines
- Merge overlapping/adjacent windows.
- Keep only merged windows, then enforce the evidence budget (<=150 lines or <=8KB).

### Failure block extraction (supplementary / fallback)
If a failure block is present:
- If there are run_id hits: you MAY include the most recent failure block **only if budget remains** (stacktraces are often decisive).
- If there are no run_id hits: the failure block becomes the primary evidence.

Extraction:
- Default failure signals (extend as needed):
  - `FAIL`, `ERROR`, `Exception`, `Traceback`, `panic`, `Unhandled`, `AssertionError`
- Strategy:
  1) Scan from the end backward to find the **most recent** failure signal.
  2) Extract starting at that signal line forward **until the end of the output or the evidence budget is reached**.
- Keep only one block (the most recent, most complete one).

### ANSI / noise (SHOULD)
Terminal output may include ANSI control characters. Prefer to strip or ignore them when extracting evidence, but do not over-engineer: correctness of extraction and budget enforcement matters more.

## Fallback logic (progressive disclosure)
### Fallback B — Terminal Hook unavailable
**Trigger**
- `list_terminals()` is missing or errors.

**Behavior**
Ask the user to paste the smallest possible excerpt:
1) First ask for logs filtered by the run_id marker plus a little context:
   - preferred: `[DBG:<run_id>]`
   - if structured logs: `run_id=<run_id>` or `"run_id":"<run_id>"`
2) If still insufficient, ask for the failure block/stacktrace excerpt.

### Fallback A — Terminal Hook available but collection didn’t find usable evidence
**Trigger**
- Tools work, but within the budgets/guardrails you still have no run_id marker hits and no useful failure block.

**Behavior**
Escalate in small steps:
1) Ask the user to reproduce once more, then reply `DONE` immediately (do not clear/close the terminal).
2) If still failing, ask the user for a terminal selection hint (preferred over logs):
   - which terminal tab/name shows the output,
   - what command was run in that terminal.
3) Only as a last resort, ask for pasted logs using the same minimal format as Fallback B.

## What to show in-chat (minimized)
- Prefer 1-2 short excerpts that directly support/deny hypotheses.
- Do not paste the raw tail. Always paste **post-extraction** evidence only.
- If you need to explain why a fallback was triggered, do so in 1 line without dumping metadata.

## Optional helper script (deterministic)
Optional: `scripts/collect_evidence.mjs` is a deterministic extractor (stdin JSON -> stdout JSON). The script does not call MCP tools and is safe to remove; the workflow still works using the rules above.

### Script contract (`scripts/collect_evidence.mjs`)
The script contract is intended for repo template reuse and to avoid “guessing” fields.

**Run**
- From repo root: `node .ai/skills/workflows/llm/debug-mode/scripts/collect_evidence.mjs < input.json`
- If cwd is `.ai/skills/workflows/llm/debug-mode`: `node scripts/collect_evidence.mjs < input.json`
- Run tests: `node --test .ai/skills/workflows/llm/debug-mode/scripts/collect_evidence.test.mjs`

**Input JSON**
- Required:
  - `run_id` (string)
- Optional:
  - `terminal_key` (string)
  - `terminal_id` (string) — fallback if `terminal_key` absent
  - `terminal_name` (string) — fallback if `terminal_key` and `terminal_id` absent
  - `collection_lines` (number) — how many lines were fetched
  - `raw_output` (string) — the terminal output text
  - `options` (object)
    - `hit_window_before` (number, default `3`)
    - `hit_window_after` (number, default `15`)
    - `max_evidence_lines` (number, default `150`)
    - `max_evidence_bytes` (number, default `8192`)
    - `failure_signals` (string[], default list in script)
    - `strip_ansi` (boolean, default `true`)

**Output JSON (selected fields)**
- `run_id` (string)
- `terminal_key` (string|null)
- `terminal_name` (string|null)
- `collection_lines` (number|null)
- `run_id_hit_count` (number)
- `run_id_evidence` ({ `start_line`, `end_line`, `text` }[])
- `failure_evidence` ({ `present`, `signal`, `text` })
- `suggested_dbg_src` (string|null) — heuristic only; does not define the required `dbg_src`
- `truncated` (boolean) and `truncation_reason` (string|null)
- `diagnostics` (object) — for debugging the extractor itself; do not journal verbatim
