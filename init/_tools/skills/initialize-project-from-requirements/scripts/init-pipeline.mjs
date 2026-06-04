#!/usr/bin/env node
/**
 * init-pipeline.mjs
 *
 * Dependency-free helper for a 3-stage, verifiable init pipeline:
 *
 *   Stage A: requirements docs under `init/_work/stage-a-docs/` (optional: archive via cleanup-init --archive)
 *   Stage B: blueprint JSON at `init/_work/project-blueprint.json` (optional: archive via cleanup-init --archive)
 *   Stage C: minimal scaffold + skill pack manifest update + wrapper sync
 *
 * Commands:
 *   - start          Initialize state file and show next steps
 *   - repair         Restore missing init artifacts (copy-if-missing)
 *   - status         Show current initialization progress
 *   - set-llm-language Set user-facing docs language (llm.language)
 *   - advance        Print the next checkpoint actions for the current stage
 *   - approve        Record explicit user approval and advance to the next stage
 *   - validate       Validate a blueprint JSON (no writes)
 *   - check-docs     Validate Stage A docs (structure + template placeholders)
 *   - mark-must-ask  Update Stage A must-ask checklist state
 *   - review-packs   Mark Stage B packs review as completed
 *   - skill-retention Confirm skill retention and (optional) delete skills
 *   - suggest-packs  Recommend skill packs from blueprint capabilities (warn-only by default)
 *   - suggest-features Recommend features from blueprint capabilities
 *   - scaffold       Plan or apply a minimal directory scaffold from the blueprint
 *   - update-root-docs Preview/apply README.md + AGENTS.md updates from blueprint
 *   - apply          validate + (optional) check-docs + scaffold + configs + pack enable + wrapper sync
 *   - cleanup-init   Remove the `init/` bootstrap kit (opt-in, guarded)
 *
 * This script is intentionally framework-agnostic. It avoids generating code.
 *
 * ============================================================================
 * CODE STRUCTURE (line numbers are approximate, may shift after edits)
 * ============================================================================
 *
 * Section                              | Lines (approx) | Description
 * -------------------------------------|----------------|----------------------------------
 * Imports & Constants                  |    60-68       | fs, path, childProcess, etc.
 * Output Mode Helpers                  |    69-133      | JSON/text output formatting
 * CLI Helpers                          |   135-383      | usage(), parseArgs(), utilities
 * State Management                     |   385-640      | loadState(), saveState(), progress
 * START-HERE + INIT-BOARD              |   642-1297     | Entry docs (LLM) + board snapshot update
 * Config File Generation               |  1299-1343     | generateConfigFiles() wrapper
 * Blueprint Validation & Recommend     |  1344-2351     | validateBlueprint(), suggest*()
 * DB SSOT Helpers                      |  2353-2550     | DB schema SSOT mode utilities
 * Feature Detection                    |  2552-2600     | is*Enabled() functions
 * Feature Materialization              |  2602-3448     | ensureFeature(), template copy, ctl
 * Command Handlers (CLI entry)         |  3450-4578     | start, repair, status, apply, etc.
 *
 * Key functions by command:
 *   start           -> createInitialState(), saveState()
 *   status          -> printStatus(), getStageProgress()
 *   advance         -> computeNextStepsForStartHere()
 *   approve         -> loadState(), saveState(), addHistoryEvent()
 *   validate        -> validateBlueprint()
 *   check-docs      -> stageADocTemplateSpecs(), placeholder checks
 *   apply           -> generateConfigFiles(), ensureFeature*(), syncWrappers()
 *   cleanup-init    -> cleanupInit(), archive logic
 */

import fs from 'fs';
import path from 'path';
import childProcess from 'child_process';
import { fileURLToPath } from 'url';
import util from 'util';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Output mode helpers (text vs json)
// ============================================================================

let OUTPUT_FORMAT = 'text';

function setOutputFormat(format) {
  const f = String(format || 'text').toLowerCase();
  OUTPUT_FORMAT = f === 'json' ? 'json' : 'text';
  return OUTPUT_FORMAT;
}

function isJsonFormat() {
  return OUTPUT_FORMAT === 'json';
}

function writeStdout(str) {
  process.stdout.write(String(str));
}

function writeStderr(str) {
  process.stderr.write(String(str));
}

function printJson(obj) {
  writeStdout(JSON.stringify(obj, null, 2) + '\n');
}

function enableJsonStdoutOnly() {
  // In JSON mode, keep stdout machine-parseable (JSON only).
  // Route human-readable logs to stderr.
  const fmt = (...args) => util.format(...args);
  console.log = (...args) => writeStderr(fmt(...args) + '\n');
  console.info = (...args) => writeStderr(fmt(...args) + '\n');
  console.warn = (...args) => writeStderr(fmt(...args) + '\n');
}

function truncateOutput(s, limit = 12_000) {
  const v = String(s || '');
  if (!v) return '';
  if (v.length <= limit) return v;
  return v.slice(0, limit) + `\n...(truncated ${v.length - limit} chars)`;
}

