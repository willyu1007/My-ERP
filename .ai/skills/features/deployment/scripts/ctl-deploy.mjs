#!/usr/bin/env node
/**
 * ctl-deploy.mjs
 *
 * Deployment configuration + planning controller for the Deployment feature.
 *
 * Safety model:
 * - This tool plans deployments and maintains configs.
 * - It does NOT execute deployments against real infrastructure.
 *
 * Commands:
 *   init              Initialize deployment configuration (idempotent)
 *   list-envs         List deployment environments
 *   add-env           Add a deployment environment
 *   list              List registered services
 *   add-service       Register a deployable service
 *   plan              Generate a human-executable deployment plan
 *   history           Show plan/history entries
 *   status            Show deployment status (config + history)
 *   verify            Verify deployment configuration
 *   help              Show help
 */

import fs from 'node:fs';
import path from 'node:path';

const VALID_MODELS = new Set(['k8s', 'serverless', 'vm', 'paas']);
const VALID_K8S_TOOLS = new Set(['helm', 'kustomize', 'manifests']);
const VALID_SERVICE_KINDS = new Set(['http_service', 'workload', 'client']);

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/deployment/scripts/ctl-deploy.mjs <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>          Repo root (default: cwd)
    --model <k8s|serverless|vm|paas>  Deployment model (default: k8s)
    --k8s-tool <helm|kustomize|manifests>  K8s tool (default: helm; only for model=k8s)
    --dry-run                   Show what would be created
    Initialize deployment configuration (idempotent).

  list-envs
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List deployment environments.

  add-env
    --id <string>               Environment ID (required)
    --description <string>      Description (optional)
    --repo-root <path>          Repo root (default: cwd)
    Add a deployment environment (creates ops/deploy/environments/<id>.yaml if missing).

  list
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List registered services.

  add-service
    --id <string>               Service ID (required)
    --artifact <string>         Artifact reference (required, e.g. ghcr.io/org/api:v1.2.3)
    --kind <http_service|workload|client>  Kind (default: http_service)
    --description <string>      Description (optional)
    --repo-root <path>          Repo root (default: cwd)
    Register a deployable service.

  plan
    --service <id>              Service ID (required)
    --env <id>                  Environment ID (required)
    --tag <tag>                 Optional tag override
    --repo-root <path>          Repo root (default: cwd)
    Generate a human-executable plan (does not deploy).

  status
    --repo-root <path>          Repo root (default: cwd)
    --env <id>                  Optional environment filter
    --service <id>              Optional service filter
    --format <text|json>        Output format (default: text)
    Show deployment status (config + recent plan entries).

  history
    --repo-root <path>          Repo root (default: cwd)
    --env <id>                  Optional environment filter
    --service <id>              Optional service filter
    --format <text|json>        Output format (default: text)
    Show plan/history entries.

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify deployment configuration.

