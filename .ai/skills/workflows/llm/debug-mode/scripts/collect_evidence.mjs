#!/usr/bin/env node
/* eslint-disable no-console */

import path from "node:path";
import { fileURLToPath } from 'node:url';

function stripAnsi(text) {
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-?]*[ -/]*[@-~]/g,
    "",
  );
}

function toLines(text) {
  if (!text) return [];
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRunIdMatchers(runId) {
  const id = escapeRegex(runId);
  const value = `(?:\"${id}\"|'${id}'|${id})`;
  const valueQuoted = `(?:\"${id}\"|'${id}')`;

  return [
    { kind: "dbg_tag", re: new RegExp(`\\[DBG:${id}\\]`) },
    { kind: "kv_run_id_equals", re: new RegExp(`\\brun_id\\s*=\\s*${value}(?![\\w-])`) },
    { kind: "kv_run_id_colon", re: new RegExp(`\\brun_id\\s*:\\s*${value}(?![\\w-])`) },
    { kind: "json_run_id", re: new RegExp(`[\"']run_id[\"']\\s*:\\s*${valueQuoted}`) },
  ];
}

function truncateLines(lines, maxLines, maxBytes) {
  const safeMaxLines =
    typeof maxLines === "number" && Number.isFinite(maxLines) ? maxLines : Infinity;
  const safeMaxBytes =
    typeof maxBytes === "number" && Number.isFinite(maxBytes) ? maxBytes : Infinity;

  const included = [];
  let includedBytes = 0;
  for (const line of lines) {
    if (included.length + 1 > safeMaxLines) {
      return {
        lines: included,
        truncated: true,
        reason: "line_budget_exceeded",
      };
    }

    const nextText = included.length === 0 ? String(line) : `\n${line}`;
    const nextBytes = byteLength(nextText);
    if (includedBytes + nextBytes > safeMaxBytes) {
      return {
        lines: included,
        truncated: true,
        reason: "byte_budget_exceeded",
      };
    }

    included.push(String(line));
    includedBytes += nextBytes;
  }

  return { lines: included, truncated: false, reason: null };
}

function findRunIdHits(lines, runId) {
  const hits = [];
  const matchers = buildRunIdMatchers(runId);
  const kindCounts = {};

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    for (const matcher of matchers) {
      if (matcher.re.test(line)) {
        hits.push(idx);
        kindCounts[matcher.kind] = (kindCounts[matcher.kind] ?? 0) + 1;
        break;
      }
    }
  }

  return { hits, kindCounts };
}

function mergeWindows(windows) {
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const merged = [];

  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...w });
      continue;
    }
    if (w.start <= last.end + 1) {
      last.end = Math.max(last.end, w.end);
      continue;
    }
    merged.push({ ...w });
  }

  const windowsMerged = merged.length !== windows.length;
  return { merged, windowsMerged };
}

function extractRunIdEvidence(lines, hitIndices, opts) {
  const before = opts.hit_window_before ?? 3;
  const after = opts.hit_window_after ?? 15;

  const windows = hitIndices.map((hit) => ({
    start: Math.max(0, hit - before),
    end: Math.min(lines.length - 1, hit + after),
  }));

  const { merged, windowsMerged } = mergeWindows(windows);
  return { windows: merged, windowsMerged };
}

function findFailureBlock(lines, failureSignals) {
  const signals = Array.isArray(failureSignals) && failureSignals.length > 0
    ? failureSignals
    : ["FAIL", "ERROR", "Exception", "Traceback", "panic", "Unhandled", "AssertionError"];

  const loweredSignals = signals.map((s) => String(s).toLowerCase());

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const lineLower = lines[i].toLowerCase();
    for (let j = 0; j < loweredSignals.length; j += 1) {
      if (lineLower.includes(loweredSignals[j])) {
        return { present: true, signal: signals[j], startIndex: i };
      }
    }
  }

  return { present: false, signal: null, startIndex: null };
}

function suggestDbgSrc(terminalName) {
  if (!terminalName) return null;
  const s = String(terminalName).toLowerCase();
  if (s.includes("backend") || s.includes("api") || s.includes("server")) return "backend";
  if (s.includes("frontend") || s.includes("vite") || s.includes("next")) return "frontend";
  if (s.includes("expo")) return "expo";
  if (s.includes("worker")) return "worker";
  if (s.includes("otel") || s.includes("opentelemetry")) return "otel";
  return null;
}

