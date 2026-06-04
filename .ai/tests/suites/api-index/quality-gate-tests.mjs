/**
 * quality-gate-tests.mjs
 * Tests for ctl-openapi-quality.mjs:
 *   1) Valid OpenAPI with all required fields passes
 *   2) Missing operationId detected
 *   3) Duplicate operationId detected
 *   4) Undeclared path param detected
 *   5) Missing security scheme ref detected
 *   6) Empty paths exits 0
 *   7) File not found exits 0 with skip message
 */
import fs from 'fs';
import path from 'path';
import { runCommand } from '../../lib/exec.mjs';

export const name = 'quality-gate-tests';

function makeFixtureDir(ctx, sub) {
  const d = path.join(ctx.evidenceDir, name, sub);
  const apiDir = path.join(d, 'docs', 'context', 'api');
  fs.mkdirSync(apiDir, { recursive: true });
  return { rootDir: d, apiDir };
}

function qualityPath(ctx) {
  return path.join(ctx.repoRoot, '.ai', 'scripts', 'ctl-openapi-quality.mjs');
}

function writeYaml(apiDir, yaml) {
  fs.writeFileSync(path.join(apiDir, 'openapi.yaml'), yaml, 'utf8');
}

function runQuality(ctx, rootDir, sub, extraArgs = []) {
  return runCommand({
    cmd: 'node',
    args: [qualityPath(ctx), 'verify', '--source', 'docs/context/api/openapi.yaml', '--repo-root', rootDir, '--strict', ...extraArgs],
    evidenceDir: path.join(ctx.evidenceDir, name),
    label: sub,
  });
}

const VALID_OPENAPI = `openapi: "3.1.0"
info:
  title: Test API
  version: 1.0.0
paths:
  /api/items:
    get:
      operationId: listItems
      summary: List all items
      tags: [items]
      responses:
        "200":
          description: OK
  /api/items/{id}:
    get:
      operationId: getItem
      summary: Get one item
      tags: [items]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
        "404":
          description: Not found
components:
  schemas: {}
`;

export function run(ctx) {
  const checks = [];
  let allPass = true;

  function check(label, fn) {
    try {
      const ok = fn();
      checks.push({ label, ok });
      if (!ok) allPass = false;
    } catch (e) {
      checks.push({ label, ok: false, error: e.message });
      allPass = false;
    }
  }

  // 1) Valid OpenAPI passes
  check('valid-openapi-passes', () => {
    const { rootDir, apiDir } = makeFixtureDir(ctx, 'valid');
    writeYaml(apiDir, VALID_OPENAPI);
    const r = runQuality(ctx, rootDir, 'valid');
    return r.code === 0;
  });

  // 2) Missing operationId detected
  check('missing-operationId', () => {
    const { rootDir, apiDir } = makeFixtureDir(ctx, 'no-opid');
    writeYaml(apiDir, `openapi: "3.1.0"
info:
  title: Test
  version: 1.0.0
paths:
  /api/x:
    get:
      summary: No operationId
      tags: [x]
      responses:
        "200":
          description: OK
components:
  schemas: {}
`);
    const r = runQuality(ctx, rootDir, 'no-opid');
    return r.code !== 0 && (r.stdout + r.stderr).includes('operationId');
  });

  // 3) Duplicate operationId detected
  check('duplicate-operationId', () => {
    const { rootDir, apiDir } = makeFixtureDir(ctx, 'dup-opid');
    writeYaml(apiDir, `openapi: "3.1.0"
info:
  title: Test
  version: 1.0.0
paths:
  /api/a:
    get:
      operationId: doStuff
      summary: A
      tags: [a]
      responses:
        "200":
          description: OK
  /api/b:
    get:
      operationId: doStuff
      summary: B
      tags: [b]
      responses:
        "200":
          description: OK
components:
  schemas: {}
`);
    const r = runQuality(ctx, rootDir, 'dup-opid');
    return r.code !== 0 && (r.stdout + r.stderr).includes('Duplicate');
  });

  // 4) Undeclared path param
  check('undeclared-path-param', () => {
    const { rootDir, apiDir } = makeFixtureDir(ctx, 'bad-param');
    writeYaml(apiDir, `openapi: "3.1.0"
info:
  title: Test
  version: 1.0.0
paths:
  /api/items/{id}:
    get:
      operationId: getItem
      summary: Get item
      tags: [items]
      responses:
        "200":
          description: OK
components:
  schemas: {}
`);
    const r = runQuality(ctx, rootDir, 'bad-param');
    return r.code !== 0 && (r.stdout + r.stderr).includes('{id}');
  });

  // 5) Missing security scheme ref
  check('missing-security-scheme', () => {
    const { rootDir, apiDir } = makeFixtureDir(ctx, 'bad-sec');
    writeYaml(apiDir, `openapi: "3.1.0"
info:
  title: Test
  version: 1.0.0
paths:
  /api/x:
    get:
      operationId: getX
      summary: X
      tags: [x]
      security:
        - nonExistentScheme: []
      responses:
        "200":
          description: OK
components:
  schemas: {}
  securitySchemes: {}
`);
    const r = runQuality(ctx, rootDir, 'bad-sec');
    return r.code !== 0 && (r.stdout + r.stderr).includes('nonExistentScheme');
  });

  // 6) Empty paths exits 0
  check('empty-paths-ok', () => {
    const { rootDir, apiDir } = makeFixtureDir(ctx, 'empty');
    writeYaml(apiDir, `openapi: "3.1.0"
info:
  title: Test
  version: 1.0.0
paths: {}
components:
  schemas: {}
`);
    const r = runQuality(ctx, rootDir, 'empty');
    return r.code === 0;
  });

  // 7) File not found exits 0
  check('file-not-found-skip', () => {
    const rootDir = path.join(ctx.evidenceDir, name, 'nofile');
    fs.mkdirSync(rootDir, { recursive: true });
    const r = runQuality(ctx, rootDir, 'nofile');
    return r.code === 0 && (r.stdout + r.stderr).includes('skip');
  });

  ctx.log(`[${name}] results: ${checks.map(c => `${c.label}=${c.ok ? 'PASS' : 'FAIL'}`).join(', ')}`);
  return {
    name,
    status: allPass ? 'PASS' : 'FAIL',
    checks,
  };
}
