/**
 * system.mjs
 * Environment public smoke test
 */
import fs from 'fs';
import path from 'path';

import { assertIncludes, assertNotIncludes } from '../../lib/text.mjs';
import { createPublicEnvironmentFixture, readUtf8 } from '../../lib/environment-fixture.mjs';
import { runCommand } from '../../lib/exec.mjs';

export const name = 'environment-system';

export function run(ctx) {
  let fixture;
  try {
    fixture = createPublicEnvironmentFixture(ctx, name);
  } catch (error) {
    return { name, status: 'FAIL', error: error instanceof Error ? error.message : String(error) };
  }
  if (fixture.skip) {
    ctx.log(`[${name}] SKIP (${fixture.reason})`);
    return { name, status: 'SKIP', reason: fixture.reason };
  }

  const { python, testDir, rootDir, scripts, paths } = fixture;
  const maintainerOnlyArtifacts = [
    path.join(rootDir, 'env', 'inventory', 'staging.yaml'),
    path.join(rootDir, 'env', 'values', 'staging.yaml'),
    path.join(rootDir, 'env', 'secrets', 'staging.ref.yaml'),
  ];
  const leakedMaintainerArtifact = maintainerOnlyArtifacts.find((artifactPath) => fs.existsSync(artifactPath));
  if (leakedMaintainerArtifact || paths.stagingState || paths.stagingMockCloudDir) {
    return {
      name,
      status: 'FAIL',
      error: `public environment fixture leaked maintainer-only scaffolding: ${leakedMaintainerArtifact || 'cloud paths present'}`,
    };
  }

  const validationMd = `${rootDir}/validation.md`;
  const validate = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.contractctl, 'validate', '--root', rootDir, '--out', validationMd],
    evidenceDir: testDir,
    label: `${name}.contractctl.validate`,
  });
  if (validate.error || validate.code !== 0) {
    const detail = validate.error ? String(validate.error) : validate.stderr || validate.stdout;
    return { name, status: 'FAIL', error: `env-contractctl validate failed: ${detail}` };
  }
  assertIncludes(readUtf8(validationMd), 'Status: **PASS**', 'Expected PASS in validation.md');

  const generateMd = `${rootDir}/generate.md`;
  const generate = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.contractctl, 'generate', '--root', rootDir, '--out', generateMd],
    evidenceDir: testDir,
    label: `${name}.contractctl.generate`,
  });
  if (generate.error || generate.code !== 0) {
    const detail = generate.error ? String(generate.error) : generate.stderr || generate.stdout;
    return { name, status: 'FAIL', error: `env-contractctl generate failed: ${detail}` };
  }
  if (!fs.existsSync(paths.envExample)) {
    return { name, status: 'FAIL', error: 'missing env/.env.example' };
  }
  assertIncludes(readUtf8(paths.envExample), 'DATABASE_URL', 'Expected DATABASE_URL in env/.env.example');

  if (!fs.existsSync(paths.envDoc)) {
    return { name, status: 'FAIL', error: 'missing docs/env.md' };
  }
  assertIncludes(readUtf8(paths.envDoc), 'DATABASE_URL', 'Expected DATABASE_URL in docs/env.md');

  if (!fs.existsSync(paths.envContractJson)) {
    return { name, status: 'FAIL', error: 'missing docs/context/env/contract.json' };
  }
  assertIncludes(readUtf8(paths.envContractJson), '"DATABASE_URL"', 'Expected DATABASE_URL in contract.json');

  const doctorMd = `${rootDir}/doctor.md`;
  const doctor = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.localctl, 'doctor', '--root', rootDir, '--env', 'dev', '--out', doctorMd],
    evidenceDir: testDir,
    label: `${name}.localctl.doctor`,
  });
  if (doctor.error || doctor.code !== 0) {
    const detail = doctor.error ? String(doctor.error) : doctor.stderr || doctor.stdout;
    return { name, status: 'FAIL', error: `env-localctl doctor failed: ${detail}` };
  }
  const doctorText = readUtf8(doctorMd);
  assertIncludes(doctorText, 'Status: **PASS**', 'Expected PASS in doctor.md');
  assertNotIncludes(doctorText, 'dev-secret', 'Doctor output leaked secret');

  const compileMd = `${rootDir}/compile.md`;
  const compile = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.localctl, 'compile', '--root', rootDir, '--env', 'dev', '--out', compileMd],
    evidenceDir: testDir,
    label: `${name}.localctl.compile`,
  });
  if (compile.error || compile.code !== 0) {
    const detail = compile.error ? String(compile.error) : compile.stderr || compile.stdout;
    return { name, status: 'FAIL', error: `env-localctl compile failed: ${detail}` };
  }

  if (!fs.existsSync(paths.envLocal)) {
    return { name, status: 'FAIL', error: 'missing .env.local' };
  }

  if (process.platform !== 'win32') {
    const mode = fs.statSync(paths.envLocal).mode & 0o777;
    if (mode !== 0o600) {
      return {
        name,
        status: 'FAIL',
        error: `expected .env.local permission 600, got ${mode.toString(8)} (filesystem may not support chmod)`,
      };
    }
  }

  if (!fs.existsSync(paths.effectiveDev)) {
    return { name, status: 'FAIL', error: 'missing docs/context/env/effective-dev.json' };
  }
  assertNotIncludes(readUtf8(paths.effectiveDev), 'dev-secret', 'Effective dev context leaked secret');

  const connectivityMd = `${rootDir}/connectivity.md`;
  const connectivity = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-S', scripts.localctl, 'connectivity', '--root', rootDir, '--env', 'dev', '--out', connectivityMd],
    evidenceDir: testDir,
    label: `${name}.localctl.connectivity`,
  });
  if (connectivity.error || connectivity.code !== 0) {
    const detail = connectivity.error ? String(connectivity.error) : connectivity.stderr || connectivity.stdout;
    return { name, status: 'FAIL', error: `env-localctl connectivity failed: ${detail}` };
  }
  const connectivityText = readUtf8(connectivityMd);
  assertIncludes(connectivityText, 'Status: **PASS**', 'Expected PASS in connectivity.md');
  assertNotIncludes(connectivityText, 'dev-secret', 'Connectivity output leaked secret');

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
