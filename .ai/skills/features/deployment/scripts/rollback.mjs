#!/usr/bin/env node
/**
 * rollback.mjs - Rollback Script
 *
 * Provides rollback guidance and commands.
 *
 * Usage:
 *   node .ai/skills/features/deployment/scripts/rollback.mjs --service <service> --env <env>
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

function parseArgs(args) {
  const result = { flags: {} };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        result.flags[key] = nextArg;
        i++;
      } else {
        result.flags[key] = true;
      }
    }
  }
  return result;
}

function resolveRepoRoot(flagValue) {
  if (flagValue) return resolve(flagValue);
  return resolve(process.cwd());
}

function loadConfig(repoRoot) {
  const configPath = join(repoRoot, 'ops/deploy/config.json');
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);
  const repoRoot = resolveRepoRoot(parsed.flags['repo-root']);

  if (parsed.flags.help) {
    console.log(`
rollback.mjs - Rollback Script

Usage:
  node .ai/skills/features/deployment/scripts/rollback.mjs --service <service> --env <env>

	Options:
	  --service <id>  Service to rollback (required)
	  --env <env>     Target environment (required)
	  --repo-root <path>  Repo root (default: cwd)
	  --help          Show this help

This script provides rollback guidance and commands.
Actual rollback execution requires human intervention.
`);
    return 0;
  }

  const { service, env } = parsed.flags;

  if (!service || !env) {
    console.error('Error: --service and --env are required.');
    console.error('Run with --help for usage.');
    return 1;
  }

  const config = loadConfig(repoRoot);
  if (!config) {
    console.error('Error: Deployment config not found.');
    console.error('Run: node .ai/skills/features/deployment/scripts/ctl-deploy.mjs init');
    return 1;
  }

  const services = Array.isArray(config.services) ? config.services : [];
  const svc = services.find(s => s.id === service);
  if (!svc) {
    console.error(`Error: Service "${service}" not found.`);
    if (services.length > 0) {
      console.error(`Known services: ${services.map(s => s.id).join(', ')}`);
    } else {
      console.error('No services are registered yet. Run: node .ai/skills/features/deployment/scripts/ctl-deploy.mjs add-service --id <id> --artifact <ref>');
    }
    return 1;
  }

  console.log(`\nRollback Plan`);
  console.log(`${'-'.repeat(40)}`);
  console.log(`Service:     ${service}`);
  console.log(`Environment: ${env}`);
  console.log(`Model:       ${config.model}`);
  console.log(`${'-'.repeat(40)}`);

  console.log(`\n[warn] Rollback requires human execution.`);
  console.log(`\nRollback commands:`);

  if (config.model === 'k8s') {
    console.log(`
# Kubernetes rollback
kubectl rollout undo deployment/${service} -n ${env}

# Check rollout status
kubectl rollout status deployment/${service} -n ${env}

# View rollout history
kubectl rollout history deployment/${service} -n ${env}
`);
  } else {
    console.log(`
# Refer to your ${config.model} rollback procedure
# Check ops/deploy/handbook/runbooks/rollback-procedure.md
# (legacy) ops/deploy/workdocs/runbooks/rollback-procedure.md
`);
  }

  console.log(`\nSee: ops/deploy/handbook/runbooks/rollback-procedure.md (legacy: ops/deploy/workdocs/runbooks/rollback-procedure.md)`);
  return 0;
}

process.exit(main());