function spawnSyncForOutput(cmd, args, { cwd }) {
  if (!isJsonFormat()) {
    return childProcess.spawnSync(cmd, args, { stdio: 'inherit', cwd });
  }
  return childProcess.spawnSync(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function attachSpawnOutput(res, out) {
  if (!isJsonFormat()) return out;
  const next = { ...(out || {}) };
  const stdout = truncateOutput(res?.stdout);
  const stderr = truncateOutput(res?.stderr);
  if (stdout) next.stdout = stdout;
  if (stderr) next.stderr = stderr;
  return next;
}

function usage(exitCode = 0) {
  const msg = `
Usage:
  node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs <command> [options]

Commands:
  start
    --repo-root <path>          Repo root (default: cwd)
    --lang <zh|en>              Default doc language (default: prompt when TTY, else "en")
    Initialize state file and show next steps.

  repair
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Restore missing init artifacts (copy-if-missing; does not overwrite).

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show current initialization progress.

  set-llm-language
    --repo-root <path>          Repo root (default: cwd)
    --value <text>              User-facing docs language (free-form)
    Set init state: llm.language (LLM-managed; does not affect stage gating).

  advance
    --repo-root <path>          Repo root (default: cwd)
    Print the next checkpoint actions for the current stage.

  approve
    --repo-root <path>          Repo root (default: cwd)
    --stage <A|B|C>             Stage to approve (default: current state.stage)
    --note <text>               Optional audit note
    Record explicit user approval and advance state to the next stage.

  validate
    --blueprint <path>          Blueprint JSON path (default: init/_work/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)

  check-docs
    --docs-root <path>          Stage A docs root (default: <repo-root>/init/_work/stage-a-docs)
    --repo-root <path>          Repo root (default: cwd)
    --strict                    Treat warnings as errors (exit non-zero)
    --format <text|json>        Output format (default: text)

  mark-must-ask
    --key <id>                  Must-ask key (required)
    --asked                     Mark as asked
    --answered                  Mark as answered
    --written-to <path>         Record where the answer was written
    --repo-root <path>          Repo root (default: cwd)

  review-packs
    --repo-root <path>          Repo root (default: cwd)
    --note <text>               Optional audit note

  skill-retention
    --repo-root <path>          Repo root (default: cwd)
    --file <path>               Skill retention table (default: init/_work/skill-retention-table.template.md)
    --apply                     Apply deletions via sync-skills.mjs (default: dry-run)

  suggest-packs
    --blueprint <path>          Blueprint JSON path (default: init/_work/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    --write                     Add missing recommended packs into blueprint (safe-add only)

  suggest-features
    --blueprint <path>          Blueprint JSON path (default: init/_work/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    --write                     Add missing recommended features into blueprint (safe-add only)

  scaffold
    --blueprint <path>          Blueprint JSON path (default: init/_work/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --apply                     Actually create directories/files (default: dry-run)

  update-root-docs
    --blueprint <path>          Blueprint JSON path (default: init/_work/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --apply                     Write README.md + AGENTS.md (default: show diff only)
    --format <text|json>        Output format (default: text)

  apply
    --blueprint <path>          Blueprint JSON path (default: init/_work/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --providers <both|codex|claude|codex,claude>
    --require-stage-a           Refuse apply if Stage A docs invalid
    --skip-configs              Do not generate config files
    --cleanup-init              Run cleanup-init after apply
    --i-understand              Required when using --cleanup-init
    --no-stage-gate             Allow apply without stage C/complete (advanced; not recommended)

    Feature install controls:
    --force-features            Overwrite existing feature files when materializing templates
    --verify-features           Run feature verify commands after installation (when available)
    --non-blocking-features     Continue on feature errors (default: fail-fast)

    --format <text|json>        Output format (default: text)

  cleanup-init
    --repo-root <path>          Repo root (default: cwd)
    --apply                     Actually remove init/ (default: dry-run)
    --i-understand              Required acknowledgement (refuses without it)
    --archive                   Archive all (Stage A docs + blueprint + init state) to docs/project/overview/
    --archive-docs              Archive Stage A docs only to docs/project/overview/
    --archive-blueprint         Archive blueprint only to docs/project/overview/

Examples:
  node .../init-pipeline.mjs start
  node .../init-pipeline.mjs status
  node .../init-pipeline.mjs check-docs --strict
  node .../init-pipeline.mjs validate
  node .../init-pipeline.mjs apply --providers both
  node .../init-pipeline.mjs cleanup-init --apply --i-understand --archive
  node .../init-pipeline.mjs approve --stage A
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, exitCode = 1) {
  console.error(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === 'help' || args[0] === '-h' || args[0] === '--help') usage(0);

  const command = args.shift();
  const opts = {};
  const positionals = [];

  while (args.length > 0) {
    const token = args.shift();
    if (token === '-h' || token === '--help') usage(0);

    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) {
        opts[key] = args.shift();
      } else {
        opts[key] = true;
      }
    } else {
      positionals.push(token);
    }
  }

  return { command, opts, positionals };
}

function resolvePath(base, p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(base, p);
}

function stripUtf8Bom(s) {
  if (typeof s !== 'string' || s.length === 0) return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function readJson(filePath) {
  try {
    const raw = stripUtf8Bom(fs.readFileSync(filePath, 'utf8'));
    return JSON.parse(raw);
  } catch (e) {
    die(`[error] Failed to read JSON: ${filePath}\n${e.message}`);
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function normalizeNewlines(s) {
  return String(s || '').replace(/\r\n/g, '\n');
}

function sha256Hex(s) {
  return createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function sortJsonForStableStringify(v) {
  if (Array.isArray(v)) return v.map(sortJsonForStableStringify);
  if (v && typeof v === 'object') {
    const out = {};
    for (const key of Object.keys(v).sort()) {
      out[key] = sortJsonForStableStringify(v[key]);
    }
    return out;
  }
  return v;
}

function stableJsonStringify(v) {
  return JSON.stringify(sortJsonForStableStringify(v));
}

function fingerprintBlueprint(blueprint) {
  return sha256Hex(stableJsonStringify(blueprint));
}

function fingerprintStageADocs(docsRoot) {
  const required = [
    'requirements.md',
    'non-functional-requirements.md',
    'domain-glossary.md',
    'risk-open-questions.md',
  ];

  const parts = [];
  for (const name of required) {
    const fp = path.join(docsRoot, name);
    if (!fs.existsSync(fp)) return null;
    const content = fs.readFileSync(fp, 'utf8');
    parts.push(`--FILE:${name}--\n`);
    parts.push(normalizeNewlines(content));
    parts.push('\n');
  }
  return sha256Hex(parts.join(''));
}

function fingerprintTextFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return sha256Hex(normalizeNewlines(fs.readFileSync(filePath, 'utf8')));
}

function isInteractiveTty() {
  return !!(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY);
}

function readLineSync(prompt) {
  process.stdout.write(prompt);
  const buf = Buffer.alloc(1);
  let line = '';
  while (true) {
    let bytes = 0;
    try {
      bytes = fs.readSync(0, buf, 0, 1, null);
    } catch {
      break;
    }
    if (bytes === 0) break;
    const ch = buf.toString('utf8', 0, bytes);
    if (ch === '\n') break;
    if (ch === '\r') continue;
    line += ch;
  }
  return line.trim();
}

function promptYesNoSync(question, defaultYes) {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  for (let i = 0; i < 3; i += 1) {
    const ans = readLineSync(`${question}${suffix}`).toLowerCase();
    if (!ans) return defaultYes;
    if (ans === 'y' || ans === 'yes') return true;
    if (ans === 'n' || ans === 'no') return false;
    console.log('[info] Please answer: y/yes or n/no.');
  }
  return defaultYes;
}

const SUPPORTED_LANGS = ['en', 'zh'];

function normalizeLang(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'zh' || s === 'zh-cn' || s === 'zh_cn') return 'zh';
  if (s === 'en' || s === 'en-us' || s === 'en_us') return 'en';
  return null;
}

function promptLangSync(defaultLang = 'en') {
  const d = normalizeLang(defaultLang) || 'en';
  for (let i = 0; i < 3; i += 1) {
    const ans = readLineSync(`Default doc language? (${SUPPORTED_LANGS.join('/')}) [${d}] `).toLowerCase();
    if (!ans) return d;
    const normalized = normalizeLang(ans);
    if (normalized) return normalized;
    console.log(`[info] Please answer: ${SUPPORTED_LANGS.join(' or ')}.`);
  }
  return d;
}

function ensurePathWithinRepo(repoRoot, targetPath, label) {
  const rr = path.resolve(repoRoot);
  const tp = path.resolve(targetPath);
  if (tp === rr || !tp.startsWith(rr + path.sep)) {
    die(`[error] Refusing to operate outside repo root for ${label}: ${tp}`);
  }
}

function removeDirRecursive(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// State Management
// ============================================================================

const SCRIPT_DIR = __dirname;
const TEMPLATES_DIR = path.join(SCRIPT_DIR, '..', 'templates');

// Runtime work artifacts live under init/_work/ by default (keeps init/ root clean).
// Legacy layout (back-compat): init/ as the work root.
const INIT_DIRNAME = 'init';
const INIT_WORK_DIRNAME = '_work';
const LEGACY_WORK_ROOT_SEGS = [INIT_DIRNAME];
const MODERN_WORK_ROOT_SEGS = [INIT_DIRNAME, INIT_WORK_DIRNAME];
let WORK_ROOT_SEGS = [...MODERN_WORK_ROOT_SEGS];

function workRootPosix(segs = WORK_ROOT_SEGS) {
  return segs.join('/');
}

function workRelPosix(...parts) {
  return path.posix.join(workRootPosix(), ...parts);
}

function statePathForSegs(repoRoot, segs) {
  return path.join(repoRoot, ...segs, '.init-state.json');
}

function detectWorkRootSegs(repoRoot) {
  // Prefer modern if it exists; otherwise fall back to legacy.
  if (fs.existsSync(statePathForSegs(repoRoot, MODERN_WORK_ROOT_SEGS))) return [...MODERN_WORK_ROOT_SEGS];
  if (fs.existsSync(statePathForSegs(repoRoot, LEGACY_WORK_ROOT_SEGS))) return [...LEGACY_WORK_ROOT_SEGS];

  // If init/_work exists (even without state yet), prefer modern.
  if (fs.existsSync(path.join(repoRoot, ...MODERN_WORK_ROOT_SEGS))) return [...MODERN_WORK_ROOT_SEGS];
  return [...MODERN_WORK_ROOT_SEGS];
}

function setWorkRootSegs(repoRoot) {
  WORK_ROOT_SEGS = detectWorkRootSegs(repoRoot);
  return WORK_ROOT_SEGS;
}

function stageADocTemplateSpecs() {
  return [
    { src: 'requirements.template.md', dest: 'requirements.md' },
    { src: 'non-functional-requirements.template.md', dest: 'non-functional-requirements.md' },
    { src: 'domain-glossary.template.md', dest: 'domain-glossary.md' },
    { src: 'risk-open-questions.template.md', dest: 'risk-open-questions.md' }
  ];
}

function getStatePath(repoRoot) {
  return path.join(repoRoot, ...WORK_ROOT_SEGS, '.init-state.json');
}

function createInitialState(language = 'en') {
  return {
    version: 1,
    language: normalizeLang(language) || 'en',
    stage: 'A',
    createdAt: new Date().toISOString(),
    'stage-a': {
      mustAsk: {
        terminologyAlignment: { asked: false, answered: false, writtenTo: null },
        onePurpose: { asked: false, answered: false, writtenTo: null },
        userRoles: { asked: false, answered: false, writtenTo: null },
        mustRequirements: { asked: false, answered: false, writtenTo: null },
        outOfScope: { asked: false, answered: false, writtenTo: null },
        userJourneys: { asked: false, answered: false, writtenTo: null },
        constraints: { asked: false, answered: false, writtenTo: null },
        successMetrics: { asked: false, answered: false, writtenTo: null }
      },
      docsWritten: {
        requirements: false,
        nfr: false,
        glossary: false,
        riskQuestions: false
      },
      validated: false,
      userApproved: false
    },
    'stage-b': {
      drafted: false,
      validated: false,
      packsReviewed: false,
      userApproved: false
    },
    'stage-c': {
      scaffoldApplied: false,
      configsGenerated: false,
      manifestUpdated: false,
      wrappersSynced: false,
      skillRetentionReviewed: false,
      userApproved: false
    },
    history: []
  };
}

function loadState(repoRoot) {
  const statePath = getStatePath(repoRoot);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(stripUtf8Bom(fs.readFileSync(statePath, 'utf8')));
  } catch (e) {
    console.error(`[warn] Failed to parse state file: ${e.message}`);
    return null;
  }
}

function saveState(repoRoot, state) {
  const statePath = getStatePath(repoRoot);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function addHistoryEvent(state, event, details) {
  state.history = state.history || [];
  state.history.push({
    timestamp: new Date().toISOString(),
    event,
    details
  });
}

function getStageProgress(state) {
  const stage_a = state['stage-a'] || {};
  const stage_b = state['stage-b'] || {};
  const stage_c = state['stage-c'] || {};

  const mustAskKeys = Object.keys(stage_a.mustAsk || {});
  const mustAskAnswered = mustAskKeys.filter(k => stage_a.mustAsk[k]?.answered).length;

  const docsKeys = ['requirements', 'nfr', 'glossary', 'riskQuestions'];
  const docsWritten = docsKeys.filter(k => stage_a.docsWritten?.[k]).length;

  return {
    stage: state.stage,
    'stage-a': {
      mustAskTotal: mustAskKeys.length,
      mustAskAnswered,
      docsTotal: docsKeys.length,
      docsWritten,
      validated: !!stage_a.validated,
      userApproved: !!stage_a.userApproved
    },
    'stage-b': {
      drafted: !!stage_b.drafted,
      validated: !!stage_b.validated,
      packsReviewed: !!stage_b.packsReviewed,
      userApproved: !!stage_b.userApproved
    },
    'stage-c': {
      scaffoldApplied: !!stage_c.scaffoldApplied,
      configsGenerated: !!stage_c.configsGenerated,
      manifestUpdated: !!stage_c.manifestUpdated,
      wrappersSynced: !!stage_c.wrappersSynced,
      skillRetentionReviewed: !!stage_c.skillRetentionReviewed,
      userApproved: !!stage_c.userApproved
    }
  };
}

function printStatus(state, repoRoot) {
  const progress = getStageProgress(state);
  const lang = normalizeLang(state?.language) || 'en';
  const stageNames = { A: 'Requirements', B: 'Blueprint', C: 'Scaffold', complete: 'Complete' };
  const stage_a = progress['stage-a'] || {};
  const stage_b = progress['stage-b'] || {};
  const stage_c = progress['stage-c'] || {};
  const bpRel = workRelPosix('project-blueprint.json');

  // Preferred: ASCII-only status output (avoid mojibake in some terminals).
  const self = path.relative(repoRoot, __filename);
  const llmLang = getLlmLanguage(state);
  const startHerePath = getStartHerePath(repoRoot);
  const initBoardPath = getInitBoardPath(repoRoot);
  const startHereExists = fs.existsSync(startHerePath);
  const initBoardExists = fs.existsSync(initBoardPath);
  const initBoardContent = initBoardExists ? stripUtf8Bom(fs.readFileSync(initBoardPath, 'utf8')) : '';
  const initBoardHasMarkers =
    initBoardExists &&
    initBoardContent.includes(INIT_BOARD_MACHINE_SNAPSHOT_START) &&
    initBoardContent.includes(INIT_BOARD_MACHINE_SNAPSHOT_END);

  console.log('');
  console.log('== Init Status ==');
  console.log(`stage: ${progress.stage} (${stageNames[progress.stage] || progress.stage})`);
  console.log(`pipelineLanguage: ${lang}`);
  console.log(`llm.language: ${llmLang || '(unset)'}`);
  console.log('');
  console.log(
    `stageA: mustAsk ${stage_a.mustAskAnswered}/${stage_a.mustAskTotal}; docs ${stage_a.docsWritten}/${stage_a.docsTotal}; validated ${stage_a.validated ? 'yes' : 'no'}; approved ${stage_a.userApproved ? 'yes' : 'no'}`
  );
  console.log(
    `stageB: drafted ${stage_b.drafted ? 'yes' : 'no'}; validated ${stage_b.validated ? 'yes' : 'no'}; packsReviewed ${stage_b.packsReviewed ? 'yes' : 'no'}; approved ${stage_b.userApproved ? 'yes' : 'no'}`
  );
  console.log(
    `stageC: wrappersSynced ${stage_c.wrappersSynced ? 'yes' : 'no'}; skillRetentionReviewed ${stage_c.skillRetentionReviewed ? 'yes' : 'no'}; approved ${stage_c.userApproved ? 'yes' : 'no'}`
  );
  console.log('');

  if (!llmLang) {
    console.log('LLM language gate: llm.language is not set.');
    console.log(`- Set it: node ${self} set-llm-language --repo-root . --value \"<language>\"`);
    console.log('- Entry docs (START-HERE / INIT-BOARD) should be created by the LLM only after llm.language is set.');
    console.log('');
  }

  if (llmLang) {
    if (!startHereExists) {
      console.log(`[todo] Create init/${START_HERE_FILE} (LLM-maintained).`);
      console.log('       Template: init/_tools/skills/initialize-project-from-requirements/templates/START-HERE.llm.template.md');
    }
    if (!initBoardExists) {
      console.log(`[todo] Create init/${INIT_BOARD_FILE} (LLM-owned layout).`);
      console.log('       Template: init/_tools/skills/initialize-project-from-requirements/templates/INIT-BOARD.llm.template.md');
      console.log('       (Keep machine snapshot markers; the pipeline updates only that section.)');
    } else if (!initBoardHasMarkers) {
      console.log(`[warn] init/${INIT_BOARD_FILE} is missing machine snapshot markers; the pipeline will not update the snapshot block.`);
      console.log(`       Required markers: ${INIT_BOARD_MACHINE_SNAPSHOT_START} ... ${INIT_BOARD_MACHINE_SNAPSHOT_END}`);
    }
    console.log('');
  }

  console.log('Next steps (pipeline):');
  if (progress.stage === 'A') {
    if (!stage_a.validated) {
      console.log('- 1) Complete Stage A docs, then run: check-docs --strict');
    } else if (!stage_a.userApproved) {
      console.log(`- Have the user approve Stage A, then run: node ${self} approve --stage A --repo-root .`);
    }
  } else if (progress.stage === 'B') {
    if (!stage_b.validated) {
      console.log(`- 1) Edit ${bpRel}`);
      console.log(`- 2) Run: validate --blueprint ${bpRel}`);
    } else if (!stage_b.packsReviewed) {
      console.log(`- Have the user review blueprint.skills.packs, then run: node ${self} review-packs --repo-root .`);
    } else if (!stage_b.userApproved) {
      console.log(`- Have the user approve Stage B, then run: node ${self} approve --stage B --repo-root .`);
    }
  } else if (progress.stage === 'C') {
    if (!stage_c.wrappersSynced) {
      console.log(`- Run: apply --blueprint ${bpRel}`);
    } else if (!stage_c.skillRetentionReviewed) {
      console.log(`- Fill and confirm: ${workRelPosix('skill-retention-table.template.md')}`);
      console.log(`- Run: node ${self} skill-retention --repo-root .`);
    } else if (!stage_c.userApproved) {
      console.log(`- Have the user approve Stage C, then run: node ${self} approve --stage C --repo-root .`);
    }
  } else if (progress.stage === 'complete') {
    console.log('- Initialization complete.');
  }

  console.log('');
  console.log(`Board: init/${INIT_BOARD_FILE} (LLM-owned; pipeline updates machine snapshot only)`);
  console.log('');
  return;
}

// ============================================================================
// START-HERE + INIT-BOARD (LLM-managed; pipeline snapshot only)
// ============================================================================

const START_HERE_FILE = 'START-HERE.md';
const INIT_BOARD_FILE = 'INIT-BOARD.md';
const INIT_BOARD_MACHINE_SNAPSHOT_START = '<!-- INIT-BOARD:MACHINE_SNAPSHOT:START -->';
const INIT_BOARD_MACHINE_SNAPSHOT_END = '<!-- INIT-BOARD:MACHINE_SNAPSHOT:END -->';

function getStartHerePath(repoRoot) {
  return path.join(repoRoot, 'init', START_HERE_FILE);
}

function getInitBoardPath(repoRoot) {
  return path.join(repoRoot, 'init', INIT_BOARD_FILE);
}

function detectNewline(s) {
  return String(s || '').includes('\r\n') ? '\r\n' : '\n';
}

function getLlmLanguage(state) {
  const v = state?.llm?.language;
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function computeStateUpdatedAt(state) {
  const createdAt = typeof state?.createdAt === 'string' ? state.createdAt : null;
  const history = Array.isArray(state?.history) ? state.history : [];
  let last = createdAt;
  for (const h of history) {
    const ts = h && typeof h.timestamp === 'string' ? h.timestamp : null;
    if (!ts) continue;
    if (!last || ts > last) last = ts;
  }
  return last || '(unknown)';
}

function replaceBlockBetweenMarkers(doc, startMarker, endMarker, replacement) {
  const s = doc.indexOf(startMarker);
  if (s < 0) return null;
  const e = doc.indexOf(endMarker, s);
  if (e < 0) return null;
  const end = e + endMarker.length;
  return doc.slice(0, s) + replacement + doc.slice(end);
}

function buildInitBoardMachineSnapshotMarkdown(state, repoRoot, docsRoot, blueprintPath, exitCode, newline = '\n') {
  const progress = state ? getStageProgress(state) : null;
  const stage_a = progress?.['stage-a'] || {};
  const stage_b = progress?.['stage-b'] || {};
  const stage_c = progress?.['stage-c'] || {};

  const detected = detectDocsLanguageFromDocsRoot(docsRoot);
  const pipelineLang = normalizeLang(state?.language) || detected || 'en';
  const llmLang = getLlmLanguage(state) || '(unset)';
  const updatedAt = computeStateUpdatedAt(state);
  const nextSteps = progress ? computeNextStepsForStartHere(pipelineLang, progress, repoRoot, docsRoot, blueprintPath) : [];

  const yn = (v) => (v ? 'yes' : 'no');

  const lines = [];
  lines.push(INIT_BOARD_MACHINE_SNAPSHOT_START);
  lines.push('## Machine snapshot (pipeline)');
  lines.push('');
  lines.push(`- stage: ${progress?.stage || state?.stage || '(unknown)'}`);
  lines.push(`- pipelineLanguage: ${pipelineLang}`);
  lines.push(`- llm.language: ${llmLang}`);
  lines.push(`- stateUpdatedAt: ${updatedAt}`);
  if (typeof exitCode === 'number') lines.push(`- lastExitCode: ${exitCode}`);
  lines.push('');
  if (progress) {
    lines.push(`- stageA: mustAsk ${stage_a.mustAskAnswered}/${stage_a.mustAskTotal}; docs ${stage_a.docsWritten}/${stage_a.docsTotal}; validated ${yn(stage_a.validated)}; approved ${yn(stage_a.userApproved)}`);
    lines.push(`- stageB: drafted ${yn(stage_b.drafted)}; validated ${yn(stage_b.validated)}; packsReviewed ${yn(stage_b.packsReviewed)}; approved ${yn(stage_b.userApproved)}`);
    lines.push(`- stageC: wrappersSynced ${yn(stage_c.wrappersSynced)}; skillRetentionReviewed ${yn(stage_c.skillRetentionReviewed)}; approved ${yn(stage_c.userApproved)}`);
    lines.push('');
  }
  if (nextSteps.length > 0) {
    lines.push('### Next (suggested)');
    for (const step of nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push('');
  }
  lines.push(INIT_BOARD_MACHINE_SNAPSHOT_END);
  return lines.join(newline);
}

function ensureWorkdirAgents(repoRoot, apply) {
  const srcPath = path.join(TEMPLATES_DIR, 'workdir.AGENTS.md');
  const destPath = path.join(repoRoot, INIT_DIRNAME, INIT_WORK_DIRNAME, 'AGENTS.md');
  return copyFileIfMissing(srcPath, destPath, apply);
}

function computeNextStepsForStartHere(lang, progress, repoRoot, docsRoot, blueprintPath) {
  const self = path.relative(repoRoot, __filename);
  const docsRel = path.relative(repoRoot, docsRoot);
  const bpRel = blueprintPath ? path.relative(repoRoot, blueprintPath) : workRelPosix('project-blueprint.json');

  const steps = [];
  if (!progress) {
    steps.push(`Run: \`node ${self} start --repo-root . --lang <zh|en>\``);
    steps.push(`Then open: \`init/${START_HERE_FILE}\``);
    return steps;
  }

  const stage = String(progress.stage || '').toUpperCase();
  const stage_a = progress['stage-a'] || {};
  const stage_b = progress['stage-b'] || {};
  const stage_c = progress['stage-c'] || {};

  if (stage === 'A') {
    if (!stage_a.validated) {
      steps.push(`Complete Stage A docs: \`${path.relative(repoRoot, docsRoot)}/*.md\``);
      steps.push(`Validate: \`node ${self} check-docs --docs-root ${docsRel} --strict\``);
    } else if (!stage_a.userApproved) {
      steps.push('Have the user review and explicitly approve Stage A (requirements docs).');
      steps.push(`After approval, run: \`node ${self} approve --stage A --repo-root .\``);
    }
    return steps;
  }

  if (stage === 'B') {
    if (!stage_b.validated) {
      steps.push(`Edit: \`${bpRel}\``);
      steps.push(`Validate: \`node ${self} validate --blueprint ${bpRel}\``);
    } else if (!stage_b.packsReviewed) {
      steps.push('Have the user review blueprint.skills.packs and confirm the selected packs.');
      steps.push(`After review, run: \`node ${self} review-packs --repo-root .\``);
    } else if (!stage_b.userApproved) {
      steps.push('Have the user review and explicitly approve Stage B (blueprint).');
      steps.push(`After approval, run: \`node ${self} approve --stage B --repo-root .\``);
    }
    return steps;
  }

  if (stage === 'C') {
    if (!stage_c.wrappersSynced) {
      steps.push(`Run: \`node ${self} apply --blueprint ${bpRel} --repo-root . --providers both\``);
      return steps;
    }

    if (!stage_c.skillRetentionReviewed) {
      steps.push(`Fill and confirm: \`${workRelPosix('skill-retention-table.template.md')}\``);
      steps.push(`Run: \`node ${self} skill-retention --repo-root .\``);
      return steps;
    }

    if (!stage_c.userApproved) {
      steps.push('Have the user confirm Stage C outputs (scaffold/configs/packs/features).');
      steps.push('[Recommended] Ask if user wants to update root README.md and AGENTS.md (replaces template description with project info)');
      steps.push(`Preview changes: \`node ${self} update-root-docs --repo-root .\``);
      steps.push(`Apply after approval: \`node ${self} update-root-docs --repo-root . --apply\``);
      steps.push(`After all confirmed, run: \`node ${self} approve --stage C --repo-root .\``);
      return steps;
    }
  }

  if (stage === 'COMPLETE') {
    const glossaryTarget = path.join(repoRoot, 'docs', 'context', 'glossary.json');
    const glossarySource = path.join(docsRoot, 'domain-glossary.md');
    if (fs.existsSync(glossaryTarget) && fs.existsSync(glossarySource)) {
      steps.push('Migrate glossary: transfer terms from `init/_work/stage-a-docs/domain-glossary.md` to `docs/context/glossary.json`, then run `ctl-context touch`.');
    }
    steps.push('Initialization complete. Optional: run `cleanup-init --apply --i-understand` to remove init/.');
    return steps;
  }

  return steps;
}

function tryUpdateInitBoard(repoRoot, docsRoot, blueprintPath, exitCode) {
  try {
    const initDir = path.join(repoRoot, 'init');
    if (!fs.existsSync(initDir)) return { op: 'skip', reason: 'init dir missing' };

    const state = loadState(repoRoot);
    if (!state) return { op: 'skip', reason: 'state missing' };

    // Ensure workdir guidance exists (copy-if-missing; never overwrite).
    ensureWorkdirAgents(repoRoot, true);

    // Gate: do not touch entry docs until the LLM has confirmed a user-facing language.
    const llmLang = getLlmLanguage(state);
    if (!llmLang) return { op: 'skip', reason: 'llm.language missing' };

    const detected = detectDocsLanguageFromDocsRoot(docsRoot);
    const lang = normalizeLang(state.language) || detected || 'en';
    if (!normalizeLang(state.language)) {
      state.language = lang;
      saveState(repoRoot, state);
    }

    const boardPath = getInitBoardPath(repoRoot);
    if (!fs.existsSync(boardPath)) return { op: 'skip', reason: 'init board missing' };

    const existingRaw = fs.readFileSync(boardPath, 'utf8');
    const hadBom = existingRaw.charCodeAt(0) === 0xfeff;
    const existing = stripUtf8Bom(existingRaw);
    const newline = detectNewline(existingRaw);
    const snapshot = buildInitBoardMachineSnapshotMarkdown(state, repoRoot, docsRoot, blueprintPath, exitCode, newline);
    const desired = replaceBlockBetweenMarkers(existing, INIT_BOARD_MACHINE_SNAPSHOT_START, INIT_BOARD_MACHINE_SNAPSHOT_END, snapshot);
    if (desired === null) return { op: 'skip', reason: 'machine snapshot markers missing' };
    if (existing === desired) return { op: 'skip', reason: 'unchanged' };

    fs.writeFileSync(boardPath, hadBom ? '\ufeff' + desired : desired, 'utf8');
    return { op: 'write', path: boardPath, scope: 'machine-snapshot' };
  } catch (e) {
    return { op: 'skip', reason: `failed: ${e.message}` };
  }
}

// ============================================================================
// Config File Generation
// ============================================================================

// Import from scaffold-configs.mjs (single source of truth)
import { generateConfigFiles as genConfigFiles } from './scaffold-configs.mjs';

function generateConfigFiles(repoRoot, blueprint, apply) {
  return genConfigFiles(repoRoot, blueprint, apply);
}

function packPrefixMap() {
  // Must match actual .ai/skills/ directory structure
  return {
    workflows: 'workflows/',
    standards: 'standards/',
    testing: 'testing/',
    'context-core': 'features/context-awareness',
    backend: 'backend/',
    frontend: 'frontend/'
  };
}

function packOrder() {
  // Base packs available in template (matches .ai/skills/_meta/packs/)
  return ['workflows', 'standards', 'testing', 'context-core', 'backend', 'frontend'];
}

function normalizePackList(packs) {
  const cleaned = (packs || [])
    .filter((p) => typeof p === 'string')
    .map((p) => p.trim())
    .filter(Boolean);

  const order = packOrder();
  const ordered = [];
  for (const p of order) {
    if (cleaned.includes(p)) ordered.push(p);
  }
  for (const p of cleaned) {
    if (!ordered.includes(p)) ordered.push(p);
  }
  return uniq(ordered);
}

function validateBlueprint(blueprint) {
  const errors = [];
  const warnings = [];

  if (!blueprint || typeof blueprint !== 'object') {
    errors.push('Blueprint must be a JSON object.');
    return { ok: false, errors, warnings };
  }

  if (!Number.isInteger(blueprint.version) || blueprint.version < 1) {
    errors.push('Blueprint.version must be an integer >= 1.');
  }

  // Feature flags
  if (blueprint.features !== undefined) {
    if (blueprint.features === null || Array.isArray(blueprint.features) || typeof blueprint.features !== 'object') {
      errors.push('features must be an object when present.');
    }
  }
  if (blueprint.addons !== undefined) {
    errors.push('addons is not supported. Use features.* instead.');
  }

  const project = blueprint.project || {};
  if (!project.name || typeof project.name !== 'string') errors.push('project.name is required (string).');
  if (!project.description || typeof project.description !== 'string') errors.push('project.description is required (string).');

  const repo = blueprint.repo || {};
  const validLayouts = ['single', 'monorepo'];
  if (!repo.layout || !validLayouts.includes(repo.layout)) {
    errors.push(`repo.layout is required and must be one of: ${validLayouts.join(', ')}`);
  }
  if (!repo.language || typeof repo.language !== 'string') {
    errors.push('repo.language is required (string).');
  }
  if (!repo.packageManager || typeof repo.packageManager !== 'string') {
    errors.push('repo.packageManager is required (string).');
  }

  // Capabilities sanity checks (warn-only unless obviously inconsistent)
  const caps = blueprint.capabilities || {};
  const validCapabilityDbKinds = ['none', 'postgres', 'mysql', 'sqlite', 'mssql', 'mongodb', 'dynamodb', 'convex', 'other'];
  if (caps.database && caps.database.enabled) {
    if (!caps.database.kind || typeof caps.database.kind !== 'string') warnings.push('capabilities.database.enabled=true but capabilities.database.kind is missing.');
    else if (!validCapabilityDbKinds.includes(String(caps.database.kind))) {
      errors.push(`capabilities.database.kind must be one of: ${validCapabilityDbKinds.join(', ')}`);
    }
  }
  if (caps.api && caps.api.style && typeof caps.api.style !== 'string') warnings.push('capabilities.api.style should be a string.');
  if (caps.bpmn && typeof caps.bpmn.enabled !== 'boolean') warnings.push('capabilities.bpmn.enabled should be boolean when present.');



  // DB SSOT mode checks (mutually exclusive DB schema workflows)
  const db = blueprint.db || {};
  const validDbKinds = ['postgres', 'mysql', 'sqlite', 'mssql', 'mongodb', 'dynamodb', 'convex', 'other'];
  const validSsot = ['none', 'repo-prisma', 'database', 'convex'];
  if (typeof db.enabled !== 'boolean') {
    errors.push('db.enabled is required (boolean).');
  }
  if (db.kind && (typeof db.kind !== 'string' || !validDbKinds.includes(db.kind))) {
    errors.push(`db.kind must be one of: ${validDbKinds.join(', ')}`);
  }
  if (!db.ssot || typeof db.ssot !== 'string' || !validSsot.includes(db.ssot)) {
    errors.push(`db.ssot is required and must be one of: ${validSsot.join(', ')}`);
  }

  const flags = featureFlags(blueprint);
  if (Object.prototype.hasOwnProperty.call(flags, 'dbMirror')) {
    errors.push('features.dbMirror is not supported. Use features.database instead.');
  }

  const databaseEnabled = isDatabaseEnabled(blueprint);
  const contextAwarenessEnabled = isContextAwarenessEnabled(blueprint);

  if (db.ssot !== 'none' && !databaseEnabled) {
    errors.push('db.ssot != none requires features.database=true (Database feature).');
  }
  if (db.ssot === 'none' && databaseEnabled) {
    errors.push('features.database=true is only valid when db.ssot != none.');
  }
  if (db.ssot !== 'none' && !contextAwarenessEnabled) {
    errors.push('db.ssot != none requires features.contextAwareness=true (database workflows are contract-first under docs/context/).');
  }

  if (db.ssot === 'convex') {
    const repoLanguage = String(repo.language || '').toLowerCase();
    const convexLanguages = new Set(['typescript', 'javascript', 'react-native']);
    if (!convexLanguages.has(repoLanguage)) {
      errors.push('db.ssot=convex is only supported when repo.language is "typescript", "javascript", or "react-native".');
    }
    if (db.source != null && (typeof db.source !== 'object' || Array.isArray(db.source))) {
      errors.push('db.source must be an object when db.ssot="convex".');
    }
    const configuredConvexSourcePath = configuredConvexSourcePathFromDbConfig(db);
    if (db.source && db.source.path != null) {
      if (typeof db.source.path !== 'string' || !String(db.source.path).trim()) {
        errors.push('db.source.path must be a non-empty string when provided for db.ssot="convex".');
      } else if (!isSafeRepoRelativePath(db.source.path)) {
        errors.push('db.source.path for db.ssot="convex" must stay within the repo root (for example: "convex/schema.ts" or "apps/api/convex/schema.ts").');
      }
    }
    if (!isSafeRepoRelativePath(configuredConvexSourcePath)) {
      errors.push('Resolved Convex schema source path must stay within the repo root.');
    }
    if (db.kind !== 'convex') {
      errors.push('db.ssot=convex requires db.kind="convex".');
    }
    if (caps.database && caps.database.enabled && caps.database.kind && caps.database.kind !== 'convex') {
      warnings.push('db.ssot=convex usually expects capabilities.database.kind="convex".');
    }
    if (db.migrationTool && String(db.migrationTool).trim()) {
      warnings.push('db.ssot=convex ignores db.migrationTool; Convex schema changes originate in convex/schema.ts.');
    }
  }

  // IaC tool checks
  const iac = blueprint.iac && typeof blueprint.iac === 'object' ? blueprint.iac : {};
  const iacToolValue = iacTool(blueprint);
  const validIacTools = ['none', 'ros', 'terraform', 'opentofu'];
  if (iac.tool && !validIacTools.includes(iacToolValue)) {
    errors.push(`iac.tool must be one of: ${validIacTools.join(', ')}`);
  }
  if (featureFlags(blueprint).iac === true && iacToolValue === 'none') {
    errors.push('features.iac=true requires iac.tool to be "ros", "terraform", or "opentofu".');
  }
  if (iacToolValue !== 'none' && featureFlags(blueprint).iac !== true) {
    warnings.push('iac.tool is set; IaC feature will be enabled even if features.iac is not true.');
  }

  // Feature dependencies
  if (isObservabilityEnabled(blueprint) && !isContextAwarenessEnabled(blueprint)) {
    errors.push('features.observability=true requires features.contextAwareness=true (observability contracts live under docs/context/).');
  }

  // CI feature requirements
  if (isCiEnabled(blueprint)) {
    const provider = ciProvider(blueprint);
    if (!provider) {
      const ci = blueprint.ci && typeof blueprint.ci === 'object' ? blueprint.ci : {};
      const platform = String(ci.platform || '').toLowerCase();
      const hint =
        platform === 'github-actions' ? ' (hint: set ci.provider=\"github\")'
        : platform === 'gitlab-ci' ? ' (hint: set ci.provider=\"gitlab\")'
        : '';
      errors.push(`features.ci=true requires ci.provider to be \"github\" or \"gitlab\".${hint}`);
    }
  }

  if ((caps.database && caps.database.enabled) && db.ssot === 'none') {
    warnings.push('capabilities.database.enabled=true but db.ssot=none. The template will not manage schema synchronization.');
  }
  if ((!caps.database || !caps.database.enabled) && db.ssot !== 'none') {
    warnings.push('db.ssot is not none, but capabilities.database.enabled is false. Ensure this is intentional.');
  }
  const skills = blueprint.skills || {};
  if (skills.packs && !Array.isArray(skills.packs)) errors.push('skills.packs must be an array of strings when present.');

  const packs = normalizePackList(skills.packs || []);
  if (!packs.includes('workflows')) warnings.push('skills.packs does not include "workflows". This is usually required.');
  if (!packs.includes('standards')) warnings.push('skills.packs does not include "standards". This is usually recommended.');

  const ok = errors.length === 0;
  return { ok, errors, warnings, packs };
}

function featureFlags(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return {};
  const features = blueprint.features;
  if (!features || Array.isArray(features) || typeof features !== 'object') return {};
  return features;
}

function isContextAwarenessEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; context.* is configuration only
  return flags.contextAwareness === true;
}


function recommendedPacksFromBlueprint(blueprint) {
  const rec = new Set(['workflows', 'standards']);
  const caps = blueprint.capabilities || {};

  if (caps.backend && caps.backend.enabled) rec.add('backend');
  if (caps.frontend && caps.frontend.enabled) rec.add('frontend');

  // Optional packs can be added explicitly via blueprint.skills.packs.
  // (This function only computes recommendations; it does NOT mutate the blueprint.)

  const ordered = [];
  for (const p of packOrder()) {
    if (rec.has(p)) ordered.push(p);
  }
  return ordered;
}

function recommendedFeaturesFromBlueprint(blueprint) {
  const rec = [];
  const caps = blueprint.capabilities || {};
  const q = blueprint.quality || {};
  const devops = blueprint.devops || {};

  // context-awareness: enabled when API/database/BPMN are enabled
  // Note: api.style is checked because schema uses api.style (not api.enabled)
  const needsContext =
    (caps.api && (caps.api.enabled || (caps.api.style && caps.api.style !== 'none'))) ||
    (caps.database && caps.database.enabled) ||
    (caps.bpmn && caps.bpmn.enabled);
  if (needsContext) rec.push('contextAwareness');

  // database: enable when DB SSOT is managed (repo-prisma, database, or convex)
  const db = blueprint.db || {};
  if (db.ssot && db.ssot !== 'none') rec.push('database');

  // ui: enable when a frontend capability exists
  if (caps.frontend && caps.frontend.enabled) rec.push('ui');

  // packaging: enabled when containerization/packaging is configured
  const packagingEnabled =
    (blueprint.packaging && blueprint.packaging.enabled) ||
    (devops.packaging && devops.packaging.enabled) ||
    devops.enabled === true ||
    (q.devops && (q.devops.enabled || q.devops.containerize || q.devops.packaging));
  if (packagingEnabled) rec.push('packaging');

  // deployment: enabled when deployment is configured
  const deploymentEnabled =
    (devops.deploy && devops.deploy.enabled) ||
    devops.enabled === true ||
    (blueprint.deploy && blueprint.deploy.enabled) ||
    (q.devops && (q.devops.enabled || q.devops.deployment));
  if (deploymentEnabled) rec.push('deployment');

  // environment: recommend when the project likely needs env var contracts
  const envLikely =
    (caps.backend && caps.backend.enabled) ||
    packagingEnabled ||
    deploymentEnabled ||
    (blueprint.observability && blueprint.observability.enabled);
  if (envLikely) rec.push('environment');

  const iacToolValue = iacTool(blueprint);
  if (iacToolValue && iacToolValue !== 'none') rec.push('iac');

  // release: enabled when release management is configured
  const releaseEnabled =
    (blueprint.release && blueprint.release.enabled);
  if (releaseEnabled) rec.push('release');

  // ci: recommend when CI is explicitly configured/enabled
  const ciCfg = blueprint.ci && typeof blueprint.ci === 'object' ? blueprint.ci : {};
  const ciRecommended =
    ciCfg.enabled === true ||
    (q.ci && typeof q.ci === 'object' && q.ci.enabled === true);
  if (ciRecommended) rec.push('ci');

  // observability: enabled when observability is configured
  const observabilityEnabled =
    (blueprint.observability && blueprint.observability.enabled);
  if (observabilityEnabled) rec.push('observability');

  return rec;
}

function getEnabledFeatures(blueprint) {
  const enabled = [];
  
  if (isContextAwarenessEnabled(blueprint)) enabled.push('contextAwareness');
  if (isDatabaseEnabled(blueprint)) enabled.push('database');
  if (isUiEnabled(blueprint)) enabled.push('ui');
  if (isEnvironmentEnabled(blueprint)) enabled.push('environment');
  if (isIacEnabled(blueprint)) enabled.push('iac');
  if (isPackagingEnabled(blueprint)) enabled.push('packaging');
  if (isDeploymentEnabled(blueprint)) enabled.push('deployment');
  if (isReleaseEnabled(blueprint)) enabled.push('release');
  if (isCiEnabled(blueprint)) enabled.push('ci');
  if (isObservabilityEnabled(blueprint)) enabled.push('observability');
  
  return enabled;
}

function checkPackInstall(repoRoot, pack) {
  const packFile = path.join(repoRoot, '.ai', 'skills', '_meta', 'packs', `${pack}.json`);
  if (fs.existsSync(packFile)) {
    return { pack, installed: true, via: 'pack-file', path: path.relative(repoRoot, packFile) };
  }

  // Back-compat for repos without pack files: infer install by prefix presence
  const prefix = packPrefixMap()[pack];
  if (!prefix) return { pack, installed: false, reason: 'missing pack-file and no prefix mapping' };

  const dir = path.join(repoRoot, '.ai', 'skills', prefix.replace(/\/$/, ''));
  if (!fs.existsSync(dir)) return { pack, installed: false, reason: `missing ${path.relative(repoRoot, dir)}` };
  return { pack, installed: true, via: 'prefix-dir', path: path.relative(repoRoot, dir) };
}

function printResult(result, format) {
  if (format === 'json') {
    printJson(result);
    return;
  }
  // text
  if (result.summary) console.log(result.summary);
  if (result.errors && result.errors.length > 0) {
    console.log('\nErrors:');
    for (const e of result.errors) console.log(`- ${e}`);
  }
  if (result.warnings && result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) console.log(`- ${w}`);
  }
}

function detectDocsLanguageFromDocsRoot(docsRoot) {
  try {
    const reqPath = path.join(docsRoot, 'requirements.md');
    if (!fs.existsSync(reqPath)) return null;
    const content = fs.readFileSync(reqPath, 'utf8');
    if (content.includes('# Requirements') || content.includes('## Conclusions')) return 'en';
    return null;
  } catch {
    return null;
  }
}

function stripMarkdownCode(content) {
  if (!content) return '';
  // Ignore fenced code blocks and inline code for placeholder scanning to reduce false positives.
  // Keep it dependency-free; this is intentionally a simple heuristic.
  return String(content)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
}

function checkDocs(docsRoot, options = {}) {
  const errors = [];
  const warnings = [];

  // Check if docs directory exists
  if (!fs.existsSync(docsRoot)) {
    return {
      ok: false,
      errors: [
        `Stage A docs directory not found: ${docsRoot}`,
        `Run: node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root <repo-root> --lang <zh|en>`
      ],
      warnings: []
    };
  }

  const required = [
    {
      name: 'requirements.md',
      markers: ['<!-- INIT:STAGE-A:REQUIREMENTS -->'],
      fallbackHeadings: ['# Requirements', '## Conclusions', '## Goals', '## Non-goals']
    },
    {
      name: 'non-functional-requirements.md',
      markers: ['<!-- INIT:STAGE-A:NFR -->'],
      fallbackHeadings: ['# Non-functional Requirements', '## Conclusions']
    },
    {
      name: 'domain-glossary.md',
      markers: ['<!-- INIT:STAGE-A:GLOSSARY -->'],
      fallbackHeadings: ['# Domain Glossary', '## Terms']
    },
    {
      name: 'risk-open-questions.md',
      markers: ['<!-- INIT:STAGE-A:RISK -->'],
      fallbackHeadings: ['# Risks and Open Questions', '## Open questions']
    }
  ];

  const placeholderPatterns = [
    // Treat "<...>" as a template placeholder, but avoid flagging common Markdown autolinks.
    { re: /<(?!https?:\/\/|mailto:|!--)[^>\n]{1,80}>/gi, msg: 'template placeholder "<...>"' },
    { re: /^\s*[-*]\s*\.\.\.\s*$/gm, msg: 'placeholder bullet "- ..."' },
    { re: /:\s*\.\.\.\s*$/gm, msg: 'placeholder value ": ..."' }
  ];

  const missingFiles = [];

  for (const spec of required) {
    const fp = path.join(docsRoot, spec.name);
    if (!fs.existsSync(fp)) {
      missingFiles.push(spec.name);
      errors.push(`Missing required Stage A doc: ${path.relative(process.cwd(), fp)}`);
      continue;
    }
    const content = fs.readFileSync(fp, 'utf8');
    const scanText = stripMarkdownCode(content);

    const hasMarkers = (spec.markers || []).every((m) => content.includes(m));
    if (!hasMarkers) {
      const fallbackOk = (spec.fallbackHeadings || []).every((h) => content.includes(h));
      if (!fallbackOk) {
        errors.push(
          `${spec.name} is missing required template markers and does not match the expected template headings. Re-run "repair" to recreate templates (copy-if-missing), and keep the INIT markers.`
        );
      }
    }

    for (const pat of placeholderPatterns) {
      const hits = scanText.match(pat.re);
      if (hits && hits.length > 0) {
        errors.push(`${spec.name} still contains ${pat.msg}. Replace all template placeholders.`);
      }
    }

    // Soft signals
    if (scanText.includes('TODO') || scanText.includes('FIXME')) {
      warnings.push(`${spec.name} contains TODO/FIXME markers. Ensure they are tracked in risk-open-questions.md or removed.`);
    }
    if (/\bTBD\b/i.test(scanText)) {
      warnings.push(`${spec.name} contains TBD items. Ensure each TBD is linked to an owner/options/decision due.`);
    }
  }

  // Add hint if files are missing
  if (missingFiles.length > 0) {
    errors.push(`Hint: Run "repair" to recreate missing Stage A templates (copy-if-missing)`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

function ensureDir(dirPath, apply) {
  if (fs.existsSync(dirPath)) return { op: 'skip', path: dirPath, reason: 'exists' };
  if (!apply) return { op: 'mkdir', path: dirPath, mode: 'dry-run' };
  fs.mkdirSync(dirPath, { recursive: true });
  return { op: 'mkdir', path: dirPath, mode: 'applied' };
}

function writeFileIfMissing(filePath, content, apply) {
  if (fs.existsSync(filePath)) return { op: 'skip', path: filePath, reason: 'exists' };
  if (!apply) return { op: 'write', path: filePath, mode: 'dry-run' };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { op: 'write', path: filePath, mode: 'applied' };
}

function ensureSkillRetentionTemplate(repoRoot, apply) {
  const srcPath = path.join(TEMPLATES_DIR, 'skill-retention-table.template.md');
  const destPath = path.join(repoRoot, ...WORK_ROOT_SEGS, 'skill-retention-table.template.md');

  if (!fs.existsSync(srcPath)) {
    return { op: 'copy', path: destPath, mode: 'skipped', reason: 'template not found' };
  }
  if (fs.existsSync(destPath)) {
    return { op: 'copy', path: destPath, mode: 'skipped', reason: 'exists' };
  }
  if (!apply) return { op: 'copy', path: destPath, mode: 'dry-run' };
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  return { op: 'copy', path: destPath, mode: 'applied' };
}

function parseSkillRetentionDeletionList(markdown) {
  const warnings = [];
  const normalized = String(markdown || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let startIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^##\s+Deletion List\b/i.test(lines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }

  if (startIdx < 0) {
    warnings.push('Missing section: "## Deletion List" (no deletions will be applied).');
    return { deletions: [], warnings };
  }

  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i].trim())) {
      endIdx = i;
      break;
    }
  }

  const deletions = [];
  for (const line of lines.slice(startIdx, endIdx)) {
    const m = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (!m) continue;
    const v = m[1].trim();
    if (!v || v === '<skill-name>' || v === '...') continue;
    deletions.push(v);
  }

  return { deletions: uniq(deletions), warnings };
}

/**
 * Generates a project-specific README.md from the blueprint.
 * Replaces the template README with project information.
 */
function generateProjectReadme(repoRoot, blueprint, apply) {
  const readmePath = path.join(repoRoot, 'README.md');
  const templatePath = path.join(TEMPLATES_DIR, 'README.template.md');
  
  if (!fs.existsSync(templatePath)) {
    return { op: 'skip', path: readmePath, reason: 'template not found' };
  }
  
  let template = fs.readFileSync(templatePath, 'utf8');
  
  const project = blueprint.project || {};
  const repo = blueprint.repo || {};
  const caps = blueprint.capabilities || {};
  
  // Simple mustache-like replacement
  function replace(key, value) {
    template = template.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  
  function conditionalBlock(key, value, show) {
    const regex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
    if (show && value) {
      template = template.replace(regex, (_, content) => content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value));
    } else {
      template = template.replace(regex, '');
    }
  }
  
  // Basic replacements
  replace('PROJECT_NAME', project.name || 'my-project');
  replace('PROJECT_DESCRIPTION', project.description || 'Project description');
  replace('LANGUAGE', repo.language || 'typescript');
  replace('PACKAGE_MANAGER', repo.packageManager || 'pnpm');
  replace('REPO_LAYOUT', repo.layout || 'single');
  
  // Conditional blocks
  conditionalBlock('DOMAIN', project.domain, !!project.domain);
  conditionalBlock('FRONTEND_FRAMEWORK', caps.frontend?.framework, caps.frontend?.enabled);
  conditionalBlock('BACKEND_FRAMEWORK', caps.backend?.framework, caps.backend?.enabled);
  conditionalBlock('DATABASE_KIND', caps.database?.kind, caps.database?.enabled);
  conditionalBlock('API_STYLE', caps.api?.style, !!caps.api?.style);

  // Table-friendly values (avoid empty cells in README templates)
  replace('FRONTEND_FRAMEWORK', caps.frontend?.enabled ? (caps.frontend?.framework || 'TBD') : 'none');
  replace('BACKEND_FRAMEWORK', caps.backend?.enabled ? (caps.backend?.framework || 'TBD') : 'none');
  replace('DATABASE_KIND', caps.database?.enabled ? (caps.database?.kind || 'TBD') : 'none');
  replace('API_STYLE', caps.api?.style || 'none');
  
  // Language-specific blocks
  const isNode = ['typescript', 'javascript'].includes(repo.language);
  const isPython = repo.language === 'python';
  const isGo = repo.language === 'go';
  
  conditionalBlock('IS_NODE', 'true', isNode);
  conditionalBlock('IS_PYTHON', 'true', isPython);
  conditionalBlock('IS_GO', 'true', isGo);
  
  // Install and dev commands based on package manager
  const installCommands = {
    pnpm: 'pnpm install',
    npm: 'npm install',
    yarn: 'yarn',
    pip: 'pip install -r requirements.txt',
    poetry: 'poetry install',
    go: 'go mod download'
  };
  
  const devCommands = {
    pnpm: 'pnpm dev',
    npm: 'npm run dev',
    yarn: 'yarn dev',
    pip: 'python main.py',
    poetry: 'poetry run python main.py',
    go: 'go run .'
  };
  
  const testCommands = {
    pnpm: 'pnpm test',
    npm: 'npm test',
    yarn: 'yarn test',
    pip: 'pytest',
    poetry: 'poetry run pytest',
    go: 'go test ./...'
  };
  
  const pm = repo.packageManager || 'pnpm';
  replace('INSTALL_COMMAND', installCommands[pm] || installCommands.pnpm);
  replace('DEV_COMMAND', devCommands[pm] || devCommands.pnpm);
  replace('TEST_COMMAND', testCommands[pm] || testCommands.pnpm);
  
  // Project structure based on layout
  let structure;
  if (repo.layout === 'monorepo') {
    structure = `apps/
  frontend/        # Frontend application
  backend/         # Backend services
packages/
  shared/          # Shared libraries
.ai/skills/        # AI skills (SSOT)
docs/              # Documentation
ops/               # DevOps configuration`;
  } else {
    structure = `src/
  frontend/        # Frontend code
  backend/         # Backend code
.ai/skills/        # AI skills (SSOT)
docs/              # Documentation
ops/               # DevOps configuration`;
  }
  replace('PROJECT_STRUCTURE', structure);
  
  // Clean up any remaining empty conditional blocks
  template = template.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, '');
  template = template.replace(/\{\{\w+\}\}/g, '');
  
  // Clean up multiple empty lines
  template = template.replace(/\n{3,}/g, '\n\n');

  const rendered = template.trimEnd() + '\n';
  
  if (!apply) {
    return { op: 'render', path: readmePath, mode: 'dry-run', content: rendered };
  }
  
  fs.writeFileSync(readmePath, rendered, 'utf8');
  return { op: 'write', path: readmePath, mode: 'applied', content: rendered };
}

