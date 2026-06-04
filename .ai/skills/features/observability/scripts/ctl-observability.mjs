#!/usr/bin/env node
/**
 * ctl-observability.mjs
 *
 * Observability configuration management for the Observability feature.
 *
 * Commands:
 *   init              Initialize observability configuration (idempotent)
 *   status            Show observability status
 *   verify            Verify observability configuration
 *   add-metric        Add a metric definition
 *   list-metrics      List defined metrics
 *   add-log-field     Add a structured log field
 *   list-log-fields   List structured log fields
 *   generate-instrumentation  Print instrumentation hints (no codegen)
 *   help              Show help
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/observability/scripts/ctl-observability.mjs <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created
    Initialize observability configuration.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show observability status.

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify observability configuration.

  add-metric
    --name <string>             Metric name (required)
    --type <counter|gauge|histogram>  Metric type (required)
    --description <string>      Description (optional)
    --labels <csv>              Labels (comma-separated, optional)
    --unit <string>             Unit (optional, e.g. seconds, requests)
    --buckets <csv>             Histogram buckets (comma-separated numbers, optional)
    --repo-root <path>          Repo root (default: cwd)
    Add a metric definition.

  list-metrics
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List defined metrics.

  add-log-field
    --name <string>             Field name (required)
    --type <string>             Field type (required, e.g. string, number, boolean)
    --description <string>      Description (optional)
    --required                  Mark as required (optional)
    --enum <csv>                Enum values (optional)
    --repo-root <path>          Repo root (default: cwd)
    Add a structured log field to docs/context/observability/logs-schema.json.

  list-log-fields
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List structured log fields.

  generate-instrumentation
    --lang <typescript|javascript|python|go>  Language (default: typescript)
    --repo-root <path>          Repo root (default: cwd)
    Print instrumentation hints based on the contracts (no code generation).

Examples:
  node .ai/skills/features/observability/scripts/ctl-observability.mjs init
  node .ai/skills/features/observability/scripts/ctl-observability.mjs add-metric --name http_requests_total --type counter --unit requests --labels method,path,status
  node .ai/skills/features/observability/scripts/ctl-observability.mjs list-metrics
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
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') usage(0);

  const command = args.shift();
  const opts = {};

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
    }
  }

  return { command, opts };
}

// ============================================================================
// File Utilities
// ============================================================================

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return { op: 'mkdir', path: dirPath };
  }
  return { op: 'skip', path: dirPath, reason: 'exists' };
}

function writeFileIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) {
    return { op: 'skip', path: filePath, reason: 'exists' };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { op: 'write', path: filePath };
}

function nowIso() {
  return new Date().toISOString();
}

function parseCsv(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ============================================================================
// Observability Management
// ============================================================================

function getObsDir(repoRoot) {
  return path.join(repoRoot, 'observability');
}

function resolveHandbookDir(baseDir) {
  const handbookDir = path.join(baseDir, 'handbook');
  const legacyWorkdocsDir = path.join(baseDir, 'workdocs');

  if (fs.existsSync(handbookDir)) return { dir: handbookDir, legacy: false };
  if (fs.existsSync(legacyWorkdocsDir)) return { dir: legacyWorkdocsDir, legacy: true };
  return { dir: handbookDir, legacy: false };
}

function getContextObsDir(repoRoot) {
  return path.join(repoRoot, 'docs', 'context', 'observability');
}

function getConfigPath(repoRoot) {
  return path.join(getObsDir(repoRoot), 'config.json');
}

function getMetricsPath(repoRoot) {
  return path.join(getContextObsDir(repoRoot), 'metrics-registry.json');
}

function getLogsSchemaPath(repoRoot) {
  return path.join(getContextObsDir(repoRoot), 'logs-schema.json');
}

function getTracesConfigPath(repoRoot) {
  return path.join(getContextObsDir(repoRoot), 'traces-config.json');
}

function normalizeConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  return {
    version: 1,
    updatedAt: cfg.updatedAt || cfg.lastUpdated || nowIso(),
    metrics: cfg.metrics !== undefined ? !!cfg.metrics : true,
    logs: cfg.logs !== undefined ? !!cfg.logs : true,
    traces: cfg.traces !== undefined ? !!cfg.traces : true,
    platform: cfg.platform !== undefined ? cfg.platform : null
  };
}

function normalizeMetricsRegistry(raw) {
  const reg = raw && typeof raw === 'object' ? raw : {};
  const metrics = Array.isArray(reg.metrics) ? reg.metrics : [];
  const normalizedMetrics = metrics
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      name: String(m.name || '').trim(),
      type: String(m.type || '').trim(),
      description: m.description ? String(m.description) : '',
      labels: Array.isArray(m.labels) ? m.labels.map((l) => String(l)) : [],
      ...(m.unit ? { unit: String(m.unit) } : {}),
      ...(Array.isArray(m.buckets) ? { buckets: m.buckets } : {})
    }))
    .filter((m) => m.name && m.type);

  return {
    version: 1,
    updatedAt: reg.updatedAt || reg.lastUpdated || nowIso(),
    metrics: normalizedMetrics
  };
}

function normalizeLogsSchema(raw) {
  const doc = raw && typeof raw === 'object' ? raw : {};
  const fields = Array.isArray(doc.fields) ? doc.fields : [];
  return {
    version: 1,
    updatedAt: doc.updatedAt || doc.lastUpdated || nowIso(),
    format: doc.format || 'json',
    levels: Array.isArray(doc.levels) ? doc.levels : ['debug', 'info', 'warn', 'error'],
    fields: fields
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({
        name: String(f.name || '').trim(),
        type: String(f.type || '').trim(),
        ...(f.format ? { format: String(f.format) } : {}),
        ...(f.enum ? { enum: Array.isArray(f.enum) ? f.enum : parseCsv(f.enum) } : {}),
        required: !!f.required,
        ...(f.description ? { description: String(f.description) } : {})
      }))
      .filter((f) => f.name && f.type)
  };
}

function loadConfig(repoRoot) {
  return normalizeConfig(readJson(getConfigPath(repoRoot)));
}

function saveConfig(repoRoot, config) {
  const normalized = normalizeConfig(config);
  normalized.updatedAt = nowIso();
  writeJson(getConfigPath(repoRoot), normalized);
}

function loadMetrics(repoRoot) {
  return normalizeMetricsRegistry(readJson(getMetricsPath(repoRoot)));
}

function saveMetrics(repoRoot, metrics) {
  const normalized = normalizeMetricsRegistry(metrics);
  normalized.updatedAt = nowIso();
  writeJson(getMetricsPath(repoRoot), normalized);
}

function loadLogsSchema(repoRoot) {
  return normalizeLogsSchema(readJson(getLogsSchemaPath(repoRoot)));
}

function saveLogsSchema(repoRoot, schema) {
  const normalized = normalizeLogsSchema(schema);
  normalized.updatedAt = nowIso();
  writeJson(getLogsSchemaPath(repoRoot), normalized);
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const obsDir = getObsDir(repoRoot);
  const { dir: handbookDir, legacy: usesLegacyWorkdocsDir } = resolveHandbookDir(obsDir);
  const contextObsDir = getContextObsDir(repoRoot);
  const actions = [];

  const dirs = [
    obsDir,
    handbookDir,
    path.join(handbookDir, 'alert-runbooks'),
    contextObsDir
  ];

  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  // Create config
  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath) && !dryRun) {
    saveConfig(repoRoot, { version: 1, updatedAt: nowIso(), metrics: true, logs: true, traces: true, platform: null });
    actions.push({ op: 'write', path: configPath });
  }

  // Create metrics registry
  const metricsPath = getMetricsPath(repoRoot);
  if (!fs.existsSync(metricsPath) && !dryRun) {
    saveMetrics(repoRoot, { version: 1, updatedAt: nowIso(), metrics: [] });
    actions.push({ op: 'write', path: metricsPath });
  }

  // Create AGENTS.md
  const agentsPath = path.join(obsDir, 'AGENTS.md');
  const agentsContent = `# Observability (LLM-first)

## Commands

\`\`\`bash
node .ai/skills/features/observability/scripts/ctl-observability.mjs init
node .ai/skills/features/observability/scripts/ctl-observability.mjs add-metric --name http_requests_total --type counter
node .ai/skills/features/observability/scripts/ctl-observability.mjs list-metrics
node .ai/skills/features/observability/scripts/ctl-observability.mjs verify
\`\`\`

## Directory Structure

- \`observability/config.json\` - Configuration
- \`observability/handbook/alert-runbooks/\` - Alert runbooks
- \`docs/context/observability/\` - Metrics/logs/traces contracts

## Metric Types

- counter: Monotonically increasing value
- gauge: Value that can go up or down
- histogram: Distribution of values
`;

  if (dryRun) {
    actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(agentsPath, agentsContent));
  }

  // Create logs schema
  const logsSchemaPath = getLogsSchemaPath(repoRoot);
  if (!fs.existsSync(logsSchemaPath) && !dryRun) {
    saveLogsSchema(repoRoot, {
      version: 1,
      updatedAt: nowIso(),
      format: 'json',
      levels: ['debug', 'info', 'warn', 'error'],
      fields: [
        { name: 'timestamp', type: 'string', format: 'iso8601', required: true, description: 'Log timestamp in ISO 8601 format' },
        { name: 'level', type: 'string', enum: ['debug', 'info', 'warn', 'error'], required: true, description: 'Log level' },
        { name: 'message', type: 'string', required: true, description: 'Log message' },
        { name: 'service', type: 'string', required: true, description: 'Service name' },
        { name: 'trace_id', type: 'string', required: false, description: 'Distributed tracing ID' }
      ]
    });
    actions.push({ op: 'write', path: logsSchemaPath });
  }

  // Create traces config
  const tracesConfigPath = getTracesConfigPath(repoRoot);
  if (!fs.existsSync(tracesConfigPath) && !dryRun) {
    writeJson(tracesConfigPath, {
      version: 1,
      updatedAt: nowIso(),
      sampling: { default: 0.1, errorRate: 1.0, description: 'Sample 10% of traces, 100% of errors' },
      propagation: ['tracecontext', 'baggage']
    });
    actions.push({ op: 'write', path: tracesConfigPath });
  }

  console.log('[ok] Observability configuration initialized.');
  if (usesLegacyWorkdocsDir) {
    console.log('[warn] Detected legacy observability/workdocs/. Consider renaming to observability/handbook/.');
  }
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${mode}${reason}`);
  }
}

function cmdStatus(repoRoot, format) {
  const config = loadConfig(repoRoot);
  const metrics = loadMetrics(repoRoot);
  const status = {
    initialized: fs.existsSync(getObsDir(repoRoot)),
    metricsCount: metrics.metrics.length,
    updatedAt: config.updatedAt
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Observability Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Metrics defined: ${status.metricsCount}`);
  console.log(`  Updated at: ${status.updatedAt || 'never'}`);
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getObsDir(repoRoot))) {
    errors.push('observability/ not found. Run: ctl-observability init');
  }

  if (!fs.existsSync(getContextObsDir(repoRoot))) {
    warnings.push('docs/context/observability/ not found');
  }

  const metrics = loadMetrics(repoRoot);
  if (metrics.metrics.length === 0) {
    warnings.push('No metrics defined');
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  - ${e}`);
  }
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  const ok = errors.length === 0;
  console.log(ok ? '[ok] Observability configuration verified.' : '[error] Verification failed.');
  process.exit(ok ? 0 : 1);
}

function cmdAddMetric(repoRoot, name, type, description, opts) {
  if (!name) die('[error] --name is required');
  if (!type) die('[error] --type is required');

  const validTypes = ['counter', 'gauge', 'histogram'];
  if (!validTypes.includes(type)) {
    die(`[error] --type must be one of: ${validTypes.join(', ')}`);
  }

  const metrics = loadMetrics(repoRoot);
  if (metrics.metrics.find(m => m.name === name)) {
    die(`[error] Metric "${name}" already exists`);
  }

  const options = opts && typeof opts === 'object' ? opts : {};
  const labels = parseCsv(options.labels);
  const unit = options.unit ? String(options.unit) : undefined;
  const buckets = options.buckets
    ? parseCsv(options.buckets).map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : undefined;

  metrics.metrics.push({
    name,
    type,
    description: description || '',
    ...(labels.length > 0 ? { labels } : {}),
    ...(unit ? { unit } : {}),
    ...(type === 'histogram' && buckets && buckets.length > 0 ? { buckets } : {})
  });
  saveMetrics(repoRoot, metrics);

  console.log(`[ok] Added metric: ${name} (${type})`);
}

function cmdAddLogField(repoRoot, name, type, description, required, enumCsv) {
  if (!name) die('[error] --name is required');
  if (!type) die('[error] --type is required');

  const schema = loadLogsSchema(repoRoot);
  if (schema.fields.find((f) => f.name === name)) {
    die(`[error] Log field "${name}" already exists`);
  }

  schema.fields.push({
    name,
    type,
    required: !!required,
    ...(description ? { description: String(description) } : {}),
    ...(enumCsv ? { enum: parseCsv(enumCsv) } : {})
  });
  saveLogsSchema(repoRoot, schema);

  console.log(`[ok] Added log field: ${name} (${type})`);
}

function cmdListLogFields(repoRoot, format) {
  const schema = loadLogsSchema(repoRoot);
  if (format === 'json') {
    console.log(JSON.stringify(schema, null, 2));
    return;
  }

  console.log(`Log Fields (${schema.fields.length}):\n`);
  if (schema.fields.length === 0) {
    console.log('  (no fields defined)');
    return;
  }

  for (const f of schema.fields) {
    const req = f.required ? ' required' : '';
    console.log(`  - ${f.name}: ${f.type}${req}`);
    if (f.description) console.log(`      ${f.description}`);
  }
}

function cmdGenerateInstrumentation(repoRoot, lang) {
  const language = String(lang || 'typescript').toLowerCase();

  const metrics = loadMetrics(repoRoot);
  const logs = loadLogsSchema(repoRoot);
  const traces = readJson(getTracesConfigPath(repoRoot)) || {};

  console.log('Instrumentation Hints');
  console.log('----------------------------------------');
  console.log(`Language: ${language}`);
  console.log(`Metrics: ${metrics.metrics.length}`);
  console.log(`Log fields: ${logs.fields.length}`);
  console.log('----------------------------------------\n');

  if (language === 'typescript' || language === 'javascript') {
    console.log('# Metrics');
    console.log('# - Use OpenTelemetry Metrics API; follow names/labels/units from metrics-registry.json');
    console.log('');
    for (const m of metrics.metrics.slice(0, 10)) {
      const labels = Array.isArray(m.labels) && m.labels.length > 0 ? ` labels=[${m.labels.join(', ')}]` : '';
      const unit = m.unit ? ` unit=${m.unit}` : '';
      console.log(`- ${m.name} (${m.type})${unit}${labels}`);
    }
    if (metrics.metrics.length > 10) console.log(`- ... (${metrics.metrics.length - 10} more)`);

    console.log('\n# Logs');
    console.log('# - Emit structured JSON logs with at least required fields from logs-schema.json');

    console.log('\n# Traces');
    if (traces.spanNaming?.examples) {
      console.log('# - Span naming examples:');
      for (const ex of traces.spanNaming.examples) console.log(`- ${ex}`);
    } else {
      console.log('# - Follow docs/context/observability/traces-config.json conventions.');
    }
    return;
  }

  console.log('# See the contract files for details:');
  console.log(`- ${path.relative(repoRoot, getMetricsPath(repoRoot))}`);
  console.log(`- ${path.relative(repoRoot, getLogsSchemaPath(repoRoot))}`);
  console.log(`- ${path.relative(repoRoot, getTracesConfigPath(repoRoot))}`);
}

function cmdListMetrics(repoRoot, format) {
  const metrics = loadMetrics(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  console.log(`Metrics (${metrics.metrics.length}):\n`);
  if (metrics.metrics.length === 0) {
    console.log('  (no metrics defined)');
    return;
  }

  for (const m of metrics.metrics) {
    console.log(`  [${m.type}] ${m.name}`);
    if (m.description) {
      console.log(`    ${m.description}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = (opts['format'] || 'text').toLowerCase();

  switch (command) {
    case 'help':
      usage(0);
      break;
    case 'init':
      cmdInit(repoRoot, !!opts['dry-run']);
      break;
    case 'status':
      cmdStatus(repoRoot, format);
      break;
    case 'verify':
      cmdVerify(repoRoot);
      break;
    case 'add-metric':
      cmdAddMetric(repoRoot, opts['name'], opts['type'], opts['description'], opts);
      break;
    case 'list-metrics':
      cmdListMetrics(repoRoot, format);
      break;
    case 'add-log-field':
      cmdAddLogField(repoRoot, opts['name'], opts['type'], opts['description'], !!opts['required'], opts['enum']);
      break;
    case 'list-log-fields':
      cmdListLogFields(repoRoot, format);
      break;
    case 'generate-instrumentation':
      cmdGenerateInstrumentation(repoRoot, opts['lang'] || opts['language']);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();