Examples:
  node .ai/skills/features/deployment/scripts/ctl-deploy.mjs init --model k8s --k8s-tool helm
  node .ai/skills/features/deployment/scripts/ctl-deploy.mjs add-service --id api --artifact ghcr.io/acme/api:v1.2.3
  node .ai/skills/features/deployment/scripts/ctl-deploy.mjs list
  node .ai/skills/features/deployment/scripts/ctl-deploy.mjs plan --service api --env staging
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
  } catch {
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

function normalizeModel(model) {
  const m = String(model || 'k8s').trim().toLowerCase();
  return VALID_MODELS.has(m) ? m : 'k8s';
}

function normalizeK8sTool(tool) {
  const t = String(tool || 'helm').trim().toLowerCase();
  return VALID_K8S_TOOLS.has(t) ? t : 'helm';
}

function normalizeServiceKind(kind) {
  const k = String(kind || 'http_service').trim().toLowerCase();
  return VALID_SERVICE_KINDS.has(k) ? k : 'http_service';
}

// ============================================================================
// Deployment Management
// ============================================================================

function getDeployDir(repoRoot) {
  return path.join(repoRoot, 'ops', 'deploy');
}

function resolveHandbookDir(baseDir) {
  const handbookDir = path.join(baseDir, 'handbook');
  const legacyWorkdocsDir = path.join(baseDir, 'workdocs');

  if (fs.existsSync(handbookDir)) return { dir: handbookDir, legacy: false };
  if (fs.existsSync(legacyWorkdocsDir)) return { dir: legacyWorkdocsDir, legacy: true };
  return { dir: handbookDir, legacy: false };
}

function getEnvsDir(repoRoot) {
  return path.join(getDeployDir(repoRoot), 'environments');
}

function getConfigPath(repoRoot) {
  return path.join(getDeployDir(repoRoot), 'config.json');
}

function getServiceDescriptorPath(repoRoot, serviceId, kind) {
  const dirName =
    kind === 'workload' ? 'workloads'
    : kind === 'client' ? 'clients'
    : 'http_services';
  return path.join(getDeployDir(repoRoot), dirName, `${serviceId}.yaml`);
}

function normalizeConfig(raw) {
  const now = nowIso();
  const cfg = raw && typeof raw === 'object' ? raw : {};

  const model = normalizeModel(cfg.model);
  const k8s = cfg.k8s && typeof cfg.k8s === 'object' ? cfg.k8s : {};
  const k8sTool = normalizeK8sTool(k8s.tool);

  return {
    version: 1,
    updatedAt: cfg.updatedAt || cfg.lastUpdated || now,
    model,
    k8s: { tool: k8sTool },
    environments: Array.isArray(cfg.environments) ? cfg.environments : [],
    services: Array.isArray(cfg.services) ? cfg.services : [],
    history: Array.isArray(cfg.history) ? cfg.history : []
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

function parseArtifactRef(artifact) {
  const ref = String(artifact || '').trim();
  if (!ref) return { repository: '', tag: '' };

  const lastSlash = ref.lastIndexOf('/');
  const lastColon = ref.lastIndexOf(':');
  const hasTag = lastColon > lastSlash;

  if (!hasTag) return { repository: ref, tag: 'latest' };

  return {
    repository: ref.slice(0, lastColon),
    tag: ref.slice(lastColon + 1)
  };
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun, model, k8sTool) {
  const deployDir = getDeployDir(repoRoot);
  const { dir: handbookDir, legacy: usesLegacyWorkdocsDir } = resolveHandbookDir(deployDir);
  const actions = [];

  const normalizedModel = normalizeModel(model);
  const normalizedK8sTool = normalizeK8sTool(k8sTool);

  const dirs = [
    deployDir,
    path.join(deployDir, 'environments'),
    path.join(deployDir, 'http_services'),
    path.join(deployDir, 'workloads'),
    path.join(deployDir, 'clients'),
    path.join(deployDir, 'scripts'),
    handbookDir,
    path.join(handbookDir, 'runbooks'),
    path.join(deployDir, 'k8s'),
    path.join(deployDir, 'k8s', 'helm'),
    path.join(deployDir, 'k8s', 'kustomize'),
    path.join(deployDir, 'k8s', 'manifests')
  ];

  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath) && !dryRun) {
    const config = {
      version: 1,
      updatedAt: nowIso(),
      model: normalizedModel,
      k8s: { tool: normalizedK8sTool },
      environments: [
        { id: 'dev', description: 'Development', canDeploy: true, requiresApproval: false },
        { id: 'staging', description: 'Staging', canDeploy: true, requiresApproval: true },
        { id: 'prod', description: 'Production', canDeploy: true, requiresApproval: true }
      ],
      services: [],
      history: []
    };
    writeJson(configPath, config);
    actions.push({ op: 'write', path: configPath });

    // Ensure default env files exist (copy-if-missing)
    for (const env of config.environments) {
      const envFile = path.join(getEnvsDir(repoRoot), `${env.id}.yaml`);
      const envContent = `# ${env.id} environment configuration\n# Generated: ${nowIso()}\n\nenvironment: ${env.id}\n# Add environment-specific settings here\n`;
      actions.push(dryRun ? { op: 'write', path: envFile, mode: 'dry-run' } : writeFileIfMissing(envFile, envContent));
    }
  }

  // Create AGENTS.md
  const agentsPath = path.join(deployDir, 'AGENTS.md');
  const agentsContent = `# Deployment (LLM-first)

## Commands

\`\`\`bash
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs init --model k8s --k8s-tool helm
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs add-service --id api --artifact ghcr.io/acme/api:v1.2.3
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs list
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs plan --service api --env staging
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs status --env staging
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs verify
\`\`\`

## Notes

- This feature plans deployments; humans execute the printed commands.
- Keep environment-specific values in \`environments/<env>.yaml\`.
`;

  if (dryRun) {
    actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(agentsPath, agentsContent));
  }

  console.log('[ok] Deployment configuration initialized.');
  if (usesLegacyWorkdocsDir) {
    console.log('[warn] Detected legacy ops/deploy/workdocs/. Consider renaming to ops/deploy/handbook/.');
  }
  for (const a of actions) {
    const modeStr = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${modeStr}${reason}`);
  }
}

function cmdListEnvs(repoRoot, format) {
  const config = loadConfig(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify({ environments: config.environments }, null, 2));
    return;
  }

  console.log(`Deployment Environments (${config.environments.length}):\n`);
  for (const env of config.environments) {
    const flags = [];
    if (env.requiresApproval) flags.push('requires-approval');
    if (env.canDeploy === false) flags.push('deploy-disabled');
    const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
    console.log(`  [${env.id}] ${env.description || ''}${flagStr}`);
  }
}

function cmdAddEnv(repoRoot, id, description) {
  if (!id) die('[error] --id is required');

  const config = loadConfig(repoRoot);
  if (config.environments.find((e) => e.id === id)) {
    die(`[error] Environment "${id}" already exists`);
  }

  config.environments.push({
    id,
    description: description || `${id} environment`,
    canDeploy: true,
    requiresApproval: id !== 'dev',
    addedAt: nowIso()
  });
  saveConfig(repoRoot, config);

  const envFile = path.join(getEnvsDir(repoRoot), `${id}.yaml`);
  if (!fs.existsSync(envFile)) {
    const content = `# ${id} environment configuration\n# Generated: ${nowIso()}\n\nenvironment: ${id}\n# Add environment-specific settings here\n`;
    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, content, 'utf8');
  }

  console.log(`[ok] Added environment: ${id}`);
}