function splitLinesForDiff(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  const withoutTrailingNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (withoutTrailingNewline === '') return [];
  return withoutTrailingNewline.split('\n');
}

function lcsLineOps(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ op: 'equal', line: oldLines[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: 'delete', line: oldLines[i] });
      i += 1;
    } else {
      ops.push({ op: 'insert', line: newLines[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ op: 'delete', line: oldLines[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ op: 'insert', line: newLines[j] });
    j += 1;
  }
  return ops;
}

function unifiedDiff(oldText, newText, relPath) {
  const oldNorm = String(oldText || '').replace(/\r\n/g, '\n');
  const newNorm = String(newText || '').replace(/\r\n/g, '\n');
  if (oldNorm === newNorm) return '';

  const oldLines = splitLinesForDiff(oldNorm);
  const newLines = splitLinesForDiff(newNorm);
  const ops = lcsLineOps(oldLines, newLines);

  const out = [];
  out.push(`--- a/${relPath}`);
  out.push(`+++ b/${relPath}`);
  out.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
  for (const o of ops) {
    const prefix = o.op === 'equal' ? ' ' : o.op === 'delete' ? '-' : '+';
    out.push(prefix + o.line);
  }
  return out.join('\n') + '\n';
}

function techStackFromBlueprint(blueprint) {
  const repo = blueprint.repo || {};
  const caps = blueprint.capabilities || {};

  const layout = repo.layout || 'single';
  const language = repo.language || 'unknown';
  const packageManager = repo.packageManager || 'unknown';

  const frontend = caps.frontend?.enabled ? (caps.frontend?.framework || 'TBD') : 'none';
  const backend = caps.backend?.enabled ? (caps.backend?.framework || 'TBD') : 'none';
  const database = caps.database?.enabled ? (caps.database?.kind || 'TBD') : 'none';
  const api = (caps.api && typeof caps.api === 'object' && typeof caps.api.style === 'string') ? caps.api.style : 'none';

  return { layout, language, packageManager, frontend, backend, database, api };
}

function renderAgentsTechStackSection(blueprint) {
  const ts = techStackFromBlueprint(blueprint);
  return [
    '| Category | Value |',
    '|----------|-------|',
    `| Language | ${ts.language} |`,
    `| Package manager | ${ts.packageManager} |`,
    `| Repo layout | ${ts.layout} |`,
    `| Frontend | ${ts.frontend} |`,
    `| Backend | ${ts.backend} |`,
    `| Database | ${ts.database} |`,
    `| API style | ${ts.api} |`,
  ];
}

function deriveProjectDirectories(blueprint) {
  const repo = blueprint.repo || {};
  const layout = String(repo.layout || 'single').toLowerCase();
  if (layout === 'monorepo') {
    return [
      { dir: '`apps/`', purpose: 'Applications', entry: '-' },
      { dir: '`packages/`', purpose: 'Shared packages', entry: '-' },
    ];
  }
  return [{ dir: '`src/`', purpose: 'Application source code', entry: '-' }];
}

function parseKeyDirectoriesTable(lines, sectionStartIdx) {
  // Find first table row after the "## Key Directories" heading.
  let tableStart = -1;
  for (let i = sectionStartIdx + 1; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (/^##\s+/.test(t)) break;
    if (t.startsWith('|')) {
      tableStart = i;
      break;
    }
  }
  if (tableStart < 0) return { tableStart: -1, tableEnd: -1, rows: [] };

  let tableEnd = tableStart;
  for (let i = tableStart; i < lines.length; i += 1) {
    if (!lines[i].trim().startsWith('|')) break;
    tableEnd = i;
  }

  const rows = [];
  // Skip header + separator (first 2 lines).
  for (let i = tableStart + 2; i <= tableEnd; i += 1) {
    const raw = lines[i];
    const cells = raw.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 3) continue;
    rows.push({ dir: cells[0], purpose: cells[1], entry: cells[2] });
  }

  return { tableStart, tableEnd, rows };
}

function upsertSection(lines, headingRegex, newSectionLines, insertAfterRegex) {
  const headingIdx = lines.findIndex((l) => headingRegex.test(l.trim()));
  if (headingIdx >= 0) {
    let endIdx = lines.length;
    for (let i = headingIdx + 1; i < lines.length; i += 1) {
      if (/^##\s+/.test(lines[i].trim())) {
        endIdx = i;
        break;
      }
    }
    const before = lines.slice(0, headingIdx);
    const after = lines.slice(endIdx);
    return { lines: [...before, ...newSectionLines, ...after], changed: true };
  }

  const insertAfterIdx = lines.findIndex((l) => insertAfterRegex.test(l.trim()));
  if (insertAfterIdx < 0) {
    return { lines: [...lines, '', ...newSectionLines], changed: true };
  }
  let insertEnd = lines.length;
  for (let i = insertAfterIdx + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i].trim())) {
      insertEnd = i;
      break;
    }
  }
  const before = lines.slice(0, insertEnd);
  const after = lines.slice(insertEnd);
  return { lines: [...before, '', ...newSectionLines, ...after], changed: true };
}

function upsertManagedBlock(raw, start, end, content) {
  const block = String(content || '').trimEnd();
  if (!raw.includes(start) || !raw.includes(end)) {
    return (raw || '').trimEnd() + `\n\n${start}\n${block}\n${end}\n`;
  }
  const before = raw.split(start)[0];
  const after = raw.split(end)[1];
  return `${before}${start}\n${block}\n${end}${after}`;
}

