# Debug Mode — IDE Terminal Hook (Example)

Use this example when the bug is reproducible from an IDE-integrated terminal and terminal output can be collected automatically (Terminal Hook).

## User instructions (what to do)
- Run the repro in an IDE-integrated terminal (not an external terminal window).
- After reproduction, reply `DONE` immediately.
- Do not clear/close the terminal output after the run.
- If asked, tell me which terminal tab/name shows the output (preferred over pasting logs). Only paste logs as a last resort.

## Assistant flow (what to do)
1) Run Gate 1 as usual (hypotheses → instrumentation plan → approval).
2) After user reproduces and replies `DONE`, collect terminal output:
   - call the terminal listing tool (`list_terminals()`; Codex CLI: `mcp__terminal_hook__list_terminals`)
   - choose a `terminal_key`:
     - prefer terminal `id` when present
     - otherwise use terminal `name` (ask the user to rename terminals if names collide)
   - call the terminal output tool (`get_terminal_output(terminal_key, lines=N)`; Codex CLI: `mcp__terminal_hook__get_terminal_output`) progressively (`200 → 500 → 1000 → 2000`)
3) Extract evidence deterministically (do not paste raw tail):
   - follow `reference/terminal_evidence_collection.md`
   - optional: use `scripts/collect_evidence.mjs` for deterministic extraction (stdin JSON → stdout JSON)
4) If auto-collection fails:
   - follow progressive fallback (ask for terminal selection hints first, then minimal run_id-marked excerpts).

## Troubleshooting
- If Terminal Hook tools are unavailable, request only minimal pasted excerpts filtered by the run_id marker + small context.
- If you only have terminal names and multiple terminals share the same name, ask the user to rename terminals to unique names (e.g., `backend`, `frontend`).
- Do not write terminal collection attempt metadata into `.ai/.tmp/<task_id>/journal.md`.
- A stable `Terminal map` line in Rolling Summary is allowed (see `reference/journal_policy.md`); do not store per-attempt collection details.