function cmdListServices(repoRoot, format) {
  const config = loadConfig(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify({ services: config.services }, null, 2));
    return;
  }

  console.log(`Services (${config.services.length}):\n`);
  if (config.services.length === 0) {
    console.log('  (no services registered)');
    console.log('  Run: node .ai/skills/features/deployment/scripts/ctl-deploy.mjs add-service --id api --artifact ghcr.io/acme/api:v1.2.3');
    return;
  }

  for (const svc of config.services) {
    console.log(`  [${svc.kind}] ${svc.id} -> ${svc.artifact}${svc.description ? `  (${svc.description})` : ''}`);
  }
}

function cmdAddService(repoRoot, id, artifact, kind, description) {
  if (!id) die('[error] --id is required');
  if (!artifact) die('[error] --artifact is required');

  const normalizedKind = normalizeServiceKind(kind);
  const config = loadConfig(repoRoot);

  if (config.services.find((s) => s.id === id)) {
    die(`[error] Service "${id}" already exists`);
  }

  const entry = {
    id,
    kind: normalizedKind,
    artifact: String(artifact),
    description: description ? String(description) : '',
    addedAt: nowIso()
  };

  config.services.push(entry);
  saveConfig(repoRoot, config);

  const descriptorPath = getServiceDescriptorPath(repoRoot, id, normalizedKind);
  const descriptor = `# Service deployment descriptor\n# Generated: ${nowIso()}\n\nid: ${id}\nkind: ${normalizedKind}\nartifact: ${artifact}\n${description ? `description: ${description}\n` : ''}`;
  writeFileIfMissing(descriptorPath, descriptor);

  console.log(`[ok] Added service: ${id} (${normalizedKind})`);
}