function renderUpdatedRootAgentsMd(raw, blueprint) {
  const project = blueprint.project || {};
  const projectName = String(project.name || 'my-project').trim() || 'my-project';
  const projectDescription = String(project.description || 'Project description').trim() || 'Project description';

  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  let lines = normalized.split('\n');

  // Replace everything between the top title and "## Project Type" with a project summary line.
  const titleIdx = lines.findIndex((l) => /^#\s+/.test(l.trim()));
  const projectTypeIdx = lines.findIndex((l) => /^##\s+Project Type\b/.test(l.trim()));
  if (titleIdx >= 0 && projectTypeIdx > titleIdx) {
    const before = lines.slice(0, titleIdx + 1);
    const after = lines.slice(projectTypeIdx);
    lines = [...before, '', `**${projectName}** - ${projectDescription}`, '', ...after];
  }

  // Update "## Project Type" section body.
  {
    const headingIdx = lines.findIndex((l) => /^##\s+Project Type\b/.test(l.trim()));
    if (headingIdx >= 0) {
      let endIdx = lines.length;
      for (let i = headingIdx + 1; i < lines.length; i += 1) {
        if (/^##\s+/.test(lines[i].trim())) {
          endIdx = i;
          break;
        }
      }
      const before = lines.slice(0, headingIdx + 1);
      const after = lines.slice(endIdx);
      lines = [...before, '', `${projectName} - ${projectDescription}`, '', ...after];
    }
  }

  // Upsert "## Tech Stack" after "## Project Type".
  {
    const techStackSection = [
      '## Tech Stack',
      '',
      ...renderAgentsTechStackSection(blueprint),
      '',
    ];
    const res = upsertSection(lines, /^##\s+Tech Stack\b/, techStackSection, /^##\s+Project Type\b/);
    lines = res.lines;
  }

  // Update "## Key Directories" table (add code dirs first, preserve existing rows).
  {
    const keyDirIdx = lines.findIndex((l) => /^##\s+Key Directories\b/.test(l.trim()));
    if (keyDirIdx >= 0) {
      const parsed = parseKeyDirectoriesTable(lines, keyDirIdx);
      if (parsed.tableStart >= 0) {
        const existingRows = parsed.rows;
        const existingByDir = new Map(existingRows.map((r) => [r.dir, r]));

        const derived = deriveProjectDirectories(blueprint);
        const mergedRows = [];
        for (const r of derived) {
          if (!existingByDir.has(r.dir)) mergedRows.push(r);
        }
        for (const r of existingRows) mergedRows.push(r);

        const tableLines = [
          '| Directory | Purpose | Entry Point |',
          '|-----------|---------|-------------|',
          ...mergedRows.map((r) => `| ${r.dir} | ${r.purpose} | ${r.entry} |`),
        ];

        const before = lines.slice(0, keyDirIdx + 1);
        const after = lines.slice(parsed.tableEnd + 1);
        lines = [...before, '', ...tableLines, '', ...after];
      }
    }
  }

  let next = lines.join('\n').trimEnd() + '\n';

  // Update managed DB SSOT block if present.
  try {
	    const start = '<!-- DB-SSOT:START -->';
	    const end = '<!-- DB-SSOT:END -->';
	    const mode = dbSsotMode(blueprint);
	    const block = renderDbSsotAgentsBlock(mode, isContextAwarenessEnabled(blueprint)).trimEnd();
	    next = upsertManagedBlock(next, start, end, block);
	  } catch {
	    // ignore
	  }

  next = next.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  return next;
}

function copyFileIfMissing(srcPath, destPath, apply) {
  if (fs.existsSync(destPath)) {
    return { op: 'skip', path: destPath, reason: 'exists' };
  }
  if (!fs.existsSync(srcPath)) {
    return { op: 'skip', path: destPath, reason: 'source not found', srcPath };
  }
  if (!apply) {
    return { op: 'copy-template', from: srcPath, path: destPath, mode: 'dry-run' };
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  return { op: 'copy-template', from: srcPath, path: destPath, mode: 'applied' };
}

function listFilesRecursive(dir) {
  const out = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  }
  walk(dir);
  return out;
}

function copyDirIfMissing(srcDir, destDir, apply, force = false) {
  const actions = [];
  if (!fs.existsSync(srcDir)) {
    return { ok: false, actions, error: `source directory not found: ${srcDir}` };
  }

  const files = listFilesRecursive(srcDir);
  for (const srcFile of files) {
    const rel = path.relative(srcDir, srcFile);
    const destFile = path.join(destDir, rel);

    // Ensure parent directory exists
    const parent = path.dirname(destFile);
    if (!fs.existsSync(parent)) {
      if (!apply) {
        actions.push({ op: 'mkdir', path: parent, mode: 'dry-run', note: `parent ${path.relative(destDir, parent)}` });
      } else {
        fs.mkdirSync(parent, { recursive: true });
        actions.push({ op: 'mkdir', path: parent, mode: 'applied', note: `parent ${path.relative(destDir, parent)}` });
      }
    }

    if (fs.existsSync(destFile) && !force) {
      actions.push({ op: 'skip', path: destFile, reason: 'exists' });
      continue;
    }

    if (!apply) {
      actions.push({ op: force ? 'overwrite' : 'copy', from: srcFile, to: destFile, mode: 'dry-run' });
      continue;
    }

    fs.copyFileSync(srcFile, destFile);
    actions.push({ op: force ? 'overwrite' : 'copy', from: srcFile, to: destFile, mode: 'applied' });
  }

  return { ok: true, actions };
}

function findFeatureTemplatesDir(repoRoot, featureId) {
  const id = String(featureId || '');
  const dash = id.replace(/_/g, '-');

  // Some feature IDs may source templates from a different skill location.
  const overrides = new Map([
    ['database', path.join(repoRoot, '.ai', 'skills', 'features', 'database', 'sync-code-schema-from-db', 'templates')],
  ]);
  const override = overrides.get(dash);
  if (override && fs.existsSync(override) && fs.statSync(override).isDirectory()) return override;

  const candidates = [
    // preferred (single-level feature folder)
    path.join(repoRoot, '.ai', 'skills', 'features', dash, 'templates'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return null;
}

function runNodeScript(repoRoot, scriptPath, args, apply) {
  const cmd = 'node';
  const fullArgs = [scriptPath, ...args];
  const printable = `${cmd} ${fullArgs.join(' ')}`;

  if (!apply) return { op: 'run', cmd: printable, mode: 'dry-run' };

  const res = spawnSyncForOutput(cmd, fullArgs, { cwd: repoRoot });
  if (res.status !== 0) {
    return attachSpawnOutput(res, { op: 'run', cmd: printable, mode: 'failed', exitCode: res.status });
  }
  return attachSpawnOutput(res, { op: 'run', cmd: printable, mode: 'applied' });
}

function runNodeScriptWithRepoRootFallback(repoRoot, scriptPath, args, apply) {
  const first = runNodeScript(repoRoot, scriptPath, args, apply);
  if (!apply) return first;

  if (first && first.mode === 'failed' && args.includes('--repo-root')) {
    // Some scripts may not accept --repo-root; retry without it (cwd is already repoRoot).
    const altArgs = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--repo-root') {
        i++; // skip value
        continue;
      }
      altArgs.push(args[i]);
    }
    const second = runNodeScript(repoRoot, scriptPath, altArgs, apply);
    second.note = 'fallback: retried without --repo-root';
    return second;
  }
  return first;
}


function getContextMode(blueprint) {
  const mode = ((blueprint.context && blueprint.context.mode) || '').toLowerCase();
  if (mode === 'snapshot' || mode === 'contract') return mode;
  return 'contract';
}

function ciProvider(blueprint) {
  const ci = blueprint && blueprint.ci && typeof blueprint.ci === 'object' ? blueprint.ci : {};
  const provider = String(ci.provider || '').trim().toLowerCase();
  if (provider === 'github' || provider === 'gitlab') return provider;

  // Compatibility hint: allow derivation from ci.platform when present.
  const platform = String(ci.platform || '').trim().toLowerCase();
  if (platform === 'github-actions') return 'github';
  if (platform === 'gitlab-ci') return 'gitlab';

  return null;
}



// ============================================================================
// DB SSOT helpers (mutually exclusive schema synchronization modes)
// ============================================================================

function dbSsotMode(blueprint) {
  const db = blueprint && blueprint.db ? blueprint.db : {};
  return String(db.ssot || 'none');
}

function toPosixRelativePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizeRepoRelativePath(value) {
  const raw = toPosixRelativePath(value).trim();
  if (!raw) return '';
  return path.posix.normalize(raw);
}

function isSafeRepoRelativePath(value) {
  const normalized = normalizeRepoRelativePath(value);
  if (!normalized) return false;
  if (path.posix.isAbsolute(normalized)) return false;
  return normalized !== '..' && !normalized.startsWith('../');
}

function configuredConvexSourcePathFromDbConfig(db) {
  if (!db || typeof db !== 'object') return 'convex/schema.ts';
  const source = db.source && typeof db.source === 'object' ? db.source : {};
  const configured = typeof source.path === 'string' ? normalizeRepoRelativePath(source.path) : '';
  return configured || 'convex/schema.ts';
}

function configuredConvexGeneratedTypesDir(sourcePath) {
  return path.posix.join(path.posix.dirname(sourcePath || 'convex/schema.ts'), '_generated');
}

function dbSsotExclusionsForMode(mode) {
  const m = String(mode || 'none');
  if (m === 'repo-prisma') return ['sync-code-schema-from-db', 'convex-as-ssot', 'convex-best-practices'];
  if (m === 'database') return ['sync-db-schema-from-code', 'convex-as-ssot', 'convex-best-practices'];
  if (m === 'convex') return ['sync-db-schema-from-code', 'sync-code-schema-from-db'];
  // 'none' (opt-out) => exclude all DB sync skills
  return ['sync-db-schema-from-code', 'sync-code-schema-from-db', 'convex-as-ssot', 'convex-best-practices'];
}

function writeDbSsotConfig(repoRoot, blueprint, apply) {
  const mode = dbSsotMode(blueprint);
  const outPath = path.join(repoRoot, 'docs', 'project', 'db-ssot.json');
  const db = blueprint && blueprint.db && typeof blueprint.db === 'object' ? blueprint.db : {};
  const kind = String(db.kind || (mode === 'convex' ? 'convex' : 'other'));
  const convexSourcePath = configuredConvexSourcePathFromDbConfig(db);
  const convexGeneratedTypesDir = configuredConvexGeneratedTypesDir(convexSourcePath);

  let source;
  if (mode === 'repo-prisma') {
    source = { kind: 'prisma-schema', path: 'prisma/schema.prisma' };
  } else if (mode === 'database') {
    source = { kind: 'db-mirror', path: 'db/schema/tables.json' };
  } else if (mode === 'convex') {
    source = { kind: 'convex-schema', path: convexSourcePath };
  } else {
    source = { kind: 'none', path: '' };
  }

  const cfg = {
    version: 1,
    updatedAt: new Date().toISOString(),
    mode,
    policy: {
      managedPaths: 'fixed-defaults-v1'
    },
    paths: {
      prismaSchema: 'prisma/schema.prisma',
      dbSchemaTables: 'db/schema/tables.json',
      dbContextContract: 'docs/context/db/schema.json',
      convexSchema: mode === 'convex' ? convexSourcePath : 'convex/schema.ts',
      convexFunctionsContract: 'docs/context/convex/functions.json'
    },
    db: {
      ssot: mode,
      kind,
      source,
      contracts: {
        dbSchema: 'docs/context/db/schema.json',
        convexFunctions: mode === 'convex' ? 'docs/context/convex/functions.json' : null
      },
      generated: {
        typesDir: mode === 'convex' ? convexGeneratedTypesDir : null
      }
    }
  };

  if (mode === 'convex') {
    cfg.db.runtime = {
      deploymentEnvVar: 'CONVEX_DEPLOYMENT',
      urlEnvVarCandidates: ['NEXT_PUBLIC_CONVEX_URL', 'VITE_CONVEX_URL', 'CONVEX_URL']
    };
  }

  if (!apply) {
    return { op: 'write', path: outPath, mode: 'dry-run', note: `db.ssot=${mode}` };
  }

  writeJson(outPath, cfg);
  return { op: 'write', path: outPath, mode: 'applied', note: `db.ssot=${mode}` };
}

function ensureDbSsotConfig(repoRoot, blueprint, apply) {
  // Writes docs/project/db-ssot.json reflecting the selected db.ssot mode.
  return writeDbSsotConfig(repoRoot, blueprint, apply);
}

function renderDbSsotAgentsBlock(mode, contextAwarenessEnabled, options = {}) {
  const m = String(mode || 'none');
  const hasContext = !!contextAwarenessEnabled;
  const convexSourcePath = options.convexSourcePath || 'convex/schema.ts';
  const convexFunctionsGlob = `${path.posix.dirname(convexSourcePath)}/**/*.ts`;

  // Progressive disclosure: minimal routing first, details as nested bullets.
  const header = `## Database SSOT and schema synchronization

`;

  const common = [
    `- SSOT selection file: \`docs/project/db-ssot.json\``,
    `- DB context contract (generated, LLM-first): \`docs/context/db/schema.json\`${hasContext ? '' : ' (requires `features.contextAwareness=true`)'}`
  ];

  if (m === 'repo-prisma') {
    return (
      header +
      `**Mode: repo-prisma** (SSOT = \`prisma/schema.prisma\`)

` +
      common.join('\n') +
      `
- If you need to change persisted fields / tables: use skill \`sync-db-schema-from-code\`.
` +
      `- If you need to mirror an external DB: do NOT; this mode assumes migrations originate in the repo.

` +
      `Rules:
- Business layer MUST NOT import Prisma (repositories return domain entities).
- Database workflows in this repo require \`features.contextAwareness=true\`.
- Refresh generated DB context via \`node .ai/scripts/ctl-db-ssot.mjs sync-to-context\`.
`
    );
  }

  if (m === 'database') {
    return (
      header +
      `**Mode: database** (SSOT = running database)

` +
      common.join('\n') +
      `
- If the DB schema changed: use skill \`sync-code-schema-from-db\` (DB -> Prisma -> mirror -> context).
` +
      `- Do NOT hand-edit \`prisma/schema.prisma\` or \`db/schema/tables.json\` as desired-state.

` +
      `Rules:
- Human runs \`prisma db pull\` against the correct environment.
- Mirror update: \`node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs import-prisma\`.
- Database workflows in this repo require \`features.contextAwareness=true\`.
- Refresh generated DB context via \`node .ai/scripts/ctl-db-ssot.mjs sync-to-context\`.
`
    );
  }

  if (m === 'convex') {
    return (
      header +
      `**Mode: convex** (SSOT = \`${convexSourcePath}\`; function surface = \`${convexFunctionsGlob}\`)

` +
      common.join('\n') +
      `
- Convex function contract: \`docs/context/convex/functions.json\`
- If you need to change persisted fields / indexes: use skill \`convex-as-ssot\`.
- If you need to add or review Convex functions: use skill \`convex-best-practices\`.
- Human-friendly DB queries and change drafting still route through \`db-human-interface\`.

Rules:
- Treat \`${convexSourcePath}\` as the persistence SSOT.
- Stage C bootstraps \`convex/\` by default, or the configured nested path when \`db.source.path\` is provided in the blueprint.
- Treat \`docs/context/db/schema.json\` and \`docs/context/convex/functions.json\` as generated artifacts.
- Database workflows in this repo require \`features.contextAwareness=true\`.
- Refresh contracts via \`node .ai/scripts/ctl-db-ssot.mjs sync-to-context\`.
`
    );
  }

  // none
  return (
    header +
    `**Mode: none** (no managed DB SSOT in this repo)

` +
    common.join('\n') +
    `
- DB sync skills are disabled. Document DB changes in db/handbook/ and ask a human to provide a schema snapshot.
`
  );
}

function updateRootAgentsDbSsotBlock(repoRoot, blueprint, apply) {
  const agentsPath = path.join(repoRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    return { op: 'edit', path: agentsPath, mode: apply ? 'skipped' : 'dry-run', reason: 'AGENTS.md not found' };
  }

  const start = '<!-- DB-SSOT:START -->';
  const end = '<!-- DB-SSOT:END -->';
  const raw = fs.readFileSync(agentsPath, 'utf8');
  if (!raw.includes(start) || !raw.includes(end)) {
    return { op: 'edit', path: agentsPath, mode: apply ? 'skipped' : 'dry-run', reason: 'DB-SSOT markers missing' };
  }

  const mode = dbSsotMode(blueprint);
  const block = renderDbSsotAgentsBlock(
    mode,
    isContextAwarenessEnabled(blueprint),
    {
      convexSourcePath: configuredConvexSourcePathFromDbConfig(
        blueprint && blueprint.db && typeof blueprint.db === 'object' ? blueprint.db : {}
      )
    }
  ).trimEnd();
  const next = upsertManagedBlock(raw, start, end, block);
  if (next === raw) {
    return { op: 'edit', path: agentsPath, mode: 'skipped', reason: 'unchanged', note: `db.ssot=${mode}` };
  }

  if (!apply) {
    return { op: 'edit', path: agentsPath, mode: 'dry-run', note: `db.ssot=${mode}` };
  }

  fs.writeFileSync(agentsPath, next, 'utf8');
  return { op: 'edit', path: agentsPath, mode: 'applied', note: `db.ssot=${mode}` };
}

function applyDbSsotSkillExclusions(repoRoot, blueprint, apply) {
  const mode = dbSsotMode(blueprint);
  const manifestPath = path.join(repoRoot, '.ai', 'skills', '_meta', 'sync-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { op: 'edit', path: manifestPath, mode: apply ? 'failed' : 'dry-run', note: 'manifest missing' };
  }

  const manifest = readJson(manifestPath);
  const existing = Array.isArray(manifest.excludeSkills) ? manifest.excludeSkills.map(String) : [];
  const cleaned = existing.filter((s) => !['sync-db-schema-from-code', 'sync-code-schema-from-db', 'convex-as-ssot', 'convex-best-practices'].includes(s));
  const desired = dbSsotExclusionsForMode(mode);
  manifest.excludeSkills = uniq([...cleaned, ...desired]);

  if (!apply) {
    return { op: 'edit', path: manifestPath, mode: 'dry-run', note: `excludeSkills += ${desired.join(', ')}` };
  }

  writeJson(manifestPath, manifest);
  return { op: 'edit', path: manifestPath, mode: 'applied', note: `excludeSkills += ${desired.join(', ')}` };
}

function refreshDbContextContract(repoRoot, blueprint, apply) {
  const outPath = path.join(repoRoot, 'docs', 'context', 'db', 'schema.json');

  // DB workflows require context-awareness; keep this guard for defensive use.
  if (!isContextAwarenessEnabled(blueprint)) {
    return {
      op: 'skip',
      path: outPath,
      mode: apply ? 'skipped' : 'dry-run',
      reason: 'context-awareness feature not enabled'
    };
  }

  const dbSsotCtl = path.join(repoRoot, '.ai', 'scripts', 'ctl-db-ssot.mjs');
  if (!fs.existsSync(dbSsotCtl)) {
    return {
      op: 'skip',
      path: outPath,
      mode: apply ? 'failed' : 'dry-run',
      reason: 'ctl-db-ssot.mjs not found'
    };
  }

  const run1 = runNodeScript(repoRoot, dbSsotCtl, ['sync-to-context', '--repo-root', repoRoot], apply);
  return { op: 'db-context-refresh', path: outPath, mode: apply ? 'applied' : 'dry-run', actions: [run1] };
}

function verifyDatabaseFeatureAfterContext(repoRoot, blueprint, apply) {
  const mode = dbSsotMode(blueprint);
  const result = { op: 'verify-db-feature', mode: apply ? 'skipped' : 'dry-run', actions: [], warnings: [], errors: [] };
  let scriptPath = null;
  let verifyArgs = ['verify', '--repo-root', repoRoot];

  if (mode === 'database') {
    scriptPath = path.join(
      repoRoot,
      '.ai',
      'skills',
      'features',
      'database',
      'sync-code-schema-from-db',
      'scripts',
      'ctl-db.mjs'
    );
  } else if (mode === 'convex') {
    scriptPath = path.join(
      repoRoot,
      '.ai',
      'skills',
      'features',
      'database',
      'convex-as-ssot',
      'scripts',
      'ctl-convex.mjs'
    );
    verifyArgs.push('--strict');
  } else {
    result.reason = `no post-context verify for db.ssot=${mode}`;
    return result;
  }

  if (!fs.existsSync(scriptPath)) {
    result.mode = apply ? 'failed' : 'dry-run';
    result.errors.push(`Database feature control script not found: ${path.relative(repoRoot, scriptPath)}`);
    return result;
  }

  const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, scriptPath, verifyArgs, apply);
  result.actions.push(verifyRes);
  result.mode = verifyRes.mode === 'failed' ? 'failed' : (apply ? 'applied' : 'dry-run');
  return result;
}


// ============================================================================
// Feature Detection Functions
// ============================================================================

function iacTool(blueprint) {
  const iac = blueprint && typeof blueprint === 'object' && typeof blueprint.iac === 'object' ? blueprint.iac : {};
  const tool = typeof iac.tool === 'string' ? iac.tool.trim().toLowerCase() : 'none';
  return tool || 'none';
}

function isDatabaseEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; db.* is configuration only.
  return flags.database === true;
}

function isUiEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  return flags.ui === true;
}

function isEnvironmentEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  return flags.environment === true;
}

function isIacEnabled(blueprint) {
  const tool = iacTool(blueprint);
  if (tool && tool !== 'none') return true;
  const flags = featureFlags(blueprint);
  return flags.iac === true;
}

function isPackagingEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; packaging.* is configuration only
  return flags.packaging === true;
}

function isDeploymentEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; deploy.* is configuration only
  return flags.deployment === true;
}

function isReleaseEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; release.* is configuration only
  return flags.release === true;
}

function isObservabilityEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; observability.* is configuration only
  return flags.observability === true;
}

function isCiEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; ci.* is configuration only
  return flags.ci === true;
}

// ============================================================================
// Feature Materialization (templates + ctl scripts)
// ============================================================================

function findFeatureCtlScript(repoRoot, featureId, ctlScriptName) {
  if (!ctlScriptName) return null;

  const dash = String(featureId || '').replace(/_/g, '-');
  const candidates = [
    // preferred: feature-local controller
    path.join(repoRoot, '.ai', 'skills', 'features', dash, 'scripts', ctlScriptName),
    // back-compat: repo-level controller
    path.join(repoRoot, '.ai', 'scripts', ctlScriptName),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // Default expected path for error messages
  return candidates[0];
}

function ensureFeature(repoRoot, featureId, apply, ctlScriptName, options = {}) {
  const { force = false, verify = false, stateKey } = options;
  const result = { featureId, op: 'ensure', actions: [], warnings: [], errors: [] };

  const templatesDir = findFeatureTemplatesDir(repoRoot, featureId);
  if (!templatesDir) {
    const expectedHint =
      String(featureId) === 'database'
        ? '.ai/skills/features/database/sync-code-schema-from-db/templates/'
        : `.ai/skills/features/${featureId}/templates/`;
    result.errors.push(
      `Feature "${featureId}" is enabled but templates were not found. Expected: ${expectedHint}`
    );
    return result;
  }

  const copyRes = copyDirIfMissing(templatesDir, repoRoot, apply, force);
  if (!copyRes.ok) {
    result.errors.push(copyRes.error || `Failed to copy templates for feature "${featureId}".`);
    return result;
  }
  result.actions.push({
    op: force ? 'reinstall-feature' : 'install-feature',
    featureId,
    from: templatesDir,
    to: repoRoot,
    mode: apply ? 'applied' : 'dry-run'
  });
  result.actions.push(...copyRes.actions);

  // Mark feature enabled in project state (best-effort)
  const projectStateCtl = path.join(repoRoot, '.ai', 'scripts', 'ctl-project-state.mjs');
  if (fs.existsSync(projectStateCtl)) {
    const key = stateKey || featureId;
    result.actions.push(
      runNodeScriptWithRepoRootFallback(repoRoot, projectStateCtl, ['set', `features.${key}`, 'true', '--repo-root', repoRoot], apply)
    );
  } else {
    result.warnings.push('ctl-project-state.mjs not found; skipping .ai/project feature flag update.');
  }

  // Optional: run feature controller init/verify (best-effort)
  if (ctlScriptName) {
    const ctlPath = findFeatureCtlScript(repoRoot, featureId, ctlScriptName);
    if (fs.existsSync(ctlPath)) {
      result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, ctlPath, ['init', '--repo-root', repoRoot], apply));
      if (verify && apply) {
        const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, ctlPath, ['verify', '--repo-root', repoRoot], apply);
        result.actions.push(verifyRes);
        if (verifyRes.mode === 'failed') {
          result.verifyFailed = true;
          result.verifyError = `Feature "${featureId}" verify failed`;
        }
      }
    } else if (apply) {
      const expected = path.relative(repoRoot, ctlPath);
      result.errors.push(`Feature "${featureId}" control script not found: ${expected}`);
    }
  }

  return result;
}

function markProjectFeature(repoRoot, featureKey, apply) {
  const projectStateCtl = path.join(repoRoot, '.ai', 'scripts', 'ctl-project-state.mjs');
  if (!fs.existsSync(projectStateCtl)) {
    return { op: 'skip', path: projectStateCtl, mode: apply ? 'skipped' : 'dry-run', reason: 'ctl-project-state.mjs not found' };
  }
  return runNodeScriptWithRepoRootFallback(
    repoRoot,
    projectStateCtl,
    ['set', `features.${featureKey}`, 'true', '--repo-root', repoRoot],
    apply
  );
}

function runPythonScript(repoRoot, scriptPath, args, apply) {
  const fullArgs = ['-B', '-S', scriptPath, ...args];
  const isWin = process.platform === 'win32';
  const candidates = isWin
    ? [
        { cmd: 'py', prefix: ['-3'] },
        { cmd: 'python3', prefix: [] },
        { cmd: 'python', prefix: [] }
      ]
    : [
        { cmd: 'python3', prefix: [] },
        { cmd: 'python', prefix: [] }
      ];

  const formatCmd = (c) => `${c.cmd} ${[...(c.prefix || []), ...fullArgs].join(' ')}`.trim();
  const printable = formatCmd(candidates[0]);
  const tryList = candidates
    .map((c) => {
      const prefix = (c.prefix || []).join(' ');
      return prefix ? `${c.cmd} ${prefix}` : c.cmd;
    })
    .join(', ');

  if (!apply) return { op: 'run', cmd: printable, mode: 'dry-run', note: `will try ${tryList}` };

  for (const c of candidates) {
    const res = spawnSyncForOutput(c.cmd, [...(c.prefix || []), ...fullArgs], { cwd: repoRoot });
    if (res.error && res.error.code === 'ENOENT') continue; // try next candidate
    // Windows: python3/python may be a Microsoft Store alias; treat 9009 as "not found".
    if (isWin && res.status === 9009) continue;
    if (res.status !== 0) {
      return attachSpawnOutput(res, { op: 'run', cmd: formatCmd(c), mode: 'failed', exitCode: res.status });
    }
    return attachSpawnOutput(res, { op: 'run', cmd: formatCmd(c), mode: 'applied' });
  }

  return { op: 'run', cmd: printable, mode: 'failed', reason: `python interpreter not found (tried ${tryList})` };
}

function ensureDatabaseFeature(repoRoot, blueprint, apply, options = {}) {
  const { force = false, verify = false } = options;
  const mode = dbSsotMode(blueprint);

  const result = {
    enabled: true,
    featureId: 'database',
    op: 'ensure',
    actions: [],
    warnings: [],
    errors: []
  };

  // Always mark enabled in project state (best-effort)
  result.actions.push(markProjectFeature(repoRoot, 'database', apply));

  if (mode === 'database') {
    // In DB SSOT mode, materialize db/ mirrors and run the DB mirror controller (feature-local).
    const res = ensureFeature(repoRoot, 'database', apply, null, { force, verify, stateKey: 'database' });
    result.actions.push(res);
    if (res.errors && res.errors.length > 0) result.errors.push(...res.errors);
    if (res.warnings && res.warnings.length > 0) result.warnings.push(...res.warnings);

    const dbctlPath = path.join(
      repoRoot,
      '.ai',
      'skills',
      'features',
      'database',
      'sync-code-schema-from-db',
      'scripts',
      'ctl-db.mjs'
    );

    if (fs.existsSync(dbctlPath)) {
      result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, dbctlPath, ['init', '--repo-root', repoRoot], apply));
    } else if (apply) {
      result.errors.push(`Feature "database" control script not found: ${path.relative(repoRoot, dbctlPath)}`);
    }

    return result;
  }

  if (mode === 'repo-prisma') {
    // In repo-prisma mode, do not install db/ mirrors; ensure prisma/ exists as a convention anchor.
    result.actions.push(ensureDir(path.join(repoRoot, 'prisma'), apply));
    return result;
  }

  if (mode === 'convex') {
    const templatesDir = path.join(
      repoRoot,
      '.ai',
      'skills',
      'features',
      'database',
      'convex-as-ssot',
      'templates'
    );
    if (!fs.existsSync(templatesDir)) {
      result.errors.push(`Feature "database" Convex templates not found: ${path.relative(repoRoot, templatesDir)}`);
      return result;
    }

    result.actions.push({
      op: force ? 'reinstall-feature' : 'install-feature',
      featureId: 'database-convex',
      from: templatesDir,
      to: repoRoot,
      mode: apply ? 'applied' : 'dry-run',
      note: 'delegated to ctl-convex init so schema files land at the configured Convex source path'
    });
    result.actions.push(writeDbSsotConfig(repoRoot, blueprint, apply));

    const ctlPath = path.join(
      repoRoot,
      '.ai',
      'skills',
      'features',
      'database',
      'convex-as-ssot',
      'scripts',
      'ctl-convex.mjs'
    );

    if (fs.existsSync(ctlPath)) {
      result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, ctlPath, ['init', '--repo-root', repoRoot], apply));
    } else if (apply) {
      result.errors.push(`Feature "database" control script not found: ${path.relative(repoRoot, ctlPath)}`);
    }

    return result;
  }

  // mode === 'none' (should be rejected by validateBlueprint when feature is enabled)
  result.warnings.push('db.ssot=none: database feature has nothing to materialize.');
  return result;
}

function ensureUiFeature(repoRoot, blueprint, apply, options = {}) {
  const { force = false, verify = false } = options;
  const result = { enabled: true, featureId: 'ui', op: 'ensure', actions: [], warnings: [], errors: [] };

  result.actions.push(markProjectFeature(repoRoot, 'ui', apply));

  const script = path.join(repoRoot, '.ai', 'skills', 'features', 'ui', 'ui-system-bootstrap', 'scripts', 'ui_specctl.py');
  if (!fs.existsSync(script)) {
    result.errors.push(`UI feature script not found: ${path.relative(repoRoot, script)}`);
    return result;
  }

  const initArgs = ['init'];
  if (force) initArgs.push('--force');
  result.actions.push(runPythonScript(repoRoot, script, initArgs, apply));

  if (verify && apply) {
    result.actions.push(runPythonScript(repoRoot, script, ['codegen'], apply));
    const v = runPythonScript(repoRoot, script, ['validate'], apply);
    result.actions.push(v);
    if (v.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'UI feature verify failed';
    }
  }

  return result;
}

function ensureEnvironmentFeature(repoRoot, blueprint, apply, options = {}) {
  const { force = false, verify = false } = options;
  const result = { enabled: true, featureId: 'environment', op: 'ensure', actions: [], warnings: [], errors: [] };

  result.actions.push(markProjectFeature(repoRoot, 'environment', apply));

  const script = path.join(repoRoot, '.ai', 'skills', 'features', 'environment', 'env-contractctl', 'scripts', 'env_contractctl.py');
  if (!fs.existsSync(script)) {
    result.errors.push(`Environment feature script not found: ${path.relative(repoRoot, script)}`);
    return result;
  }

  // init is conservative: it won't overwrite unless --force is passed.
  const initArgs = ['init', '--root', repoRoot];
  if (force) initArgs.push('--force');
  result.actions.push(runPythonScript(repoRoot, script, initArgs, apply));

  if (verify && apply) {
    const validateRes = runPythonScript(repoRoot, script, ['validate', '--root', repoRoot], apply);
    result.actions.push(validateRes);
    if (validateRes.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'Environment feature validate failed';
      return result;
    }
    const genRes = runPythonScript(repoRoot, script, ['generate', '--root', repoRoot], apply);
    result.actions.push(genRes);
    if (genRes.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'Environment feature generate failed';
    }
  }

  return result;
}

function ensureIacFeature(repoRoot, blueprint, apply, options = {}) {
  const { verify = false } = options;
  const result = { enabled: true, featureId: 'iac', op: 'ensure', actions: [], warnings: [], errors: [] };

  result.actions.push(markProjectFeature(repoRoot, 'iac', apply));

  const tool = iacTool(blueprint);
  if (!tool || tool === 'none') {
    result.errors.push('IaC feature enabled but iac.tool is none. Set iac.tool to "ros", "terraform", or "opentofu".');
    return result;
  }

  const script = path.join(repoRoot, '.ai', 'skills', 'features', 'iac', 'scripts', 'ctl-iac.mjs');
  if (!fs.existsSync(script)) {
    result.errors.push(`IaC feature script not found: ${path.relative(repoRoot, script)}`);
    return result;
  }

  result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, script, ['init', '--tool', tool, '--repo-root', repoRoot], apply));

  if (verify && apply) {
    const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, script, ['verify', '--repo-root', repoRoot, '--tool', tool], apply);
    result.actions.push(verifyRes);
    if (verifyRes.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'IaC feature verify failed';
    }
  }

  return result;
}

function ensureCiFeature(repoRoot, blueprint, apply, options = {}) {
  const { verify = false } = options;
  const enabled = isCiEnabled(blueprint);
  const result = { enabled, featureId: 'ci', op: enabled ? 'ensure' : 'skip', actions: [], warnings: [], errors: [] };

  if (!enabled) return result;

  result.actions.push(markProjectFeature(repoRoot, 'ci', apply));

  const provider = ciProvider(blueprint);
  if (!provider) {
    result.errors.push('CI feature is enabled but ci.provider is missing/invalid. Expected: "github" or "gitlab".');
    return result;
  }

  const cictl = path.join(repoRoot, '.ai', 'skills', 'features', 'ci', 'scripts', 'ctl-ci.mjs');
  if (!fs.existsSync(cictl)) {
    result.errors.push(`CI control script not found: ${path.relative(repoRoot, cictl)}`);
    return result;
  }

  result.actions.push(
    runNodeScriptWithRepoRootFallback(repoRoot, cictl, ['init', '--provider', provider, '--repo-root', repoRoot], apply)
  );

  if (verify && apply) {
    const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, cictl, ['verify', '--repo-root', repoRoot], apply);
    result.actions.push(verifyRes);
    if (verifyRes.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'CI feature verify failed';
    }
  }

  return result;
}

function ensureContextAwarenessFeature(repoRoot, blueprint, apply, options = {}) {
  const { force = false, verify = false } = options;
  const enabled = isContextAwarenessEnabled(blueprint);
  const result = {
    enabled,
    featureId: 'context-awareness',
    op: enabled ? 'ensure' : 'skip',
    actions: [],
    warnings: [],
    errors: []
  };

  if (!enabled) return result;

  const templatesDir = findFeatureTemplatesDir(repoRoot, 'context-awareness');
  if (!templatesDir) {
    result.errors.push('Context awareness is enabled, but feature templates were not found.');
    return result;
  }

  const copyRes = copyDirIfMissing(templatesDir, repoRoot, apply, force);
  if (!copyRes.ok) {
    result.errors.push(copyRes.error || 'Failed to copy context-awareness templates.');
    return result;
  }

  result.actions.push({
    op: force ? 'reinstall-feature' : 'install-feature',
    featureId: 'context-awareness',
    from: templatesDir,
    to: repoRoot,
    mode: apply ? 'applied' : 'dry-run'
  });
  result.actions.push(...copyRes.actions);

  const contextctl = path.join(repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'ctl-context.mjs');
  const projectStateCtl = path.join(repoRoot, '.ai', 'scripts', 'ctl-project-state.mjs');

  if (!fs.existsSync(contextctl)) {
    result.errors.push('ctl-context.mjs not found under .ai/skills/features/context-awareness/scripts/.');
    return result;
  }

  // Ensure project state exists and mark flags
  if (fs.existsSync(projectStateCtl)) {
    // ctl-project-state init is handled by the main Stage C apply flow; set operations are idempotent even without init.
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, projectStateCtl, ['set', 'features.contextAwareness', 'true', '--repo-root', repoRoot], apply));
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, projectStateCtl, ['set', 'context.enabled', 'true', '--repo-root', repoRoot], apply));
    const mode = getContextMode(blueprint);
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, projectStateCtl, ['set-context-mode', mode, '--repo-root', repoRoot], apply));
  } else {
    result.warnings.push('ctl-project-state.mjs not found; skipping project state initialization.');
  }

  // Initialize docs/context skeleton and registry (idempotent)
  result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, contextctl, ['init', '--repo-root', repoRoot], apply));

  // Generate api-index from openapi.yaml if it exists (ensures committed state matches CI-regenerated state)
  // Use relative path so sourceOpenapi field matches CI's relative --source argument
  if (apply) {
    const apiIndexCtl = path.join(repoRoot, '.ai', 'scripts', 'ctl-api-index.mjs');
    const openapiYamlAbs = path.join(repoRoot, 'docs', 'context', 'api', 'openapi.yaml');
    const openapiYmlAbs = path.join(repoRoot, 'docs', 'context', 'api', 'openapi.yml');
    if (fs.existsSync(apiIndexCtl) && (fs.existsSync(openapiYamlAbs) || fs.existsSync(openapiYmlAbs))) {
      const srcRel = fs.existsSync(openapiYamlAbs) ? 'docs/context/api/openapi.yaml' : 'docs/context/api/openapi.yml';
      result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, apiIndexCtl, ['generate', '--source', srcRel, '--touch'], true));
    }
  }

  // Recalculate checksums so registry matches the just-copied/generated files
  result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, contextctl, ['touch', '--repo-root', repoRoot], apply));

  // Optional verify
  if (verify && apply) {
    const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, contextctl, ['verify', '--repo-root', repoRoot], apply);
    result.actions.push(verifyRes);
    if (verifyRes.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'Context awareness verify failed';
    }
  }

  return result;
}


function planScaffold(repoRoot, blueprint, apply, options = {}) {
  const results = [];
  const repo = blueprint.repo || {};
  const caps = blueprint.capabilities || {};
  const layout = repo.layout;

  // Always ensure docs directory exists (for blueprint and optional archived docs)
  results.push(ensureDir(path.join(repoRoot, 'docs'), apply));
  results.push(ensureDir(path.join(repoRoot, 'docs', 'project'), apply));

  // Create the Stage A docs working dir (copy-if-missing templates as a fallback)
  results.push(ensureDir(path.join(repoRoot, ...WORK_ROOT_SEGS, 'stage-a-docs'), apply));
  const stage_a_templates = stageADocTemplateSpecs();
  for (const t of stage_a_templates) {
    const srcPath = path.join(TEMPLATES_DIR, t.src);
    const destPath = path.join(repoRoot, ...WORK_ROOT_SEGS, 'stage-a-docs', t.dest);
    results.push(copyFileIfMissing(srcPath, destPath, apply));
  }

  if (layout === 'monorepo') {
    results.push(ensureDir(path.join(repoRoot, 'apps'), apply));
    results.push(ensureDir(path.join(repoRoot, 'packages'), apply));

    if (caps.frontend && caps.frontend.enabled) {
      results.push(ensureDir(path.join(repoRoot, 'apps', 'frontend'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'apps', 'frontend', 'README.md'),
        '# Frontend app\n\nThis folder is a scaffold placeholder. Populate it based on your selected frontend stack.\n',
        apply
      ));
    }

    if (caps.backend && caps.backend.enabled) {
      results.push(ensureDir(path.join(repoRoot, 'apps', 'backend'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'apps', 'backend', 'README.md'),
        '# Backend app\n\nThis folder is a scaffold placeholder. Populate it based on your selected backend stack.\n',
        apply
      ));
    }

    // Shared packages are optional, but commonly needed
    results.push(ensureDir(path.join(repoRoot, 'packages', 'shared'), apply));
    results.push(writeFileIfMissing(
      path.join(repoRoot, 'packages', 'shared', 'README.md'),
      '# Shared package\n\nThis folder is a scaffold placeholder for shared types/utilities.\n',
      apply
    ));
  } else {
    results.push(ensureDir(path.join(repoRoot, 'src'), apply));

    if (caps.frontend && caps.frontend.enabled) {
      results.push(ensureDir(path.join(repoRoot, 'src', 'frontend'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'src', 'frontend', 'README.md'),
        '# Frontend\n\nThis folder is a scaffold placeholder. Populate it based on your selected frontend stack.\n',
        apply
      ));
    }

    if (caps.backend && caps.backend.enabled) {
      results.push(ensureDir(path.join(repoRoot, 'src', 'backend'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'src', 'backend', 'README.md'),
        '# Backend\n\nThis folder is a scaffold placeholder. Populate it based on your selected backend stack.\n',
        apply
      ));
    }
  }


  return results;
}

function updateManifest(repoRoot, blueprint, apply) {
  // When skillpacksctl is available, pack switching should go through .ai/skills/_meta/ctl-skill-packs.mjs (scheme A).
  // When skillpacksctl is not available, fall back to a flat sync-manifest.json update (additive; never removes).
  const manifestPath = path.join(repoRoot, '.ai', 'skills', '_meta', 'sync-manifest.json');
  const skillpacksctlPath = path.join(repoRoot, '.ai', 'skills', '_meta', 'ctl-skill-packs.mjs');

  const warnings = [];
  const errors = [];

  const packsFromBlueprint = normalizePackList((blueprint.skills && blueprint.skills.packs) || []);
  const packs = new Set(packsFromBlueprint);

  // Note: packs are optional; features and packs are independent toggles.

  const packList = Array.from(packs);

  if (packList.length === 0) {
    return { op: 'skip', path: manifestPath, mode: apply ? 'applied' : 'dry-run', warnings, note: 'no packs requested' };
  }

  // Prefer skillpacksctl if available
  if (fs.existsSync(skillpacksctlPath)) {
    // Preflight: ensure pack files exist (more actionable than letting skillpacksctl fail mid-run).
    for (const p of packList) {
      const packFile = path.join(repoRoot, '.ai', 'skills', '_meta', 'packs', `${p}.json`);
      if (!fs.existsSync(packFile)) {
        errors.push(`Pack "${p}" is requested, but pack file is missing: ${path.relative(repoRoot, packFile)}`);
      }
    }

    if (errors.length > 0) {
      return { op: 'skillpacksctl', path: skillpacksctlPath, mode: 'failed', errors, warnings, packs: packList };
    }

    const actions = [];
    for (const p of packList) {
      const cmd = 'node';
      const args = [skillpacksctlPath, 'enable-pack', p, '--repo-root', repoRoot, '--no-sync'];
      const printable = `${cmd} ${args.join(' ')}`;

      if (!apply) {
        actions.push({ op: 'run', cmd: printable, mode: 'dry-run' });
        continue;
      }

      const res = spawnSyncForOutput(cmd, args, { cwd: repoRoot });
      if (res.status !== 0) {
        return { op: 'skillpacksctl', path: skillpacksctlPath, mode: 'failed', exitCode: res.status, packs: packList, warnings };
      }
      actions.push(attachSpawnOutput(res, { op: 'run', cmd: printable, mode: 'applied' }));
    }

    // Read effective manifest (if present) for reporting
    let effective = null;
    if (fs.existsSync(manifestPath)) {
      try { effective = readJson(manifestPath); } catch {}
    }

    return { op: 'skillpacksctl', path: manifestPath, mode: apply ? 'applied' : 'dry-run', warnings, packs: packList, actions, effectiveManifest: effective };
  }

  // Fallback: update flat manifest directly (additive; safe for basic repos)
  let manifest;
  if (fs.existsSync(manifestPath)) {
    manifest = readJson(manifestPath);
  } else {
    manifest = { version: 1, includePrefixes: [], includeSkills: [], excludeSkills: [] };
  }

  if (!Array.isArray(manifest.includePrefixes)) manifest.includePrefixes = [];
  if (!Array.isArray(manifest.includeSkills)) manifest.includeSkills = [];
  if (!Array.isArray(manifest.excludeSkills)) manifest.excludeSkills = [];

  const prefixMap = packPrefixMap();
  const prefixesToAdd = [];
  for (const p of packList) {
    const prefix = prefixMap[p];
    if (!prefix) {
      warnings.push(`Pack "${p}" has no prefix mapping and skillpacksctl is not available; skipping.`);
      continue;
    }
    prefixesToAdd.push(prefix);
  }

  manifest.includePrefixes = uniq([...manifest.includePrefixes, ...prefixesToAdd]);

  if (!apply) {
    return { op: 'write', path: manifestPath, mode: 'dry-run', warnings, includePrefixes: manifest.includePrefixes, packs: packList };
  }

  writeJson(manifestPath, manifest);
  return { op: 'write', path: manifestPath, mode: 'applied', warnings, includePrefixes: manifest.includePrefixes, packs: packList };
}



