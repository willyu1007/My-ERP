import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { collectEvidence } from "./collect_evidence.mjs";

const DEBUG_MODE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("extracts merged run_id windows with defaults", () => {
  const runId = "R2026-01-19-001";
  const lines = [
    "noise 1",
    "noise 2",
    `[DBG:${runId}] hit a`,
    "ctx 1",
    "ctx 2",
    `[DBG:${runId}] hit b`,
    "tail 1",
  ].join("\n");

  const out = collectEvidence({
    run_id: runId,
    terminal_name: "backend",
    collection_lines: 200,
    raw_output: lines,
    options: { hit_window_before: 1, hit_window_after: 1, max_evidence_lines: 50, max_evidence_bytes: 8192 },
  });

  assert.equal(out.run_id_hit_count, 2);
  assert.equal(out.run_id_evidence.length, 1, "windows should merge due to overlap/adjacency");
  assert.match(out.run_id_evidence[0].text, /\[DBG:R2026-01-19-001\] hit a/);
  assert.match(out.run_id_evidence[0].text, /\[DBG:R2026-01-19-001\] hit b/);
  assert.equal(out.failure_evidence.present, false);
  assert.equal(out.truncated, false);
});

test("CLI runs from the skill directory (relative path)", () => {
  const runId = "dbg-cli-0001";
  const proc = spawnSync(
    process.execPath,
    ["scripts/collect_evidence.mjs"],
    {
      cwd: DEBUG_MODE_DIR,
      input: JSON.stringify({ run_id: runId, raw_output: `[DBG:${runId}] hello` }),
      encoding: "utf8",
    },
  );

  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stdout, new RegExp(`\"run_id\"\\s*:\\s*\"${runId}\"`));
});

test("extracts failure block when run_id is absent", () => {
  const out = collectEvidence({
    run_id: "dbg-irrelevant",
    terminal_name: "tests",
    collection_lines: 200,
    raw_output: ["ok", "still ok", "AssertionError: nope", "  at file.js:10:2"].join("\n"),
    options: { failure_signals: ["AssertionError"], max_evidence_lines: 50, max_evidence_bytes: 8192 },
  });

  assert.equal(out.run_id_hit_count, 0);
  assert.equal(out.failure_evidence.present, true);
  assert.equal(out.failure_evidence.signal, "AssertionError");
  assert.match(out.failure_evidence.text, /AssertionError: nope/);
});

test("matches structured run_id markers (kv and json)", () => {
  const runId = "dbg-20260119-0000-a1b2";
  const out = collectEvidence({
    run_id: runId,
    terminal_name: "backend",
    raw_output: [
      "noise",
      `run_id=${runId} event=foo`,
      `{\"level\":\"info\",\"run_id\":\"${runId}\",\"msg\":\"bar\"}`,
      `run_id: \"${runId}\" step=3`,
      "tail",
    ].join("\n"),
    options: { hit_window_before: 0, hit_window_after: 0, max_evidence_lines: 50, max_evidence_bytes: 8192 },
  });

  assert.equal(out.run_id_hit_count, 3);
  assert.equal(out.run_id_evidence.length, 1);
  assert.match(out.run_id_evidence[0].text, /run_id=dbg-20260119-0000-a1b2/);
  assert.match(out.run_id_evidence[0].text, /\"run_id\":\"dbg-20260119-0000-a1b2\"/);
  assert.match(out.run_id_evidence[0].text, /run_id: \"dbg-20260119-0000-a1b2\"/);
});

test("strips ANSI by default so failure signals are detectable", () => {
  const out = collectEvidence({
    run_id: "dbg-irrelevant",
    terminal_name: "tests",
    raw_output: ["ok", "\u001b[31mERROR\u001b[0m boom", "details"].join("\n"),
    options: { failure_signals: ["ERROR"], max_evidence_lines: 50, max_evidence_bytes: 8192 },
  });

  assert.equal(out.failure_evidence.present, true);
  assert.equal(out.failure_evidence.signal, "ERROR");
  assert.match(out.failure_evidence.text, /ERROR boom/);
});

test("enforces evidence budgets and sets truncation fields", () => {
  const runId = "R2026-01-19-002";
  const longLines = Array.from({ length: 100 }, (_, i) =>
    i === 10 ? `[DBG:${runId}] hit` : `line ${i}`,
  ).join("\n");

  const out = collectEvidence({
    run_id: runId,
    terminal_name: "backend",
    raw_output: longLines,
    options: { hit_window_before: 50, hit_window_after: 50, max_evidence_lines: 10, max_evidence_bytes: 8192 },
  });

  assert.equal(out.run_id_hit_count, 1);
  assert.equal(out.truncated, true);
  assert.equal(out.truncation_reason, "line_budget_exceeded");
  assert.ok(out.run_id_evidence[0].text.split("\n").length <= 10);
});