function cmdPlan(repoRoot, serviceId, envId, tagOverride) {
  if (!serviceId) die('[error] --service is required');
  if (!envId) die('[error] --env is required');

  const config = loadConfig(repoRoot);
  const env = config.environments.find((e) => e.id === envId);
  if (!env) die(`[error] Environment "${envId}" not found. Run: ctl-deploy list-envs`);

  const svc = config.services.find((s) => s.id === serviceId);
  if (!svc) die(`[error] Service "${serviceId}" not found. Run: ctl-deploy list`);

  const { repository, tag } = parseArtifactRef(svc.artifact);
  const finalTag = tagOverride ? String(tagOverride) : tag;
  const finalArtifact = repository ? `${repository}:${finalTag}` : svc.artifact;

  console.log('\nDeployment Plan');
  console.log('----------------------------------------');
  console.log(`Service:       ${serviceId}`);
  console.log(`Environment:   ${envId}`);
  console.log(`Model:         ${config.model}`);
  if (config.model === 'k8s') console.log(`K8s Tool:      ${config.k8s?.tool || 'helm'}`);
  console.log(`Artifact:      ${finalArtifact}`);
  console.log('----------------------------------------\n');

  console.log('Commands (human-executable):\n');

  if (config.model === 'k8s') {
    const tool = config.k8s?.tool || 'helm';
    if (tool === 'helm') {
      console.log(`# (Example) Helm deploy using the chart template\nhelm upgrade --install ${serviceId} ops/deploy/k8s/helm/chart-template -n ${envId} \\\n  --set image.repository=${repository || '<repo>'} \\\n  --set image.tag=${finalTag}\n`);
    } else if (tool === 'kustomize') {
      console.log(`# (Example) Kustomize deploy\nkubectl apply -k ops/deploy/k8s/kustomize/base\n`);
    } else {
      console.log(`# (Example) Raw manifests deploy\nkubectl apply -f ops/deploy/k8s/manifests/\n`);
    }

    console.log('# Optional: verify health (adjust URL)\nnode ops/deploy/scripts/healthcheck.mjs --url https://example.com/health\n');
  } else {
    console.log(
      `# Model "${config.model}"\n# See: ops/deploy/handbook/runbooks/rollback-procedure.md\n# Legacy: ops/deploy/workdocs/runbooks/rollback-procedure.md\n# Add your deploy procedure here.\n`
    );
  }

  config.history.push({
    ts: nowIso(),
    action: 'plan',
    service: serviceId,
    env: envId,
    model: config.model,
    artifact: finalArtifact
  });
  saveConfig(repoRoot, config);
}

function cmdHistory(repoRoot, envId, serviceId, format) {
  const config = loadConfig(repoRoot);
  let entries = Array.isArray(config.history) ? config.history : [];

  if (envId) entries = entries.filter((e) => e.env === envId);
  if (serviceId) entries = entries.filter((e) => e.service === serviceId);

  if (format === 'json') {
    console.log(JSON.stringify({ history: entries }, null, 2));
    return;
  }

  console.log(`History (${entries.length}):\n`);
  if (entries.length === 0) {
    console.log('  (no entries)');
    return;
  }
  for (const e of entries.slice(-50)) {
    console.log(`  ${e.ts}  [${e.action}] ${e.service} -> ${e.env}  (${e.model})`);
  }
}