function syncWrappers(repoRoot, providers, apply) {
  const scriptPath = path.join(repoRoot, '.ai', 'scripts', 'sync-skills.mjs');
  if (!fs.existsSync(scriptPath)) {
    return { op: 'skip', path: scriptPath, reason: 'sync-skills.mjs not found' };
  }
  const providersArg = providers || 'both';
  const cmd = 'node';
  const args = [scriptPath, '--scope', 'current', '--providers', providersArg, '--mode', 'reset', '--yes'];

  if (!apply) return { op: 'run', cmd: `${cmd} ${args.join(' ')}`, mode: 'dry-run' };

  const res = spawnSyncForOutput(cmd, args, { cwd: repoRoot });
  if (res.status !== 0) {
    return attachSpawnOutput(res, { op: 'run', cmd: `${cmd} ${args.join(' ')}`, mode: 'failed', exitCode: res.status });
  }
  return attachSpawnOutput(res, { op: 'run', cmd: `${cmd} ${args.join(' ')}`, mode: 'applied' });
}

function cleanupInit(repoRoot, apply) {
  const initDir = path.join(repoRoot, 'init');
  const marker = path.join(initDir, '_tools', '.init-kit');

  if (!fs.existsSync(initDir)) return { op: 'skip', path: initDir, reason: 'init/ not present' };
  if (!fs.existsSync(marker)) return { op: 'refuse', path: initDir, reason: 'missing init/_tools/.init-kit marker' };

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const trashDir = path.join(repoRoot, `.init-trash-${ts}`);

  if (!apply) {
    return { op: 'rm', path: initDir, mode: 'dry-run', note: `will move to ${path.basename(trashDir)} then delete` };
  }

  // Move first (reduces risk if delete fails on Windows due to open file handles)
  fs.renameSync(initDir, trashDir);

  try {
    fs.rmSync(trashDir, { recursive: true, force: true });
    return { op: 'rm', path: initDir, mode: 'applied' };
  } catch (e) {
    return {
      op: 'rm',
      path: initDir,
      mode: 'partial',
      note: `renamed to ${path.basename(trashDir)} but could not delete automatically: ${e.message}`
    };
  }
}


function main() {
  const { command, opts } = parseArgs(process.argv);
  const format = (opts['format'] || 'text').toLowerCase();
  setOutputFormat(format);
  if (isJsonFormat()) enableJsonStdoutOnly();

  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  setWorkRootSegs(repoRoot);

  const defaultBlueprintRel = path.join(...WORK_ROOT_SEGS, 'project-blueprint.json');
  const defaultDocsRootRel = path.join(...WORK_ROOT_SEGS, 'stage-a-docs');
  const blueprintPath = resolvePath(repoRoot, opts['blueprint'] || defaultBlueprintRel);
  const docsRoot = resolvePath(repoRoot, opts['docs-root'] || defaultDocsRootRel);

  ensurePathWithinRepo(repoRoot, blueprintPath, 'blueprint');
  ensurePathWithinRepo(repoRoot, docsRoot, 'docs-root');

  // Update init/INIT-BOARD.md machine snapshot after each command (if the LLM created the board with snapshot markers).
  process.on('exit', (code) => {
    tryUpdateInitBoard(repoRoot, docsRoot, blueprintPath, code);
  });

  // ========== start ==========
  if (command === 'start') {
    const existingState = loadState(repoRoot);
    if (existingState) {
      console.log('[info] Existing init state detected');
      printStatus(existingState, repoRoot);
      console.log(`[info] To restart, delete ${workRelPosix('.init-state.json')} first`);
      console.log(`[hint] For a clean restart (fresh templates), also delete:`);
      console.log(`       - ${workRelPosix('stage-a-docs')}/`);
      console.log(`       - ${workRelPosix('project-blueprint.json')}`);
      console.log(`[hint] If templates were accidentally deleted, run: repair`);
      process.exit(0);
    }

    const langOpt = normalizeLang(opts['lang']);
    const lang = langOpt || (isInteractiveTty() ? promptLangSync('en') : 'en');

    const state = createInitialState(lang);
    addHistoryEvent(state, 'init_started', 'Initialization started');
    saveState(repoRoot, state);

    // Auto-create Stage A docs templates
    const stage_a_docs_dir = path.join(repoRoot, ...WORK_ROOT_SEGS, 'stage-a-docs');
    fs.mkdirSync(stage_a_docs_dir, { recursive: true });
    const stage_a_templates = stageADocTemplateSpecs(lang);
    const createdFiles = [];
    for (const t of stage_a_templates) {
      const srcPath = path.join(TEMPLATES_DIR, t.src);
      const destPath = path.join(stage_a_docs_dir, t.dest);
      if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
        createdFiles.push(t.dest);
      }
    }

    // Auto-create blueprint template
    const blueprintTemplateSrc = path.join(TEMPLATES_DIR, 'project-blueprint.min.example.json');
    const blueprintDest = path.join(repoRoot, ...WORK_ROOT_SEGS, 'project-blueprint.json');
    let blueprintCreated = false;
    if (fs.existsSync(blueprintTemplateSrc) && !fs.existsSync(blueprintDest)) {
      fs.copyFileSync(blueprintTemplateSrc, blueprintDest);
      blueprintCreated = true;
    }

    console.log(`[ok] Init state created: ${workRelPosix('.init-state.json')}`);
    if (createdFiles.length > 0) {
      console.log(`[ok] Stage A doc templates created: ${workRelPosix('stage-a-docs')}/`);
      for (const f of createdFiles) {
        console.log(`     - ${f}`);
      }
    }
    if (blueprintCreated) {
      console.log(`[ok] Blueprint template created: ${workRelPosix('project-blueprint.json')}`);
    }

    // Ensure workdir guidance exists (copy-if-missing; never overwrite).
    ensureWorkdirAgents(repoRoot, true);

    const self = path.relative(repoRoot, __filename);
    console.log('');
    console.log('[next] LLM language + entry docs (LLM-driven)');
    console.log(`- 1) Ask the user to confirm the user-facing doc language, then set: llm.language`);
    console.log(`     node ${self} set-llm-language --repo-root . --value \"<language>\"`);
    console.log(`- 2) Create (LLM-maintained): init/${START_HERE_FILE}`);
    console.log(`     Template: init/_tools/skills/initialize-project-from-requirements/templates/START-HERE.llm.template.md`);
    console.log(`- 3) Create (LLM-owned layout): init/${INIT_BOARD_FILE}`);
    console.log(`     Template: init/_tools/skills/initialize-project-from-requirements/templates/INIT-BOARD.llm.template.md`);
    console.log(`     (Keep machine snapshot markers; the pipeline updates only that section.)`);

    printStatus(state, repoRoot);
    process.exit(0);
  }

  // ========== repair ==========
  if (command === 'repair') {
    const state = loadState(repoRoot);
    if (!state) {
      die('[error] No init state found. Run the "start" command first.');
    }

    const lang = normalizeLang(state.language) || detectDocsLanguageFromDocsRoot(docsRoot) || 'en';
    const actions = [];

    // Restore missing workdir guidance (copy-if-missing)
    actions.push(ensureWorkdirAgents(repoRoot, true));
    // Entry docs (START-HERE / INIT-BOARD) are LLM-created after llm.language is confirmed.

    // Restore missing Stage A docs templates (copy-if-missing; language-aware)
    actions.push(ensureDir(docsRoot, true));
    for (const spec of stageADocTemplateSpecs(lang)) {
      actions.push(copyFileIfMissing(path.join(TEMPLATES_DIR, spec.src), path.join(docsRoot, spec.dest), true));
    }

    // Restore missing blueprint template (copy-if-missing)
    actions.push(copyFileIfMissing(path.join(TEMPLATES_DIR, 'project-blueprint.min.example.json'), blueprintPath, true));

    const changed = actions.some((a) => a && (a.mode === 'applied' || a.mode === 'partial'));
    if (changed) {
      addHistoryEvent(state, 'repair_run', 'Restored missing init artifacts (copy-if-missing)');
      saveState(repoRoot, state);
    }

	    const summary = changed ? `[ok] Repair completed (copy-if-missing only).` : `[ok] Repair: nothing to do (all artifacts present).`;
	    if (format === 'json') {
	      printJson({ ok: true, summary, changed, actions });
	    } else {
	      console.log(summary);
	      for (const a of actions) {
        const mode = a.mode ? ` (${a.mode})` : '';
        const reason = a.reason ? ` [${a.reason}]` : '';
        const from = a.from ? ` <- ${path.relative(repoRoot, a.from)}` : '';
        console.log(`- ${a.op}: ${path.relative(repoRoot, a.path || '')}${mode}${reason}${from}`);
      }
    }
    process.exit(0);
  }

  // ========== status ==========
  if (command === 'status') {
    const state = loadState(repoRoot);
    if (!state) {
      if (format === 'json') {
        const self = path.relative(repoRoot, __filename);
        printJson({
          ok: false,
          error: 'no_state',
          message: 'No init state found. Run the "start" command to begin initialization.',
          next: {
            command: 'start',
            example: `node ${self} start --repo-root . --lang <zh|en>`
          }
        });
      } else {
        console.log('[info] No init state found');
        console.log('[info] Run the "start" command to begin initialization');
      }
      process.exit(0);
    }

	    if (format === 'json') {
	      printJson(getStageProgress(state));
	    } else {
	      printStatus(state, repoRoot);
	    }
    process.exit(0);
  }

  // ========== set-llm-language ==========
  if (command === 'set-llm-language') {
    const state = loadState(repoRoot);
    if (!state) {
      die('[error] No init state found. Run the "start" command first.');
    }

    const value = opts['value'];
    if (!value || !String(value).trim()) {
      die('[error] --value is required for set-llm-language');
    }

    state.llm = state.llm && typeof state.llm === 'object' && !Array.isArray(state.llm) ? state.llm : {};
    const next = String(value).trim();
    const prev = state.llm.language === null || state.llm.language === undefined ? '' : String(state.llm.language).trim();
    if (prev !== next) {
      state.llm.language = next;
      addHistoryEvent(state, 'llm_language_set', `llm.language set to "${state.llm.language}"`);
      saveState(repoRoot, state);
    }

    const summary = prev === next ? `[ok] llm.language unchanged: ${next}` : `[ok] llm.language set: ${state.llm.language}`;
    if (format === 'json') {
      printJson({ ok: true, summary, llm: { language: state.llm.language } });
    } else {
      console.log(summary);
      printStatus(state, repoRoot);
    }
    process.exit(0);
  }

    // ========== advance ==========
	  if (command === 'advance') {
	    const state = loadState(repoRoot);
	    if (!state) {
	      die('[error] No init state found. Run the \"start\" command first.');
	    }

	    const progress = getStageProgress(state);
	    const stage_a = progress['stage-a'] || {};
	    const stage_b = progress['stage-b'] || {};
	    const stage_c = progress['stage-c'] || {};
	    const self = path.relative(repoRoot, __filename);
	    const docsRel = path.relative(repoRoot, docsRoot);
	    const bpRel = blueprintPath ? path.relative(repoRoot, blueprintPath) : workRelPosix('project-blueprint.json');

	    if (progress.stage === 'A') {
	      if (!stage_a.validated) {
	        console.log('[info] Stage A docs have not passed structural validation.');
	        console.log('Run first:');
	        console.log(`  node ${self} check-docs --docs-root ${docsRel} --strict`);
	        process.exit(1);
	      }
      console.log('\n== Stage A -> B Checkpoint ==\n');
      console.log('Stage A docs passed validation. Next: the user must review and explicitly approve.');
      console.log('After approval, run:');
      console.log(`  node ${self} approve --stage A --repo-root .`);
      process.exit(0);
    }

	    if (progress.stage === 'B') {
	      if (!stage_b.validated) {
	        console.log('[info] Stage B blueprint has not been validated.');
	        console.log('Run first:');
	        console.log(`  node ${self} validate --blueprint ${bpRel}`);
	        process.exit(1);
	      }
	      if (!stage_b.packsReviewed) {
	        console.log('[info] Stage B packs have not been reviewed.');
	        console.log('Next:');
	        console.log(`  node ${self} review-packs --repo-root .`);
	        process.exit(1);
	      }
      console.log('\n== Stage B -> C Checkpoint ==\n');
      console.log('Stage B blueprint passed validation and packs review. Next: the user must explicitly approve.');
      console.log('After approval, run:');
      console.log(`  node ${self} approve --stage B --repo-root .`);
      process.exit(0);
    }

	    if (progress.stage === 'C') {
	      if (!stage_c.wrappersSynced) {
	        console.log('[info] Stage C is not complete (wrappers not synced).');
	        console.log('Run first:');
	        console.log(`  node ${self} apply --blueprint ${bpRel}`);
	        process.exit(1);
	      }

      console.log('\n== Stage C Completion Checkpoint ==\n');
      console.log('Stage C completed (scaffold + skills written).');
      console.log('Next: user confirmation that scaffold and enabled capabilities match expectations.');
      console.log('');
      console.log('Before approving Stage C:');
      console.log('');
      console.log('1. [Required] Skill retention');
      console.log(`   Fill ${workRelPosix('skill-retention-table.template.md')} and confirm skill retention:`);
      console.log(`   node ${self} skill-retention --repo-root .`);
      console.log('   (If deletions are listed, apply them:)');
      console.log(`   node ${self} skill-retention --repo-root . --apply`);
      console.log('');
      console.log('2. [Recommended] Update root README.md and AGENTS.md');
      console.log('   This converts the repo from "template" to "project":');
      console.log('   - Replaces template intro with your project name/description');
      console.log('   - Adds Tech Stack section (language, package manager, layout)');
      console.log('   - Updates Key Directories table with project code paths');
      console.log('   (Structural sections like Routing and Global Rules are preserved.)');
      console.log('');
      console.log('   Preview changes:');
      console.log(`   node ${self} update-root-docs --repo-root .`);
      console.log('   Apply after explicit approval:');
      console.log(`   node ${self} update-root-docs --repo-root . --apply`);
      console.log('');
      console.log('After user approval, run:');
      console.log(`  node ${self} approve --stage C --repo-root .`);
      console.log('\nOptional: later run cleanup-init --apply --i-understand to remove the init/ directory');
      process.exit(0);
    }

    console.log('[info] Initialization completed (state.stage = complete)');
    process.exit(0);
  }



    // ========== approve ==========
  if (command === 'approve') {
    const state = loadState(repoRoot);
    if (!state) {
      die('[error] No init state found. Run the \"start\" command first.');
    }

    const current = String(state.stage || '').toUpperCase();
    const desired = String(opts['stage'] || current).toUpperCase();
    const note = opts['note'] ? String(opts['note']) : '';

    if (!['A', 'B', 'C', 'COMPLETE'].includes(desired)) {
      die('[error] --stage must be one of: A | B | C');
    }

    if (desired !== current) {
      die(`[error] Current stage=${state.stage}; cannot approve stage=${desired}. Run status to confirm, or omit --stage.`);
    }

	    if (desired === 'A') {
	      if (!state['stage-a']?.validated) {
	        die('[error] Stage A is not validated. Run check-docs first.');
	      }
	      const storedFp = state['stage-a']?.docsFingerprint;
	      if (!storedFp) {
	        die('[error] Stage A docs fingerprint missing. Re-run check-docs to store the fingerprint.');
	      }
	      const currentFp = fingerprintStageADocs(docsRoot);
	      if (!currentFp) {
	        die('[error] Cannot fingerprint Stage A docs (missing required files). Re-run check-docs.');
	      }
	      if (storedFp !== currentFp) {
	        die('[error] Stage A docs changed since the last successful check-docs. Re-run check-docs before approving.');
	      }
	      state['stage-a'].userApproved = true;
	      state.stage = 'B';
	      addHistoryEvent(state, 'stage_a_approved', note || 'Stage A approved by user');
	      saveState(repoRoot, state);
	      printStatus(state, repoRoot);
	      process.exit(0);
	    }

	    if (desired === 'B') {
	      if (!state['stage-b']?.validated) {
	        die('[error] Stage B is not validated. Run validate first.');
	      }
	      const validatedFp = state['stage-b']?.blueprintFingerprint;
	      if (!validatedFp) {
	        die('[error] Stage B blueprint fingerprint missing. Re-run validate to store the fingerprint.');
	      }
	      if (!fs.existsSync(blueprintPath)) {
	        die(`[error] Blueprint not found: ${path.relative(repoRoot, blueprintPath)}`);
	      }
	      const currentBp = readJson(blueprintPath);
	      const currentFp = fingerprintBlueprint(currentBp);
	      if (currentFp !== validatedFp) {
	        die('[error] Blueprint changed since the last successful validate. Re-run validate (and review-packs) before approving.');
	      }
	      if (!state['stage-b']?.packsReviewed) {
	        const self = path.relative(repoRoot, __filename);
	        die(`[error] Packs not reviewed. Run: node ${self} review-packs --repo-root .`);
	      }
	      const reviewedFp = state['stage-b']?.packsReviewedFingerprint;
	      if (!reviewedFp || reviewedFp !== currentFp) {
	        const self = path.relative(repoRoot, __filename);
	        die(`[error] Packs review is stale or missing. Run: node ${self} review-packs --repo-root .`);
	      }
	      state['stage-b'].userApproved = true;
	      state['stage-b'].approvedBlueprintFingerprint = currentFp;
	      state.stage = 'C';
	      addHistoryEvent(state, 'stage_b_approved', note || 'Stage B approved by user');
	      saveState(repoRoot, state);
	      printStatus(state, repoRoot);
	      process.exit(0);
	    }

	    if (desired === 'C') {
	      if (!state['stage-c']?.wrappersSynced) {
	        die('[error] Stage C is not complete. Run apply first.');
	      }
	      if (!state['stage-c']?.skillRetentionReviewed) {
	        const self = path.relative(repoRoot, __filename);
	        die(`[error] Skill retention not confirmed. Run: node ${self} skill-retention --repo-root .`);
	      }
	      const approvedFp = state['stage-b']?.approvedBlueprintFingerprint;
	      if (approvedFp && fs.existsSync(blueprintPath)) {
	        const currentFp = fingerprintBlueprint(readJson(blueprintPath));
	        if (currentFp !== approvedFp) {
	          die('[error] Blueprint changed since Stage B approval. Revert the blueprint to the approved version (or restart init) before approving Stage C.');
	        }
	      }
	      const retentionRel = state['stage-c']?.skillRetentionTablePath || workRelPosix('skill-retention-table.template.md');
	      const retentionPath = resolvePath(repoRoot, retentionRel);
	      ensurePathWithinRepo(repoRoot, retentionPath, 'skill retention table');
	      const storedRetentionFp = state['stage-c']?.skillRetentionTableFingerprint;
	      if (!storedRetentionFp) {
	        die('[error] Skill retention fingerprint missing. Re-run: skill-retention (confirm/apply)');
	      }
	      const currentRetentionFp = fingerprintTextFile(retentionPath);
	      if (!currentRetentionFp) {
	        die(`[error] Skill retention table not found: ${path.relative(repoRoot, retentionPath)}`);
	      }
	      if (currentRetentionFp !== storedRetentionFp) {
	        die('[error] Skill retention table changed since confirmation. Re-run: skill-retention (confirm/apply)');
	      }
	      state['stage-c'].userApproved = true;
	      state.stage = 'complete';
	      addHistoryEvent(state, 'init_completed', note || 'Initialization completed');
	      saveState(repoRoot, state);
	      printStatus(state, repoRoot);
        process.exit(0);
      }

    console.log('[info] Already complete; no need to approve again');
    process.exit(0);
  }

