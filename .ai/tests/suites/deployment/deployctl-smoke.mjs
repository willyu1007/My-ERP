/**
 * deployctl-smoke.mjs
 * Smoke test for ctl-deploy.mjs (init → add-service → plan → verify)
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { assertIncludes } from '../../lib/text.mjs';

export const name = 'deployment-deployctl-smoke';

export function run(ctx) {
  const testDir = path.join(ctx.evidenceDir, name);
  const rootDir = path.join(testDir, 'fixture');
  fs.mkdirSync(rootDir, { recursive: true });

  const deployctl = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'deployment',
    'scripts',
    'ctl-deploy.mjs'
  );

  // 1) init
  const init = runCommand({
    cmd: 'node',
    args: [deployctl, 'init', '--repo-root', rootDir, '--model', 'k8s', '--k8s-tool', 'helm'],
    evidenceDir: testDir,
    label: `${name}.init`,
  });
  if (init.error || init.code !== 0) {
    const detail = init.error ? String(init.error) : init.stderr || init.stdout;
    return { name, status: 'FAIL', error: `deployctl init failed: ${detail}` };
  }

  const configPath = path.join(rootDir, 'ops', 'deploy', 'config.json');
  if (!fs.existsSync(configPath)) {
    return { name, status: 'FAIL', error: 'init did not create ops/deploy/config.json' };
  }

  // Verify default environments created
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.environments || config.environments.length === 0) {
    return { name, status: 'FAIL', error: 'init did not create default environments' };
  }

  // 2) list-envs
  const listEnvs = runCommand({
    cmd: 'node',
    args: [deployctl, 'list-envs', '--repo-root', rootDir, '--format', 'json'],
    evidenceDir: testDir,
    label: `${name}.list-envs`,
  });
  if (listEnvs.error || listEnvs.code !== 0) {
    const detail = listEnvs.error ? String(listEnvs.error) : listEnvs.stderr || listEnvs.stdout;
    return { name, status: 'FAIL', error: `deployctl list-envs failed: ${detail}` };
  }
  assertIncludes(listEnvs.stdout, 'dev', 'Expected dev in list-envs output');
  assertIncludes(listEnvs.stdout, 'staging', 'Expected staging in list-envs output');

  // 3) add-env
  const addEnv = runCommand({
    cmd: 'node',
    args: [deployctl, 'add-env', '--id', 'qa', '--description', 'QA environment', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.add-env`,
  });
  if (addEnv.error || addEnv.code !== 0) {
    const detail = addEnv.error ? String(addEnv.error) : addEnv.stderr || addEnv.stdout;
    return { name, status: 'FAIL', error: `deployctl add-env failed: ${detail}` };
  }

  // Verify env file created
  const qaEnvFile = path.join(rootDir, 'ops', 'deploy', 'environments', 'qa.yaml');
  if (!fs.existsSync(qaEnvFile)) {
    return { name, status: 'FAIL', error: 'add-env did not create environments/qa.yaml' };
  }

  // 4) add-service
  const addService = runCommand({
    cmd: 'node',
    args: [
      deployctl,
      'add-service',
      '--id',
      'api',
      '--artifact',
      'ghcr.io/acme/api:v1.0.0',
      '--kind',
      'http_service',
      '--description',
      'Main API service',
      '--repo-root',
      rootDir,
    ],
    evidenceDir: testDir,
    label: `${name}.add-service`,
  });
  if (addService.error || addService.code !== 0) {
    const detail = addService.error ? String(addService.error) : addService.stderr || addService.stdout;
    return { name, status: 'FAIL', error: `deployctl add-service failed: ${detail}` };
  }

  // 5) list
  const list = runCommand({
    cmd: 'node',
    args: [deployctl, 'list', '--repo-root', rootDir, '--format', 'json'],
    evidenceDir: testDir,
    label: `${name}.list`,
  });
  if (list.error || list.code !== 0) {
    const detail = list.error ? String(list.error) : list.stderr || list.stdout;
    return { name, status: 'FAIL', error: `deployctl list failed: ${detail}` };
  }
  assertIncludes(list.stdout, 'api', 'Expected api in list output');
  assertIncludes(list.stdout, 'ghcr.io/acme/api:v1.0.0', 'Expected artifact in list output');

  // 6) plan
  const plan = runCommand({
    cmd: 'node',
    args: [deployctl, 'plan', '--service', 'api', '--env', 'staging', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.plan`,
  });
  if (plan.error || plan.code !== 0) {
    const detail = plan.error ? String(plan.error) : plan.stderr || plan.stdout;
    return { name, status: 'FAIL', error: `deployctl plan failed: ${detail}` };
  }
  assertIncludes(plan.stdout, 'Deployment Plan', 'Expected Deployment Plan in output');
  assertIncludes(plan.stdout, 'helm', 'Expected helm in plan output');

  // 7) status
  const status = runCommand({
    cmd: 'node',
    args: [deployctl, 'status', '--repo-root', rootDir, '--format', 'json'],
    evidenceDir: testDir,
    label: `${name}.status`,
  });
  if (status.error || status.code !== 0) {
    const detail = status.error ? String(status.error) : status.stderr || status.stdout;
    return { name, status: 'FAIL', error: `deployctl status failed: ${detail}` };
  }
  assertIncludes(status.stdout, '"initialized": true', 'Expected initialized: true in status');

  // 8) history
  const history = runCommand({
    cmd: 'node',
    args: [deployctl, 'history', '--repo-root', rootDir, '--format', 'json'],
    evidenceDir: testDir,
    label: `${name}.history`,
  });
  if (history.error || history.code !== 0) {
    const detail = history.error ? String(history.error) : history.stderr || history.stdout;
    return { name, status: 'FAIL', error: `deployctl history failed: ${detail}` };
  }
  assertIncludes(history.stdout, 'plan', 'Expected plan action in history');

  // 9) verify
  const verify = runCommand({
    cmd: 'node',
    args: [deployctl, 'verify', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.verify`,
  });
  if (verify.error || verify.code !== 0) {
    const detail = verify.error ? String(verify.error) : verify.stderr || verify.stdout;
    return { name, status: 'FAIL', error: `deployctl verify failed: ${detail}` };
  }
  assertIncludes(verify.stdout, '[ok]', 'Expected [ok] in verify output');

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