function cmdStatus(repoRoot, envId, serviceId, format) {
  const config = loadConfig(repoRoot);

  const initialized = fs.existsSync(getDeployDir(repoRoot));
  const status = {
    initialized,
    model: config.model,
    k8sTool: config.k8s?.tool,
    environments: config.environments.length,
    services: config.services.length,
    updatedAt: config.updatedAt,
    recentHistory: (Array.isArray(config.history) ? config.history : []).slice(-10)
  };

  if (envId) status.env = envId;
  if (serviceId) status.service = serviceId;

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Deployment Status:');
  console.log(`  Initialized: ${initialized ? 'yes' : 'no'}`);
  console.log(`  Model: ${config.model}`);
  if (config.model === 'k8s') console.log(`  K8s Tool: ${config.k8s?.tool || 'helm'}`);
  console.log(`  Environments: ${config.environments.length}`);
  console.log(`  Services: ${config.services.length}`);
  console.log(`  Updated at: ${config.updatedAt || 'never'}`);

  if (envId) {
    const env = config.environments.find((e) => e.id === envId);
    console.log('');
    console.log(`  Env: ${envId}`);
    if (!env) {
      console.log('    (not found)');
    } else {
      console.log(`    canDeploy: ${env.canDeploy ?? true}`);
      console.log(`    requiresApproval: ${env.requiresApproval ?? false}`);
    }
  }

  if (serviceId) {
    const svc = config.services.find((s) => s.id === serviceId);
    console.log('');
    console.log(`  Service: ${serviceId}`);
    if (!svc) {
      console.log('    (not found)');
    } else {
      console.log(`    kind: ${svc.kind}`);
      console.log(`    artifact: ${svc.artifact}`);
    }
  }
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  const deployDir = getDeployDir(repoRoot);
  if (!fs.existsSync(deployDir)) {
    errors.push('ops/deploy/ not found. Run: ctl-deploy init');
  }

  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath)) {
    errors.push('ops/deploy/config.json not found. Run: ctl-deploy init');
  }

  const config = loadConfig(repoRoot);
  if (!VALID_MODELS.has(config.model)) {
    errors.push(`Invalid model: ${config.model}`);
  }

  if (config.model === 'k8s' && !VALID_K8S_TOOLS.has(config.k8s?.tool || '')) {
    errors.push(`Invalid k8s.tool: ${config.k8s?.tool}`);
  }

  // Check environment config files exist
  for (const env of config.environments) {
    const envFile = path.join(getEnvsDir(repoRoot), `${env.id}.yaml`);
    if (!fs.existsSync(envFile)) {
      warnings.push(`Environment config missing: environments/${env.id}.yaml`);
    }
  }

  // Check service descriptors exist
  for (const svc of config.services) {
    const p = getServiceDescriptorPath(repoRoot, svc.id, svc.kind);
    if (!fs.existsSync(p)) {
      warnings.push(`Service descriptor missing: ${path.relative(getDeployDir(repoRoot), p)}`);
    }
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
  console.log(ok ? '[ok] Deployment configuration verified.' : '[error] Verification failed.');
  process.exit(ok ? 0 : 1);
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
      cmdInit(repoRoot, !!opts['dry-run'], opts['model'], opts['k8s-tool']);
      break;
    case 'list-envs':
      cmdListEnvs(repoRoot, format);
      break;
    case 'add-env':
      cmdAddEnv(repoRoot, opts['id'], opts['description']);
      break;
    case 'list':
      cmdListServices(repoRoot, format);
      break;
    case 'add-service':
      cmdAddService(repoRoot, opts['id'], opts['artifact'], opts['kind'], opts['description']);
      break;
    case 'plan':
      cmdPlan(repoRoot, opts['service'], opts['env'], opts['tag']);
      break;
    case 'status':
      cmdStatus(repoRoot, opts['env'], opts['service'], format);
      break;
    case 'history':
      cmdHistory(repoRoot, opts['env'], opts['service'], format);
      break;
    case 'verify':
      cmdVerify(repoRoot);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();