if (command === 'validate') {
    if (!blueprintPath) die('[error] --blueprint is required for validate');
    const blueprint = readJson(blueprintPath);
    const v = validateBlueprint(blueprint);
    const bpFingerprint = v.ok ? fingerprintBlueprint(blueprint) : null;

    // Auto-update state if validation passes
	    if (v.ok) {
	      const state = loadState(repoRoot);
	      if (state && state.stage === 'B') {
	        if (!state['stage-b']) state['stage-b'] = {};
	        const stage_b = state['stage-b'];
	        let changed = false;

	        if (stage_b.drafted !== true) {
	          stage_b.drafted = true;
	          changed = true;
	        }
	        if (stage_b.validated !== true) {
	          stage_b.validated = true;
	          changed = true;
	        }

	        if (bpFingerprint && stage_b.blueprintFingerprint !== bpFingerprint) {
	          stage_b.blueprintFingerprint = bpFingerprint;
	          // Invalidate dependent confirmations on blueprint change (or first fingerprint capture).
	          if (stage_b.packsReviewed) stage_b.packsReviewed = false;
	          if (stage_b.packsReviewedFingerprint) delete stage_b.packsReviewedFingerprint;
	          if (stage_b.userApproved) stage_b.userApproved = false;
	          if (stage_b.approvedBlueprintFingerprint) delete stage_b.approvedBlueprintFingerprint;
	          changed = true;
	        }

	        if (changed) {
	          addHistoryEvent(state, 'stage_b_validated', 'Stage B blueprint validated');
	          saveState(repoRoot, state);
	          console.log('[auto] State updated: stage-b.validated = true');
	        }
	      }
	    }

    const result = {
      ok: v.ok,
      packs: v.packs,
      fingerprint: bpFingerprint,
      errors: v.errors,
      warnings: v.warnings,
      summary: v.ok
        ? `[ok] Blueprint is valid: ${path.relative(repoRoot, blueprintPath)}`
        : `[error] Blueprint validation failed: ${path.relative(repoRoot, blueprintPath)}`
    };
    printResult(result, format);
    process.exit(v.ok ? 0 : 1);
  }

  if (command === 'check-docs') {
    const strict = !!opts['strict'];
    const stateForLang = loadState(repoRoot);
    const res = checkDocs(docsRoot, { lang: stateForLang?.language });

    const ok = res.ok && (!strict || res.warnings.length === 0);
    const docsFp = ok ? fingerprintStageADocs(docsRoot) : null;
    const summary = ok
      ? `[ok] Stage A docs check passed: ${path.relative(repoRoot, docsRoot)}`
      : `[error] Stage A docs check failed: ${path.relative(repoRoot, docsRoot)}`;

	    // Auto-update state if validation passes
	    if (ok) {
	      const state = stateForLang || loadState(repoRoot);
	      if (state && state.stage === 'A') {
	        if (!state['stage-a']) state['stage-a'] = {};
	        const stage_a = state['stage-a'];
	        let changed = false;

	        if (stage_a.validated !== true) {
	          stage_a.validated = true;
	          changed = true;
	        }

	        const nextDocsWritten = {
	          requirements: fs.existsSync(path.join(docsRoot, 'requirements.md')),
	          nfr: fs.existsSync(path.join(docsRoot, 'non-functional-requirements.md')),
	          glossary: fs.existsSync(path.join(docsRoot, 'domain-glossary.md')),
	          riskQuestions: fs.existsSync(path.join(docsRoot, 'risk-open-questions.md'))
	        };

	        stage_a.docsWritten = stage_a.docsWritten && typeof stage_a.docsWritten === 'object' ? stage_a.docsWritten : {};
	        for (const k of Object.keys(nextDocsWritten)) {
	          if (stage_a.docsWritten[k] !== nextDocsWritten[k]) {
	            stage_a.docsWritten[k] = nextDocsWritten[k];
	            changed = true;
	          }
	        }

	        if (docsFp && stage_a.docsFingerprint !== docsFp) {
	          stage_a.docsFingerprint = docsFp;
	          changed = true;
	        }

	        if (changed) {
	          addHistoryEvent(state, 'stage_a_validated', 'Stage A docs validated');
	          saveState(repoRoot, state);
	          console.log('[auto] State updated: stage-a.validated = true');
	        }
	      }
	    }

    printResult({ ok, errors: res.errors, warnings: res.warnings, fingerprint: docsFp, summary }, format);
    process.exit(ok ? 0 : 1);
  }

  if (command === 'mark-must-ask') {
    const key = opts['key'];
    const asked = !!opts['asked'];
    const answered = !!opts['answered'];
    const writtenTo = opts['written-to'];

    if (!key) die('[error] --key is required for mark-must-ask');
    if (!asked && !answered && !writtenTo) {
      die('[error] mark-must-ask requires --asked and/or --answered or --written-to');
    }

    const state = loadState(repoRoot);
    if (!state) die('[error] No init state found. Run the \"start\" command first.');

	    const mustAsk = state['stage-a'] && state['stage-a'].mustAsk;
    if (!mustAsk || !mustAsk[key]) {
      const available = mustAsk ? Object.keys(mustAsk).join(', ') : '';
      die(`[error] Unknown must-ask key "${key}". Available keys: ${available}`);
    }

    let changed = false;
    if (asked && mustAsk[key].asked !== true) {
      mustAsk[key].asked = true;
      changed = true;
    }
    if (answered && mustAsk[key].answered !== true) {
      mustAsk[key].answered = true;
      changed = true;
    }
    if (writtenTo && mustAsk[key].writtenTo !== writtenTo) {
      mustAsk[key].writtenTo = writtenTo;
      changed = true;
    }

    if (changed) {
      addHistoryEvent(state, 'must_ask_updated', `mustAsk.${key} updated`);
      saveState(repoRoot, state);
      console.log(`[ok] mustAsk.${key} updated`);
    } else {
      console.log(`[info] mustAsk.${key} unchanged`);
    }
    process.exit(0);
  }

	  if (command === 'review-packs') {
    const note = opts['note'];
    const state = loadState(repoRoot);
    if (!state) die('[error] No init state found. Run the \"start\" command first.');

	    if (String(state.stage || '').toUpperCase() !== 'B') {
	      die(`[error] review-packs is only valid during Stage B (current stage=${state.stage}).`);
	    }
	    if (!state['stage-b']?.validated) {
	      die('[error] Stage B is not validated. Run validate first.');
	    }
	    const validatedFp = state['stage-b']?.blueprintFingerprint;
	    if (!validatedFp) {
	      die('[error] Stage B blueprint fingerprint missing. Re-run validate to store the fingerprint.');
	    }
	    if (!fs.existsSync(blueprintPath)) {
	      die(`[error] Blueprint not found: ${path.relative(repoRoot, blueprintPath)}`);
	    }
	    const currentFp = fingerprintBlueprint(readJson(blueprintPath));
	    if (currentFp !== validatedFp) {
	      die('[error] Blueprint changed since validate. Re-run validate before reviewing packs.');
	    }

	    if (!state['stage-b']) state['stage-b'] = {};
	    const stage_b = state['stage-b'];
	    let changed = false;
	    if (stage_b.packsReviewed !== true) {
	      stage_b.packsReviewed = true;
	      changed = true;
	    }
	    if (stage_b.packsReviewedFingerprint !== currentFp) {
	      stage_b.packsReviewedFingerprint = currentFp;
	      changed = true;
	    }

	    if (changed) {
	      addHistoryEvent(state, 'packs_reviewed', note || 'Packs reviewed');
	      saveState(repoRoot, state);
	    }

	    console.log(changed ? '[ok] stage-b.packsReviewed = true' : '[info] Packs already reviewed for current blueprint (no changes).');
	    process.exit(0);
	  }

  if (command === 'skill-retention') {
    const apply = !!opts['apply'];
    const fileOpt = opts['file'] || path.join(...WORK_ROOT_SEGS, 'skill-retention-table.template.md');
    const tablePath = resolvePath(repoRoot, fileOpt);
    ensurePathWithinRepo(repoRoot, tablePath, 'skill retention table');

    const state = loadState(repoRoot);
    if (!state) die('[error] No init state found. Run the "start" command first.');

    if (String(state.stage || '').toUpperCase() !== 'C') {
      die(`[error] skill-retention is only valid during Stage C (current stage=${state.stage}).`);
    }
    if (!state['stage-c']?.wrappersSynced) {
      die('[error] Stage C is not complete. Run apply first.');
    }

    // Ensure the table exists (copy from template if missing and using the default path)
    if (!fs.existsSync(tablePath)) {
      ensureSkillRetentionTemplate(repoRoot, true);
    }
    if (!fs.existsSync(tablePath)) {
      die(`[error] Skill retention table not found: ${path.relative(repoRoot, tablePath)}`);
    }

    const content = fs.readFileSync(tablePath, 'utf8');
    const tableFingerprint = sha256Hex(normalizeNewlines(content));
    const parsed = parseSkillRetentionDeletionList(content);
    const deletions = parsed.deletions;

    // If the table changed since the last confirmed run, invalidate the prior confirmation.
    if (!state['stage-c']) state['stage-c'] = {};
    const stage_c = state['stage-c'];
    if (
      stage_c.skillRetentionReviewed &&
      stage_c.skillRetentionTableFingerprint &&
      stage_c.skillRetentionTableFingerprint !== tableFingerprint
    ) {
      stage_c.skillRetentionReviewed = false;
      delete stage_c.skillRetentionTableFingerprint;
      delete stage_c.skillRetentionTablePath;
      addHistoryEvent(state, 'skill_retention_invalidated', 'Skill retention confirmation invalidated (table changed)');
      saveState(repoRoot, state);
    }

    let sync = { op: 'skip', mode: 'skipped', reason: 'no deletions listed' };
    if (deletions.length > 0) {
      const syncScript = path.join(repoRoot, '.ai', 'scripts', 'sync-skills.mjs');
      if (!fs.existsSync(syncScript)) {
        die(`[error] sync-skills.mjs not found: ${path.relative(repoRoot, syncScript)}`);
      }

      const cmd = 'node';
      const args = [
        syncScript,
        '--providers',
        'both',
        '--delete-skills',
        deletions.join(','),
        '--delete-scope',
        'all',
        '--clean-empty',
        '--update-meta',
      ];
      if (apply) args.push('--yes');
      else args.push('--dry-run');

      if (format !== 'json') {
        console.log(`[info] Skill retention file: ${path.relative(repoRoot, tablePath)}`);
        for (const w of parsed.warnings) console.warn(`[warn] ${w}`);
        console.log(`[info] Deletions (${deletions.length}):`);
        for (const d of deletions) console.log(`- ${d}`);
      }

      const res = spawnSyncForOutput(cmd, args, { cwd: repoRoot });
      if (res.status !== 0) die(`[error] sync-skills.mjs failed with exit code ${res.status}`);
      sync = attachSpawnOutput(res, { op: 'run', cmd: `${cmd} ${args.join(' ')}`, mode: apply ? 'applied' : 'dry-run' });
    } else if (format !== 'json') {
      console.log(`[info] Skill retention file: ${path.relative(repoRoot, tablePath)}`);
      for (const w of parsed.warnings) console.warn(`[warn] ${w}`);
      console.log('[info] No deletions listed under "## Deletion List".');
    }

    const canConfirm = apply || deletions.length === 0;
    let stateUpdated = false;
    if (canConfirm) {
      const tableRel = path.relative(repoRoot, tablePath).split(path.sep).join('/');
      let changed = false;
      if (stage_c.skillRetentionReviewed !== true) {
        stage_c.skillRetentionReviewed = true;
        changed = true;
      }
      if (stage_c.skillRetentionTablePath !== tableRel) {
        stage_c.skillRetentionTablePath = tableRel;
        changed = true;
      }
      if (stage_c.skillRetentionTableFingerprint !== tableFingerprint) {
        stage_c.skillRetentionTableFingerprint = tableFingerprint;
        changed = true;
      }

      if (changed) {
        addHistoryEvent(
          state,
          'skill_retention_reviewed',
          apply ? 'Skill retention confirmed (apply)' : 'Skill retention confirmed (no deletions)'
        );
        saveState(repoRoot, state);
        stateUpdated = true;
      }
    }

    const result = {
      ok: true,
      file: path.relative(repoRoot, tablePath),
      deletions,
      fingerprint: tableFingerprint,
      confirmed: canConfirm,
      stateUpdated,
      warnings: parsed.warnings,
      sync,
      summary: apply
        ? '[ok] Skill retention confirmed (applied when deletions listed).'
        : deletions.length > 0
          ? '[info] Skill retention dry-run completed (deletions listed). Re-run with --apply to confirm and update state.'
          : '[ok] Skill retention confirmed (no deletions listed).',
    };
    printResult(result, format);
    process.exit(0);
  }

  if (command === 'suggest-packs') {
    if (!blueprintPath) die('[error] --blueprint is required for suggest-packs');
    const blueprint = readJson(blueprintPath);

    const v = validateBlueprint(blueprint);
    const rec = recommendedPacksFromBlueprint(blueprint);
    const current = normalizePackList((blueprint.skills && blueprint.skills.packs) || []);
    const missing = rec.filter((p) => !current.includes(p));
    const extra = current.filter((p) => !rec.includes(p));

    const installChecks = rec.map((p) => checkPackInstall(repoRoot, p)).filter((x) => !x.installed);
    const warnings = [];
    for (const c of installChecks) warnings.push(`Recommended pack "${c.pack}" is not installed (${c.reason}).`);

    const result = {
      ok: v.ok,
      recommended: rec,
      current,
      missing,
      extra,
      warnings,
      errors: v.errors,
      summary: `[info] Packs: current=${current.join(', ') || '(none)'} | recommended=${rec.join(', ')}`
    };

    if (opts['write']) {
      if (!v.ok) die('[error] Cannot write packs: blueprint validation failed.');
      const next = normalizePackList([...current, ...missing]);
      blueprint.skills = blueprint.skills || {};
      blueprint.skills.packs = next;
      writeJson(blueprintPath, blueprint);
      result.wrote = { path: path.relative(repoRoot, blueprintPath), packs: next };
      result.summary += `\n[write] Added missing recommended packs into blueprint.skills.packs`;
    }

    printResult(result, format);
    process.exit(v.ok ? 0 : 1);
  }

  if (command === 'suggest-features') {
    if (!blueprintPath) die('[error] --blueprint is required for suggest-features');
    const blueprint = readJson(blueprintPath);

    const v = validateBlueprint(blueprint);
    const rec = recommendedFeaturesFromBlueprint(blueprint);
    const current = getEnabledFeatures(blueprint);
    const missing = rec.filter((a) => !current.includes(a));
    const extra = current.filter((a) => !rec.includes(a));

    const result = {
      ok: v.ok,
      recommended: rec,
      current,
      missing,
      extra,
      errors: v.errors,
      warnings: v.warnings,
      summary: `[info] Features: current=${current.join(', ') || '(none)'} | recommended=${rec.join(', ') || '(none)'}`
    };

    if (opts['write']) {
      if (!v.ok) die('[error] Cannot write features: blueprint validation failed.');
      blueprint.features = blueprint.features || {};
      for (const featureKey of missing) {
        blueprint.features[featureKey] = true;
      }
      writeJson(blueprintPath, blueprint);
      result.wrote = { path: path.relative(repoRoot, blueprintPath), features: [...current, ...missing] };
      result.summary += `\n[write] Added missing recommended features into blueprint.features`;
    }

    printResult(result, format);
    process.exit(v.ok ? 0 : 1);
  }

  if (command === 'scaffold') {
    if (!blueprintPath) die('[error] --blueprint is required for scaffold');
    const apply = !!opts['apply'];
    const blueprint = readJson(blueprintPath);

    const v = validateBlueprint(blueprint);
    if (!v.ok) die('[error] Blueprint is not valid; refusing to scaffold.');

    const stateForLang = loadState(repoRoot);
    const plan = planScaffold(repoRoot, blueprint, apply, { lang: stateForLang?.language });
    const summary = apply
      ? `[ok] Scaffold applied under repo root: ${repoRoot}`
      : `[plan] Scaffold dry-run under repo root: ${repoRoot}`;

	    if (format === 'json') {
	      printJson({ ok: true, summary, plan });
	    } else {
	      console.log(summary);
	      for (const item of plan) {
        const mode = item.mode ? ` (${item.mode})` : '';
        const reason = item.reason ? ` [${item.reason}]` : '';
        console.log(`- ${item.op}: ${path.relative(repoRoot, item.path || '')}${mode}${reason}`);
      }
    }
    process.exit(0);
  }

  if (command === 'update-root-docs') {
    if (!blueprintPath) die('[error] --blueprint is required for update-root-docs');
    const apply = !!opts['apply'];
    const blueprint = readJson(blueprintPath);

    const v = validateBlueprint(blueprint);
    if (!v.ok) die('[error] Blueprint is not valid; refusing to update root docs.');

    const readmePath = path.join(repoRoot, 'README.md');
    const agentsPath = path.join(repoRoot, 'AGENTS.md');

    const readmeRender = generateProjectReadme(repoRoot, blueprint, false);
    if (readmeRender.op === 'skip') die('[error] README template not found; cannot update README.md');

    const currentReadme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
    const desiredReadme = readmeRender.content || '';

    const currentAgents = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
    const desiredAgents = renderUpdatedRootAgentsMd(currentAgents, blueprint);

    const readmeDiff = unifiedDiff(currentReadme, desiredReadme, path.relative(repoRoot, readmePath));
    const agentsDiff = unifiedDiff(currentAgents, desiredAgents, path.relative(repoRoot, agentsPath));

    const changed = { readme: readmeDiff.length > 0, agents: agentsDiff.length > 0 };

    if (format === 'json') {
      const out = {
        ok: true,
        apply,
        blueprint: path.relative(repoRoot, blueprintPath),
        changed,
        diff: {
          'README.md': readmeDiff,
          'AGENTS.md': agentsDiff,
        },
      };
      if (apply) {
        if (changed.readme) fs.writeFileSync(readmePath, desiredReadme, 'utf8');
        if (changed.agents) fs.writeFileSync(agentsPath, desiredAgents, 'utf8');
        out.wrote = {
          'README.md': changed.readme ? path.relative(repoRoot, readmePath) : null,
          'AGENTS.md': changed.agents ? path.relative(repoRoot, agentsPath) : null,
        };
      }
	      printJson(out);
	      process.exit(0);
	    }

    if (!changed.readme && !changed.agents) {
      console.log('[ok] Root docs are already up-to-date.');
      process.exit(0);
    }

    if (readmeDiff) {
      console.log(readmeDiff.trimEnd());
      console.log('');
    }
    if (agentsDiff) {
      console.log(agentsDiff.trimEnd());
      console.log('');
    }

    if (!apply) {
      console.log('[info] Re-run with --apply after explicit approval to write README.md and AGENTS.md.');
      process.exit(0);
    }

    if (changed.readme) fs.writeFileSync(readmePath, desiredReadme, 'utf8');
    if (changed.agents) fs.writeFileSync(agentsPath, desiredAgents, 'utf8');
    console.log('[ok] Root docs updated: README.md, AGENTS.md');
    process.exit(0);
  }

  if (command === 'apply') {
    if (!blueprintPath) die('[error] --blueprint is required for apply');
    const providers = opts['providers'] || 'both';
    const requireStageA = !!opts['require-stage-a'];
    const skipConfigs = !!opts['skip-configs'];
    const cleanup = !!opts['cleanup-init'];
    const forceFeatures = !!opts['force-features'];
    const verifyFeatures = !!opts['verify-features'];
    const nonBlockingFeatures = !!opts['non-blocking-features'];
    const noStageGate = !!opts['no-stage-gate'];

    if (cleanup && !opts['i-understand']) {
      die('[error] --cleanup-init requires --i-understand');
    }

    const blueprint = readJson(blueprintPath);

    // Validate blueprint
    const v = validateBlueprint(blueprint);
    if (!v.ok) die('[error] Blueprint validation failed. Fix errors and re-run.');
    const bpFingerprint = fingerprintBlueprint(blueprint);

    // Stage A docs check (strict only when explicitly required)
    const stateForLang = loadState(repoRoot);
    if (!noStageGate) {
      if (!stateForLang) {
        die('[error] No init state found. Run the "start" command first.');
      }
      const stage = String(stateForLang.stage || '').toUpperCase();
      if (stage !== 'C' && stage !== 'COMPLETE') {
        const self = path.relative(repoRoot, __filename);
        die(
          `[error] Refusing to run apply outside Stage C (current stage=${stateForLang.stage}).\n` +
          `Run: node ${self} advance --repo-root .`
        );
      }

	      const approvedFp = stateForLang['stage-b']?.approvedBlueprintFingerprint;
	      if (approvedFp && bpFingerprint !== approvedFp) {
	        die(
	          `[error] Blueprint changed since Stage B approval.\n` +
	          `- Approved fingerprint: ${approvedFp}\n` +
	          `- Current fingerprint:  ${bpFingerprint}\n` +
	          `Revert the blueprint to the approved version (or restart init), then re-run apply.`
	        );
	      }
    }
    const stage_a_res = checkDocs(docsRoot, { lang: stateForLang?.language });
    if (requireStageA) {
      const strictOk = stage_a_res.ok && stage_a_res.warnings.length === 0;
      if (!strictOk) die('[error] Stage A docs check failed in strict mode. Fix docs and re-run.');
    }

    // Suggest packs (warn-only)
    const rec = recommendedPacksFromBlueprint(blueprint);
    const current = normalizePackList((blueprint.skills && blueprint.skills.packs) || []);
    const missing = rec.filter((p) => !current.includes(p));
    if (missing.length > 0) {
      console.warn(`[warn] Blueprint.skills.packs is missing recommended packs: ${missing.join(', ')}`);
      console.warn(`[warn] Run: suggest-packs --blueprint ${path.relative(repoRoot, blueprintPath)} --write  (or edit blueprint.skills.packs manually)`);
    }

    // Scaffold directories
    const scaffoldPlan = planScaffold(repoRoot, blueprint, true, { lang: stateForLang?.language });

    // Generate config files (default: enabled)
    let configResults = [];
    if (!skipConfigs) {
      configResults = generateConfigFiles(repoRoot, blueprint, true);
      console.log('[ok] Config files generated.');
      for (const r of configResults) {
        const mode = r.mode ? ` (${r.mode})` : '';
        const reason = r.reason ? ` [${r.reason}]` : '';
        console.log(`  - ${r.action}: ${r.file}${mode}${reason}`);
      }
    }

    const featureOptions = { force: forceFeatures, verify: verifyFeatures };
    const contextFeatureOptions = { force: forceFeatures, verify: false };
    const verifyFailures = [];

    // Ensure project state exists (records enabled features for LLMs and tooling)
    const projectStateCtlPath = path.join(repoRoot, '.ai', 'scripts', 'ctl-project-state.mjs');
    if (fs.existsSync(projectStateCtlPath)) {
      const initRes = runNodeScriptWithRepoRootFallback(repoRoot, projectStateCtlPath, ['init', '--repo-root', repoRoot], true);
      if (initRes.mode === 'failed') {
        console.warn('[warn] ctl-project-state init failed; feature flags may not be recorded.');
      }
    }

    // Initialize project governance hub (best-effort; idempotent)
    const projectGovernanceCtlPath = path.join(repoRoot, '.ai', 'scripts', 'ctl-project-governance.mjs');
    if (fs.existsSync(projectGovernanceCtlPath)) {
      const initHubRes = runNodeScriptWithRepoRootFallback(repoRoot, projectGovernanceCtlPath, ['init', '--project', 'main', '--repo-root', repoRoot], true);
      if (initHubRes.mode === 'failed') {
        console.warn('[warn] ctl-project-governance init failed; project hub may not be initialized.');
      }
    }

    // Optional in general, but required when DB SSOT workflows are enabled.
    const contextFeature = ensureContextAwarenessFeature(repoRoot, blueprint, true, contextFeatureOptions);
    if (contextFeature.errors && contextFeature.errors.length > 0) {
      for (const e of contextFeature.errors) console.error(`[error] ${e}`);
      if (!nonBlockingFeatures) {
        die('[error] Context awareness feature setup failed. Use --non-blocking-features to continue despite errors.');
      }
    }
    if (contextFeature.warnings && contextFeature.warnings.length > 0) {
      for (const w of contextFeature.warnings) console.warn(`[warn] ${w}`);
    }

    // Optional feature materialization
    const featureResults = [];

    // Helper function to handle feature installation with fail-fast support
    function handleFeatureResult(res, featureId) {
      featureResults.push(res);
      if (res.errors.length > 0) {
        for (const e of res.errors) console.error(`[error] ${e}`);
        if (!nonBlockingFeatures) {
          die(`[error] Feature "${featureId}" installation failed. Use --non-blocking-features to continue despite errors.`);
        }
      }
      if (res.verifyFailed) {
        const msg = res.verifyError || `Feature "${featureId}" verify failed`;
        console.error(`[error] ${msg}`);
        verifyFailures.push(featureId);
        if (!nonBlockingFeatures) {
          die(`[error] Feature "${featureId}" verify failed. Use --non-blocking-features to continue despite errors.`);
        }
      }
      if (res.warnings.length > 0) {
        for (const w of res.warnings) console.warn(`[warn] ${w}`);
      }
    }

    // Database feature (SSOT-aware)
    if (isDatabaseEnabled(blueprint)) {
      console.log('[info] Enabling Database feature...');
      const res = ensureDatabaseFeature(repoRoot, blueprint, true, featureOptions);
      handleFeatureResult(res, 'database');
    }

    // UI feature
    if (isUiEnabled(blueprint)) {
      console.log('[info] Enabling UI feature...');
      const res = ensureUiFeature(repoRoot, blueprint, true, featureOptions);
      handleFeatureResult(res, 'ui');
    }

    // Environment feature
    if (isEnvironmentEnabled(blueprint)) {
      console.log('[info] Enabling Environment feature...');
      const res = ensureEnvironmentFeature(repoRoot, blueprint, true, featureOptions);
      handleFeatureResult(res, 'environment');
    }

    // IaC feature
    if (isIacEnabled(blueprint)) {
      console.log('[info] Enabling IaC feature...');
      const res = ensureIacFeature(repoRoot, blueprint, true, featureOptions);
      handleFeatureResult(res, 'iac');
    }

    // CI feature
    if (isCiEnabled(blueprint)) {
      console.log('[info] Enabling CI feature...');
      const res = ensureCiFeature(repoRoot, blueprint, true, featureOptions);
      handleFeatureResult(res, 'ci');
    }

    // Packaging feature
    if (isPackagingEnabled(blueprint)) {
      console.log('[info] Enabling Packaging feature...');
      const res = ensureFeature(repoRoot, 'packaging', true, 'ctl-packaging.mjs', featureOptions);
      handleFeatureResult(res, 'packaging');
    }

    // Deployment feature
    if (isDeploymentEnabled(blueprint)) {
      console.log('[info] Enabling Deployment feature...');
      const res = ensureFeature(repoRoot, 'deployment', true, 'ctl-deploy.mjs', featureOptions);
      handleFeatureResult(res, 'deployment');
    }

    // Release feature
    if (isReleaseEnabled(blueprint)) {
      console.log('[info] Enabling Release feature...');
      const res = ensureFeature(repoRoot, 'release', true, 'ctl-release.mjs', featureOptions);
      handleFeatureResult(res, 'release');
    }

    // Observability feature
    if (isObservabilityEnabled(blueprint)) {
      console.log('[info] Enabling Observability feature...');
      const res = ensureFeature(repoRoot, 'observability', true, 'ctl-observability.mjs', featureOptions);
      handleFeatureResult(res, 'observability');
    }

	    // DB SSOT bootstrap (docs/project + AGENTS + LLM db context)
	    const dbSsotConfigResult = ensureDbSsotConfig(repoRoot, blueprint, true);
	    if (dbSsotConfigResult.mode === 'applied') {
	      console.log(`[ok] DB SSOT config written: ${path.relative(repoRoot, dbSsotConfigResult.path)}`);
	    }
	    const dbSsotAgentsBlockResult = updateRootAgentsDbSsotBlock(repoRoot, blueprint, true);
	    if (dbSsotAgentsBlockResult.mode === 'applied') {
	      console.log(`[ok] Root AGENTS DB-SSOT block updated: ${path.relative(repoRoot, dbSsotAgentsBlockResult.path)}`);
	    } else if (dbSsotAgentsBlockResult.reason) {
	      console.log(`[info] Root AGENTS DB-SSOT block update skipped: ${dbSsotAgentsBlockResult.reason}`);
	    }
	    const dbContextRefreshResult = refreshDbContextContract(repoRoot, blueprint, true);
	    if (dbContextRefreshResult.mode === 'applied') {
	      console.log(`[ok] DB context refreshed: ${path.relative(repoRoot, dbContextRefreshResult.path)}`);
	    } else if (dbContextRefreshResult.reason) {
      console.log(`[info] DB context refresh skipped: ${dbContextRefreshResult.reason}`);
    }

    if (verifyFeatures && isDatabaseEnabled(blueprint)) {
      const dbVerifyResult = verifyDatabaseFeatureAfterContext(repoRoot, blueprint, true);
      if (dbVerifyResult.errors && dbVerifyResult.errors.length > 0) {
        for (const e of dbVerifyResult.errors) console.error(`[error] ${e}`);
      }
      if (dbVerifyResult.mode === 'failed') {
        verifyFailures.push('database');
        if (!nonBlockingFeatures) {
          die('[error] Database feature verify failed after DB context refresh. Use --non-blocking-features to continue despite errors.');
        }
      } else if (dbVerifyResult.mode === 'applied') {
        console.log('[ok] Database feature verified after DB context refresh.');
      } else if (dbVerifyResult.reason) {
        console.log(`[info] Database post-context verify skipped: ${dbVerifyResult.reason}`);
      }
    }

    // Verify context awareness after DB context refresh (prevents transient mismatches).
    if (verifyFeatures && contextFeature && contextFeature.enabled) {
      const contextctl = path.join(repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'ctl-context.mjs');
      if (fs.existsSync(contextctl)) {
        const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, contextctl, ['verify', '--repo-root', repoRoot], true);
        if (verifyRes.mode === 'failed') {
          verifyFailures.push('context-awareness');
          if (!nonBlockingFeatures) {
            die('[error] Context awareness verify failed. Use --non-blocking-features to continue despite errors.');
          }
        }
      }
    }

    // Manifest update
    const manifestResult = updateManifest(repoRoot, blueprint, true);
    if (manifestResult.mode === 'failed') {
      if (manifestResult.errors && manifestResult.errors.length > 0) {
        for (const e of manifestResult.errors) console.error(`[error] ${e}`);
      }
      die('[error] Skill pack / manifest update failed.');
    }
    if (manifestResult.warnings && manifestResult.warnings.length > 0) {
      for (const w of manifestResult.warnings) console.warn(`[warn] ${w}`);
    }

    // DB SSOT skill mutual exclusion (sync-manifest excludeSkills)
    const ssotSkillExclusionsResult = applyDbSsotSkillExclusions(repoRoot, blueprint, true);
    if (ssotSkillExclusionsResult.mode === 'applied') {
      console.log('[ok] Skill exclusions updated for DB SSOT');
    }

    // Sync wrappers
    const syncResult = syncWrappers(repoRoot, providers, true);
    if (syncResult.mode === 'failed') die(`[error] sync-skills.mjs failed with exit code ${syncResult.exitCode}`);

    const retentionTemplateResult = ensureSkillRetentionTemplate(repoRoot, true);
    if (retentionTemplateResult.mode === 'applied') {
      console.log(`[ok] Skill retention template created: ${workRelPosix('skill-retention-table.template.md')}`);
    } else if (retentionTemplateResult.reason) {
      console.log(`[info] Skill retention template: ${retentionTemplateResult.reason}`);
    }

    // Auto-update state
	    const state = loadState(repoRoot);
	    if (state) {
	      if (!state['stage-c']) state['stage-c'] = {};
	      const stage_c = state['stage-c'];

	      const prevAppliedFp = stage_c.appliedBlueprintFingerprint || null;
	      const prevProviders = stage_c.appliedProviders || null;

	      let changed = false;
	      if (stage_c.scaffoldApplied !== true) {
	        stage_c.scaffoldApplied = true;
	        changed = true;
	      }
	      if (stage_c.configsGenerated !== !skipConfigs) {
	        stage_c.configsGenerated = !skipConfigs;
	        changed = true;
	      }
	      if (stage_c.manifestUpdated !== true) {
	        stage_c.manifestUpdated = true;
	        changed = true;
	      }
	      if (stage_c.wrappersSynced !== (syncResult.mode === 'applied')) {
	        stage_c.wrappersSynced = syncResult.mode === 'applied';
	        changed = true;
	      }
	      if (stage_c.appliedBlueprintFingerprint !== bpFingerprint) {
	        stage_c.appliedBlueprintFingerprint = bpFingerprint;
	        changed = true;
	      }
	      if (stage_c.appliedProviders !== providers) {
	        stage_c.appliedProviders = providers;
	        changed = true;
	      }

	      const appliedChanged =
	        (prevAppliedFp && prevAppliedFp !== bpFingerprint) || (prevProviders && prevProviders !== providers);
	      if (appliedChanged) {
	        if (stage_c.skillRetentionReviewed) {
	          stage_c.skillRetentionReviewed = false;
	          changed = true;
	        }
	        if (stage_c.skillRetentionTableFingerprint) {
	          delete stage_c.skillRetentionTableFingerprint;
	          changed = true;
	        }
	        if (stage_c.skillRetentionTablePath) {
	          delete stage_c.skillRetentionTablePath;
	          changed = true;
	        }
	        if (stage_c.userApproved) {
	          stage_c.userApproved = false;
	          changed = true;
	        }
	      }

	      if (changed) {
	        addHistoryEvent(state, 'stage_c_applied', 'Stage C apply completed');
	        saveState(repoRoot, state);
	        console.log('[auto] State updated: stage-c.*');
	      }
	    }
    // Optional cleanup
    let cleanupResult = null
    if (cleanup) {
      cleanupResult = cleanupInit(repoRoot, true)
      if (cleanupResult.mode === 'partial') {
        console.warn(`[warn] cleanup-init partially completed: ${cleanupResult.note}`)
      }
    }

	    if (format === 'json') {
	      printJson({
	        ok: true,
	        blueprint: path.relative(repoRoot, blueprintPath),
	        docsRoot: path.relative(repoRoot, docsRoot),
	        'stage-a': stage_a_res,
	        contextFeature,
        features: featureResults,
        scaffold: scaffoldPlan,
	        configs: configResults,
	        dbSsotConfig: dbSsotConfigResult,
	        dbSsotAgentsBlock: dbSsotAgentsBlockResult,
	        dbContextContract: dbContextRefreshResult,
	        dbSsotSkillExclusions: ssotSkillExclusionsResult,
	        skillRetentionTemplate: retentionTemplateResult,
	        manifest: manifestResult,
        sync: syncResult,
	        rootDocs: {
	          note: 'Use update-root-docs to preview/apply README.md + AGENTS.md updates (requires explicit approval).',
	        },
	        cleanup: cleanupResult
	      })
	    } else {
	      console.log('[ok] Apply completed.')
	      console.log(`- Blueprint: ${path.relative(repoRoot, blueprintPath)}`)
      console.log(`- Docs root: ${path.relative(repoRoot, docsRoot)}`)
      console.log(`- DB SSOT: ${blueprint.db && blueprint.db.ssot ? blueprint.db.ssot : 'unknown'}`)

      const installed = []
      if (contextFeature && contextFeature.enabled) installed.push('context-awareness')
      for (const r of featureResults) {
        if (r && r.featureId && r.op === 'ensure') installed.push(r.featureId)
      }
      if (installed.length > 0) {
        console.log(`- Features installed: ${installed.join(', ')}`)
      }

      if (verifyFeatures) {
        if (verifyFailures.length > 0) {
          console.log(`- Features verified: failed (${verifyFailures.join(', ')})`)
        } else {
          console.log(`- Features verified: yes`)
        }
      }

      if (!stage_a_res.ok) console.log('[warn] Stage A docs check had errors; consider re-running with --require-stage-a.')
      if (stage_a_res.warnings.length > 0) console.log('[warn] Stage A docs check has warnings; ensure TBD/TODO items are tracked.')
      if (retentionTemplateResult.path) {
        const status = retentionTemplateResult.mode || retentionTemplateResult.reason || 'unknown'
        console.log(`- Skill retention template: ${path.relative(repoRoot, retentionTemplateResult.path)} (${status})`)
      }
      console.log(`- Manifest updated: ${path.relative(repoRoot, manifestResult.path)}`)
      console.log(`- Wrappers synced via: ${syncResult.cmd || '(skipped)'}`)
      console.log(`- Root docs: run update-root-docs to preview/apply README.md + AGENTS.md`)
      if (cleanupResult) console.log(`- init/ cleanup: ${cleanupResult.mode}`)
    }

    process.exit(0)
  }

  if (command === 'cleanup-init') {
    if (!opts['i-understand']) die('[error] cleanup-init requires --i-understand');
    const apply = !!opts['apply'];
    const archiveAll = !!opts['archive'];
    const archiveDocs = archiveAll || !!opts['archive-docs'];
    const archiveBlueprint = archiveAll || !!opts['archive-blueprint'];
    const archiveAny = archiveDocs || archiveBlueprint;

    const results = { init: null, archivedDocs: null, archivedBlueprint: null, archivedState: null, archivedStartHere: null, archivedBoard: null };
    const destDir = path.join(repoRoot, 'docs', 'project', 'overview');

    // Archive Stage A docs if requested
    const stage_a_docs_dir = path.join(repoRoot, ...WORK_ROOT_SEGS, 'stage-a-docs');
    if (fs.existsSync(stage_a_docs_dir)) {
      if (archiveDocs) {
        if (!apply) {
          results.archivedDocs = { from: stage_a_docs_dir, to: destDir, mode: 'dry-run' };
        } else {
          fs.mkdirSync(destDir, { recursive: true });
          const files = fs.readdirSync(stage_a_docs_dir);
          for (const file of files) {
            const srcFile = path.join(stage_a_docs_dir, file);
            const destFile = path.join(destDir, file);
            if (fs.statSync(srcFile).isFile()) {
              fs.copyFileSync(srcFile, destFile);
            }
          }
          results.archivedDocs = { from: stage_a_docs_dir, to: destDir, mode: 'applied', files };
        }
      } else if (apply) {
        console.log('[info] Stage A docs will be deleted with init/');
        console.log('[hint] Use --archive or --archive-docs to preserve them in docs/project/overview/');
      }
    }

    // Archive blueprint if requested
    const blueprintSrc = path.join(repoRoot, ...WORK_ROOT_SEGS, 'project-blueprint.json');
    if (fs.existsSync(blueprintSrc)) {
      if (archiveBlueprint) {
        const blueprintDest = path.join(destDir, 'project-blueprint.json');
        if (!apply) {
          results.archivedBlueprint = { from: blueprintSrc, to: blueprintDest, mode: 'dry-run' };
        } else {
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(blueprintSrc, blueprintDest);
          results.archivedBlueprint = { from: blueprintSrc, to: blueprintDest, mode: 'applied' };
        }
      } else if (apply) {
        console.log('[info] Blueprint will be deleted with init/');
        console.log('[hint] Use --archive or --archive-blueprint to preserve it in docs/project/overview/');
      }
    }

    // Archive init state (when any archiving is requested)
    const stateSrc = path.join(repoRoot, ...WORK_ROOT_SEGS, '.init-state.json');
    if (fs.existsSync(stateSrc) && archiveAny) {
      const stateDest = path.join(destDir, 'init-state.json');
      if (!apply) {
        results.archivedState = { from: stateSrc, to: stateDest, mode: 'dry-run' };
      } else {
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(stateSrc, stateDest);
        results.archivedState = { from: stateSrc, to: stateDest, mode: 'applied' };
      }
    }

    // Archive entry docs (START-HERE and board snapshot) when any archiving is requested.
    if (archiveAny) {
      const startHereSrc = getStartHerePath(repoRoot);
      const boardSrc = getInitBoardPath(repoRoot);
      const startHereDest = path.join(destDir, START_HERE_FILE);
      const boardDest = path.join(destDir, INIT_BOARD_FILE);

      if (fs.existsSync(startHereSrc)) {
        if (!apply) {
          results.archivedStartHere = { from: startHereSrc, to: startHereDest, mode: 'dry-run' };
        } else {
          fs.mkdirSync(destDir, { recursive: true });
          if (!fs.existsSync(startHereDest)) {
            fs.copyFileSync(startHereSrc, startHereDest);
            results.archivedStartHere = { from: startHereSrc, to: startHereDest, mode: 'applied' };
          } else {
            results.archivedStartHere = { from: startHereSrc, to: startHereDest, mode: 'skipped', reason: 'exists' };
          }
        }
      }

      if (fs.existsSync(boardSrc)) {
        if (!apply) {
          results.archivedBoard = { from: boardSrc, to: boardDest, mode: 'dry-run' };
        } else {
          fs.mkdirSync(destDir, { recursive: true });
          if (!fs.existsSync(boardDest)) {
            fs.copyFileSync(boardSrc, boardDest);
            results.archivedBoard = { from: boardSrc, to: boardDest, mode: 'applied' };
          } else {
            results.archivedBoard = { from: boardSrc, to: boardDest, mode: 'skipped', reason: 'exists' };
          }
        }
      }
    }

    // Cleanup init/ directory
    results.init = cleanupInit(repoRoot, apply);

	    if (format === 'json') {
	      printJson({ ok: true, results });
	    } else {
	      // Print archive results
	      if (results.archivedDocs) {
        const arc = results.archivedDocs;
        if (arc.mode === 'dry-run') {
          console.log(`[plan] archive: Stage A docs -> ${path.relative(repoRoot, arc.to)} (dry-run)`);
        } else {
          console.log(`[ok] archive: Stage A docs -> ${path.relative(repoRoot, arc.to)}`);
          if (arc.files) console.log(`  Files: ${arc.files.join(', ')}`);
        }
      }
      if (results.archivedBlueprint) {
        const arc = results.archivedBlueprint;
        if (arc.mode === 'dry-run') {
          console.log(`[plan] archive: Blueprint -> ${path.relative(repoRoot, arc.to)} (dry-run)`);
        } else {
          console.log(`[ok] archive: Blueprint -> ${path.relative(repoRoot, arc.to)}`);
        }
      }
      if (results.archivedState) {
        const arc = results.archivedState;
        if (arc.mode === 'dry-run') {
          console.log(`[plan] archive: Init state -> ${path.relative(repoRoot, arc.to)} (dry-run)`);
        } else {
          console.log(`[ok] archive: Init state -> ${path.relative(repoRoot, arc.to)}`);
        }
      }
      if (results.archivedStartHere) {
        const arc = results.archivedStartHere;
        if (arc.mode === 'dry-run') {
          console.log(`[plan] archive: START-HERE -> ${path.relative(repoRoot, arc.to)} (dry-run)`);
        } else if (arc.mode === 'skipped') {
          console.log(`[info] archive: START-HERE already exists at ${path.relative(repoRoot, arc.to)} (skipped)`);
        } else {
          console.log(`[ok] archive: START-HERE -> ${path.relative(repoRoot, arc.to)}`);
        }
      }
      if (results.archivedBoard) {
        const arc = results.archivedBoard;
        if (arc.mode === 'dry-run') {
          console.log(`[plan] archive: INIT-BOARD -> ${path.relative(repoRoot, arc.to)} (dry-run)`);
        } else if (arc.mode === 'skipped') {
          console.log(`[info] archive: INIT-BOARD already exists at ${path.relative(repoRoot, arc.to)} (skipped)`);
        } else {
          console.log(`[ok] archive: INIT-BOARD -> ${path.relative(repoRoot, arc.to)}`);
        }
      }

      // Print init cleanup result
      if (results.init) {
        const res = results.init;
        if (!apply) {
          console.log(`[plan] ${res.op}: ${path.relative(repoRoot, res.path || '')} (${res.mode})`);
          if (res.note) console.log(`Note: ${res.note}`);
        } else {
          console.log(`[ok] ${res.op}: ${path.relative(repoRoot, res.path || '')} (${res.mode})`);
          if (res.note) console.log(`Note: ${res.note}`);
        }
      }
    }
    process.exit(0);
  }

  usage(1);
}

main();