export function collectEvidence(input) {
  const runId = input?.run_id;
  if (!runId || typeof runId !== "string") {
    throw new Error("Invalid input: run_id (string) is required");
  }

  const terminalKey =
    input?.terminal_key ?? input?.terminal_id ?? input?.terminal_name ?? null;
  const terminalName = input?.terminal_name ?? null;
  const collectionLines =
    typeof input?.collection_lines === "number" ? input.collection_lines : null;

  const options = input?.options ?? {};
  const stripAnsiEnabled = options.strip_ansi !== false;

  const rawText = typeof input?.raw_output === "string" ? input.raw_output : "";
  const rawLines = toLines(rawText);
  const normalizedLines = stripAnsiEnabled ? rawLines.map(stripAnsi) : rawLines;

  const notes = [];
  notes.push(`lines_total=${normalizedLines.length}`);

  const runIdHitResult = findRunIdHits(normalizedLines, runId);
  const hits = runIdHitResult.hits;
  const hasRunId = hits.length > 0;
  notes.push(`run_id_hits=${hits.length}`);

  const maxEvidenceLines = options.max_evidence_lines ?? 150;
  const maxEvidenceBytes = options.max_evidence_bytes ?? 8192;

  let remainingLines = maxEvidenceLines;
  let remainingBytes = maxEvidenceBytes;

  const runIdEvidence = [];
  let truncated = false;
  let truncationReason = null;

  let windowsMerged = false;
  if (hasRunId) {
    const { windows, windowsMerged: didMerge } = extractRunIdEvidence(
      normalizedLines,
      hits,
      options,
    );
    windowsMerged = didMerge;
    notes.push(`run_id_windows=${windows.length}`);

    for (const w of windows) {
      const windowLines = normalizedLines.slice(w.start, w.end + 1);
      const t = truncateLines(windowLines, remainingLines, remainingBytes);

      const includedLines = t.lines;
      if (includedLines.length === 0) {
        if (!truncated) {
          truncated = true;
          truncationReason = t.reason ?? "line_budget_exceeded";
        }
        notes.push("run_id_window_omitted_due_to_budget");
        break;
      }

      const text = includedLines.join("\n");
      runIdEvidence.push({
        start_line: w.start + 1,
        end_line: w.start + includedLines.length,
        text,
      });

      remainingLines -= includedLines.length;
      remainingBytes -= byteLength(text);

      if (t.truncated) {
        truncated = true;
        truncationReason = truncationReason ?? t.reason;
        notes.push(`run_id_window_truncated_reason=${t.reason}`);
        break;
      }

      if (remainingLines <= 0 || remainingBytes <= 0) break;
    }
  }

  const failure = findFailureBlock(normalizedLines, options.failure_signals);
  let failureText = null;

  if (failure.present) {
    notes.push(`failure_signal=${failure.signal}`);
    const failureLines = normalizedLines.slice(failure.startIndex);
    const t = truncateLines(failureLines, remainingLines, remainingBytes);

    if (t.lines.length > 0) {
      failureText = t.lines.join("\n");
      remainingLines -= t.lines.length;
      remainingBytes -= byteLength(failureText);
    } else {
      failureText = null;
      notes.push("failure_block_omitted_due_to_budget");
    }

    if (t.truncated) {
      truncated = true;
      truncationReason = truncationReason ?? t.reason;
      notes.push(`failure_block_truncated_reason=${t.reason}`);
    }
  }

  return {
    run_id: runId,
    terminal_key: terminalKey,
    terminal_name: terminalName,
    collection_lines: collectionLines,

    run_id_hit_count: hits.length,
    run_id_evidence: runIdEvidence,

    failure_evidence: {
      present: failure.present,
      signal: failure.signal,
      text: failureText,
    },

    suggested_dbg_src: suggestDbgSrc(terminalName ?? terminalKey),
    truncated,
    truncation_reason: truncated ? truncationReason : null,

    diagnostics: {
      has_run_id: hasRunId,
      has_failure_block: failure.present,
      windows_merged: windowsMerged,
      ansi_stripped: stripAnsiEnabled,
      run_id_hit_kind_counts: runIdHitResult.kindCounts,
      notes,
    },
  };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.resume();
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "collect_evidence.mjs",
        "",
        "Reads JSON from stdin and writes evidence JSON to stdout.",
        "",
        "Examples:",
        "  # from repo root",
        "  node .ai/skills/workflows/llm/debug-mode/scripts/collect_evidence.mjs < input.json",
        "  # if cwd is .ai/skills/workflows/llm/debug-mode",
        "  node scripts/collect_evidence.mjs < input.json",
        "",
        "Run tests:",
        "  node --test .ai/skills/workflows/llm/debug-mode/scripts/collect_evidence.test.mjs",
      ].join("\n"),
    );
    return;
  }

  const stdin = await readStdin();
  const trimmed = stdin.trim();
  if (!trimmed) {
    throw new Error("No input received on stdin");
  }

  let input;
  try {
    input = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`Failed to parse stdin JSON: ${err.message}`);
  }

  const output = collectEvidence(input);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

// ESM entry point check
const isMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exitCode = 1;
  });
}
