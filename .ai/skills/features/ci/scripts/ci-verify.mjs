#!/usr/bin/env node
/**
 * ci-verify.mjs
 *
 * Shared CI verification entrypoint for provider workflows.
 *
 * Usage:
 *   node .ai/skills/features/ci/scripts/ci-verify.mjs --suite governance
 *   node .ai/skills/features/ci/scripts/ci-verify.mjs --profile pr-gate
 *   node .ai/skills/features/ci/scripts/ci-verify.mjs --list
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SUPPORTED_SUITES = [
  'governance',
  'api',
  'api-context',
  'web-playwright',
  'perf-k6-smoke'
];

const PROFILE_SUITES = {
  'pr-gate': ['governance', 'api', 'api-context', 'web-playwright', 'perf-k6-smoke']
};

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/ci/scripts/ci-verify.mjs [options]

Options:
  --suite <name>             Run one suite (${SUPPORTED_SUITES.join(', ')})
  --profile <name>           Run a suite bundle (supported: ${Object.keys(PROFILE_SUITES).join(', ')})
  --list                     Print supported suites and profiles
  --dry-run                  Print planned commands without executing
  -h, --help                 Show this help message

Examples:
  node .ai/skills/features/ci/scripts/ci-verify.mjs --suite governance
  node .ai/skills/features/ci/scripts/ci-verify.mjs --suite api
  node .ai/skills/features/ci/scripts/ci-verify.mjs --profile pr-gate
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(message) {
  console.error(`[error] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    usage(0);
  }

  const opts = {};
  while (args.length > 0) {
    const token = args.shift();
    if (token === '--suite') {
      opts.suite = args.shift();
      continue;
    }
    if (token === '--profile') {
      opts.profile = args.shift();
      continue;
    }
    if (token === '--list') {
      opts.list = true;
      continue;
    }
    if (token === '--dry-run') {
      opts.dryRun = true;
      continue;
    }
    die(`Unknown option: ${token}`);
  }
  return opts;
}

function listTargets() {
  console.log('Suites:');
  for (const suite of SUPPORTED_SUITES) console.log(`  - ${suite}`);
  console.log('Profiles:');
  for (const [profile, suites] of Object.entries(PROFILE_SUITES)) {
    console.log(`  - ${profile}: ${suites.join(', ')}`);
  }
}

function readPackageScripts() {
  const packagePath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packagePath)) return {};

  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (!pkg || typeof pkg !== 'object') return {};
    if (!pkg.scripts || typeof pkg.scripts !== 'object') return {};
    return pkg.scripts;
  } catch {
    return {};
  }
}

function commandExists(bin) {
  const check = spawnSync('sh', ['-lc', `command -v ${bin} >/dev/null 2>&1`], {
    stdio: 'ignore',
    env: process.env
  });
  return check.status === 0;
}

function resolvePerfSmokeSteps() {
  const scripts = readPackageScripts();
  if (scripts['test:perf:k6']) {
    return {
      source: 'package script test:perf:k6',
      steps: [{ label: 'k6 smoke tests', cmd: 'pnpm', args: ['test:perf:k6'] }]
    };
  }

  const smokeScriptRel = path.join('tests', 'perf', 'k6', 'scripts', 'smoke.mjs');
  const smokeScriptAbs = path.join(process.cwd(), smokeScriptRel);
  const hasSmokeScript = fs.existsSync(smokeScriptAbs);

  if (hasSmokeScript && commandExists('k6')) {
    return {
      source: 'k6 binary fallback',
      steps: [
        { label: 'Ensure k6 artifact directory', ensureDir: path.join('artifacts', 'k6') },
        {
          label: 'k6 smoke tests',
          cmd: 'k6',
          args: ['run', smokeScriptRel, '--summary-export', path.join('artifacts', 'k6', 'summary.json')]
        }
      ]
    };
  }

  if (hasSmokeScript && commandExists('docker')) {
    return {
      source: 'docker fallback (grafana/k6)',
      steps: [
        { label: 'Ensure k6 artifact directory', ensureDir: path.join('artifacts', 'k6') },
        {
          label: 'k6 smoke tests (docker)',
          cmd: 'docker',
          args: [
            'run',
            '--rm',
            '-e',
            'BASE_URL',
            '-e',
            'API_TOKEN',
            '-v',
            `${process.cwd()}:/work`,
            '-w',
            '/work',
            'grafana/k6:latest',
            'run',
            smokeScriptRel,
            '--summary-export',
            path.join('artifacts', 'k6', 'summary.json')
          ]
        }
      ]
    };
  }

  return {
    source: 'default contract fallback (test:perf:k6)',
    note: 'No local k6 fallback detected. Expect downstream repo to define package.json script "test:perf:k6".',
    steps: [{ label: 'k6 smoke tests', cmd: 'pnpm', args: ['test:perf:k6'] }]
  };
}

function resolveSuiteSteps(suite) {
  switch (suite) {
    case 'governance':
      return [
        {
          label: 'Governance lint',
          cmd: 'node',
          args: ['.ai/scripts/ctl-project-governance.mjs', 'lint', '--check', '--project', 'main']
        }
      ];
    case 'api':
      return [{ label: 'API tests', cmd: 'pnpm', args: ['test:api'] }];
    case 'api-context': {
      if (!fs.existsSync('docs/context/api/openapi.yaml') && !fs.existsSync('docs/context/api/openapi.yml')) {
        console.log('[skip] api-context: docs/context/api/openapi.yaml not found. Context Awareness may not be materialized.');
        return [];
      }
      const openapiSrc = fs.existsSync('docs/context/api/openapi.yaml')
        ? 'docs/context/api/openapi.yaml'
        : 'docs/context/api/openapi.yml';
      return [
        {
          label: 'OpenAPI semantic quality check',
          cmd: 'node',
          args: ['.ai/scripts/ctl-openapi-quality.mjs', 'verify', '--source', openapiSrc, '--strict']
        },
        {
          label: 'Regenerate API Index',
          cmd: 'node',
          args: ['.ai/scripts/ctl-api-index.mjs', 'generate', '--source', openapiSrc, '--touch']
        },
        {
          label: 'Verify API Index freshness',
          cmd: 'node',
          args: ['.ai/scripts/ctl-api-index.mjs', 'verify', '--strict']
        },
        {
          label: 'Context layer consistency',
          cmd: 'node',
          args: ['.ai/skills/features/context-awareness/scripts/ctl-context.mjs', 'verify', '--strict']
        },
        {
          label: 'Drift check (generated artifacts)',
          cmd: 'git',
          args: ['diff', '--exit-code', 'docs/context/api/api-index.json', 'docs/context/api/API-INDEX.md', 'docs/context/registry.json']
        }
      ];
    }
    case 'web-playwright':
      return [
        {
          label: 'Playwright browser setup',
          cmd: 'pnpm',
          args: ['exec', 'playwright', 'install', '--with-deps']
        },
        {
          label: 'Playwright E2E tests',
          cmd: 'pnpm',
          args: ['test:e2e:playwright']
        }
      ];
    case 'perf-k6-smoke': {
      const resolved = resolvePerfSmokeSteps();
      console.log(`[info] perf-k6-smoke route: ${resolved.source}`);
      if (resolved.note) console.log(`[warn] ${resolved.note}`);
      return resolved.steps;
    }
    default:
      return null;
  }
}

function runStep(step, dryRun) {
  if (step.ensureDir) {
    if (dryRun) {
      console.log(`[dry-run] ${step.label}: mkdir -p ${step.ensureDir}`);
      return;
    }
    fs.mkdirSync(step.ensureDir, { recursive: true });
    console.log(`[run] ${step.label}: mkdir -p ${step.ensureDir}`);
    return;
  }

  const commandText = `${step.cmd} ${step.args.join(' ')}`.trim();
  if (dryRun) {
    console.log(`[dry-run] ${step.label}: ${commandText}`);
    return;
  }

  console.log(`[run] ${step.label}: ${commandText}`);
  const result = spawnSync(step.cmd, step.args, {
    stdio: 'inherit',
    env: process.env
  });

  if (result.error) {
    die(`Failed to execute "${step.cmd}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runSuite(suite, dryRun) {
  if (!SUPPORTED_SUITES.includes(suite)) {
    die(`Unsupported suite: ${suite}. Supported: ${SUPPORTED_SUITES.join(', ')}`);
  }
  const steps = resolveSuiteSteps(suite);
  for (const step of steps) runStep(step, dryRun);
}

function runProfile(profile, dryRun) {
  const suites = PROFILE_SUITES[profile];
  if (!suites) {
    die(`Unsupported profile: ${profile}. Supported: ${Object.keys(PROFILE_SUITES).join(', ')}`);
  }
  for (const suite of suites) {
    console.log(`[profile] ${profile} -> ${suite}`);
    runSuite(suite, dryRun);
  }
}

function main() {
  const opts = parseArgs(process.argv);

  if (opts.list) {
    listTargets();
    return;
  }

  if (opts.suite && opts.profile) {
    die('Use either --suite or --profile, not both.');
  }
  if (!opts.suite && !opts.profile) {
    die('Missing target. Use --suite <name> or --profile <name>.');
  }

  if (opts.suite) {
    runSuite(opts.suite, Boolean(opts.dryRun));
    return;
  }

  runProfile(opts.profile, Boolean(opts.dryRun));
}

main();
