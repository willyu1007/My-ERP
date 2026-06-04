/**
 * api-index-focused.mjs
 * Focused regression tests:
 *   1) Idempotent output (same OpenAPI → byte-identical JSON)
 *   2) securitySchemes-based auth detection (header)
 *   3) YAML anchor fail-fast
 *   4) Path-level parameter merging
 *   5) Markdown emphasis in descriptions not falsely rejected as YAML alias
 *   6) apiKey in query/cookie generates correct curl examples
 *   7) Optional auth semantics (security: [{}] and [{}, {scheme}])
 *   8) --out-md to a separate directory
 *   9) Pipe character in summary escaped in Markdown table
 */
import fs from 'fs';
import path from 'path';
import { runCommand } from '../../lib/exec.mjs';

export const name = 'api-index-focused';

function makeFixtureDir(ctx) {
  const d = path.join(ctx.evidenceDir, name, 'fixture');
  const apiDir = path.join(d, 'docs', 'context', 'api');
  fs.mkdirSync(apiDir, { recursive: true });
  return { rootDir: d, apiDir };
}

function ctlPath(ctx) {
  return path.join(ctx.repoRoot, '.ai', 'scripts', 'ctl-api-index.mjs');
}

function generate(ctx, rootDir, label) {
  return runCommand({
    cmd: 'node',
    args: [ctlPath(ctx), 'generate', '--repo-root', rootDir],
    evidenceDir: path.join(ctx.evidenceDir, name),
    label,
  });
}

function writeOpenApi(apiDir, yaml) {
  fs.writeFileSync(path.join(apiDir, 'openapi.yaml'), yaml, 'utf8');
}

function readIndex(apiDir) {
  return JSON.parse(fs.readFileSync(path.join(apiDir, 'api-index.json'), 'utf8'));
}

// ---- Test 1: Idempotent output ----

function testIdempotent(ctx) {
  const { rootDir, apiDir } = makeFixtureDir(ctx);
  writeOpenApi(apiDir, `openapi: 3.1.0
info:
  title: Idem Test
  version: 1.0.0
paths:
  /ping:
    get:
      operationId: ping
      summary: Ping
      responses:
        '200':
          description: ok
`);

  const r1 = generate(ctx, rootDir, 'idem-gen1');
  if (r1.code !== 0) return { name: 'idempotent', status: 'FAIL', error: `gen1 failed: ${r1.stderr}` };
  const json1 = fs.readFileSync(path.join(apiDir, 'api-index.json'), 'utf8');

  const r2 = generate(ctx, rootDir, 'idem-gen2');
  if (r2.code !== 0) return { name: 'idempotent', status: 'FAIL', error: `gen2 failed: ${r2.stderr}` };
  const json2 = fs.readFileSync(path.join(apiDir, 'api-index.json'), 'utf8');

  if (json1 !== json2) {
    return { name: 'idempotent', status: 'FAIL', error: 'Two identical generates produced different output' };
  }
  return { name: 'idempotent', status: 'PASS' };
}

// ---- Test 2: securitySchemes-based auth detection ----

function testSecuritySchemes(ctx) {
  const { rootDir, apiDir } = makeFixtureDir(ctx);
  writeOpenApi(apiDir, `openapi: 3.1.0
info:
  title: Auth Test
  version: 1.0.0
paths:
  /bearer:
    get:
      operationId: bearerEndpoint
      summary: Bearer
      security:
        - myJwt: []
      responses:
        '200':
          description: ok
  /apikey:
    get:
      operationId: apikeyEndpoint
      summary: API Key
      security:
        - customAuth: []
      responses:
        '200':
          description: ok
  /basic:
    get:
      operationId: basicEndpoint
      summary: Basic
      security:
        - myBasic: []
      responses:
        '200':
          description: ok
  /public:
    get:
      operationId: publicEndpoint
      summary: Public
      responses:
        '200':
          description: ok
components:
  securitySchemes:
    myJwt:
      type: http
      scheme: bearer
    customAuth:
      type: apiKey
      in: header
      name: X-Custom-Key
    myBasic:
      type: http
      scheme: basic
`);

  const r = generate(ctx, rootDir, 'auth-gen');
  if (r.code !== 0) return { name: 'securitySchemes', status: 'FAIL', error: `generate failed: ${r.stderr}` };
  const idx = readIndex(apiDir);

  const bearer = idx.endpoints.find(e => e.path === '/bearer');
  const apikey = idx.endpoints.find(e => e.path === '/apikey');
  const basic = idx.endpoints.find(e => e.path === '/basic');
  const pub = idx.endpoints.find(e => e.path === '/public');

  if (bearer?.auth !== 'bearer') return { name: 'securitySchemes', status: 'FAIL', error: `Expected bearer, got ${bearer?.auth}` };
  if (apikey?.auth !== 'apiKey') return { name: 'securitySchemes', status: 'FAIL', error: `Expected apiKey, got ${apikey?.auth}` };
  if (basic?.auth !== 'basic') return { name: 'securitySchemes', status: 'FAIL', error: `Expected basic, got ${basic?.auth}` };
  if (pub?.auth !== 'none') return { name: 'securitySchemes', status: 'FAIL', error: `Expected none, got ${pub?.auth}` };

  if (!apikey?.example?.curl?.includes('X-Custom-Key')) {
    return { name: 'securitySchemes', status: 'FAIL', error: `Expected X-Custom-Key in curl, got: ${apikey?.example?.curl}` };
  }

  return { name: 'securitySchemes', status: 'PASS' };
}

// ---- Test 3: YAML anchor fail-fast ----

function testAnchorFailFast(ctx) {
  const { rootDir, apiDir } = makeFixtureDir(ctx);
  writeOpenApi(apiDir, `openapi: 3.1.0
info:
  title: Anchor Test
  version: 1.0.0
x-shared: &shared
  name: shared
paths: {}
`);

  const r = generate(ctx, rootDir, 'anchor-gen');
  if (r.code === 0) {
    return { name: 'anchor-fail-fast', status: 'FAIL', error: 'Expected non-zero exit for YAML anchors' };
  }
  if (!r.stderr?.includes('anchors') && !r.stdout?.includes('anchors')) {
    return { name: 'anchor-fail-fast', status: 'FAIL', error: `Expected "anchors" in error output, got: ${r.stderr || r.stdout}` };
  }
  return { name: 'anchor-fail-fast', status: 'PASS' };
}

// ---- Test 4: Path-level parameter merging ----

function testPathLevelParams(ctx) {
  const { rootDir, apiDir } = makeFixtureDir(ctx);
  writeOpenApi(apiDir, `openapi: 3.1.0
info:
  title: Params Test
  version: 1.0.0
paths:
  /items/{itemId}:
    parameters:
      - name: itemId
        in: path
        required: true
        schema:
          type: string
    get:
      operationId: getItem
      summary: Get item
      parameters:
        - name: fields
          in: query
          schema:
            type: string
      responses:
        '200':
          description: ok
`);

  const r = generate(ctx, rootDir, 'params-gen');
  if (r.code !== 0) return { name: 'path-level-params', status: 'FAIL', error: `generate failed: ${r.stderr}` };
  const idx = readIndex(apiDir);
  const ep = idx.endpoints[0];

  if (!ep.input.params.includes('itemId')) {
    return { name: 'path-level-params', status: 'FAIL', error: `Expected itemId in params, got: ${JSON.stringify(ep.input.params)}` };
  }
  if (!ep.input.query.includes('fields')) {
    return { name: 'path-level-params', status: 'FAIL', error: `Expected fields in query, got: ${JSON.stringify(ep.input.query)}` };
  }
  return { name: 'path-level-params', status: 'PASS' };
}

// ---- Test 5: Markdown emphasis in descriptions should NOT trigger YAML alias detection ----

function testMarkdownNotFalsePositive(ctx) {
  const { rootDir, apiDir } = makeFixtureDir(ctx);
  writeOpenApi(apiDir, `openapi: 3.1.0
info:
  title: Markdown Test
  version: 1.0.0
  description: Get *all* items & more
paths:
  /api/items:
    get:
      operationId: listItems
      summary: List *all* items
      responses:
        '200':
          description: ok
`);

  const r = generate(ctx, rootDir, 'md-no-fp');
  if (r.code !== 0) {
    return { name: 'markdown-no-false-positive', status: 'FAIL', error: `Valid OpenAPI with Markdown emphasis was rejected: ${r.stderr}` };
  }
  const idx = readIndex(apiDir);
  if (idx.endpoints[0]?.summary !== 'List *all* items') {
    return { name: 'markdown-no-false-positive', status: 'FAIL', error: `Summary not preserved: ${idx.endpoints[0]?.summary}` };
  }
  return { name: 'markdown-no-false-positive', status: 'PASS' };
}

// ---- Test 6: apiKey in query and cookie generates correct curl ----

function testApiKeyQueryCookie(ctx) {
  const { rootDir, apiDir } = makeFixtureDir(ctx);
  writeOpenApi(apiDir, `openapi: 3.1.0
info:
  title: ApiKey Loc Test
  version: 1.0.0
paths:
  /api/query-auth:
    get:
      operationId: queryAuth
      summary: Query key auth
      security:
        - queryKey: []
      responses:
        '200':
          description: ok
  /api/cookie-auth:
    get:
      operationId: cookieAuth
      summary: Cookie auth
      security:
        - cookieKey: []
      responses:
        '200':
          description: ok
components:
  securitySchemes:
    queryKey:
      type: apiKey
      in: query
      name: api_key
    cookieKey:
      type: apiKey
      in: cookie
      name: session
`);

  const r = generate(ctx, rootDir, 'apikey-loc');
  if (r.code !== 0) return { name: 'apikey-query-cookie', status: 'FAIL', error: `generate failed: ${r.stderr}` };
  const idx = readIndex(apiDir);

  const qEp = idx.endpoints.find(e => e.path === '/api/query-auth');
  const cEp = idx.endpoints.find(e => e.path === '/api/cookie-auth');

  if (!qEp?.example?.curl?.includes('api_key=')) {
    return { name: 'apikey-query-cookie', status: 'FAIL', error: `Query apiKey missing in curl: ${qEp?.example?.curl}` };
  }
  if (!cEp?.example?.curl?.includes('Cookie:') || !cEp?.example?.curl?.includes('session=')) {
    return { name: 'apikey-query-cookie', status: 'FAIL', error: `Cookie apiKey missing in curl: ${cEp?.example?.curl}` };
  }
  return { name: 'apikey-query-cookie', status: 'PASS' };
}

// ---- Test 7: Optional auth semantics ----

function testOptionalAuth(ctx) {
  const { rootDir, apiDir } = makeFixtureDir(ctx);
  writeOpenApi(apiDir, `openapi: 3.1.0
info:
  title: Optional Auth Test
  version: 1.0.0
paths:
  /fully-public:
    get:
      operationId: fullyPublic
      summary: Only anonymous
      security:
        - {}
      responses:
        '200':
          description: ok
  /optional-bearer:
    get:
      operationId: optBearer
      summary: Anonymous or bearer
      security:
        - {}
        - bearerAuth: []
      responses:
        '200':
          description: ok
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`);

  const r = generate(ctx, rootDir, 'opt-auth');
  if (r.code !== 0) return { name: 'optional-auth', status: 'FAIL', error: `generate failed: ${r.stderr}` };
  const idx = readIndex(apiDir);

  const pub = idx.endpoints.find(e => e.path === '/fully-public');
  const opt = idx.endpoints.find(e => e.path === '/optional-bearer');

  if (pub?.auth !== 'none') {
    return { name: 'optional-auth', status: 'FAIL', error: `security:[{}] should be "none", got "${pub?.auth}"` };
  }
  if (pub?.example?.curl?.includes('Authorization')) {
    return { name: 'optional-auth', status: 'FAIL', error: `security:[{}] curl should have no auth header: ${pub?.example?.curl}` };
  }
  if (opt?.auth !== 'bearer (optional)') {
    return { name: 'optional-auth', status: 'FAIL', error: `security:[{},{bearer}] should be "bearer (optional)", got "${opt?.auth}"` };
  }
  if (!opt?.example?.curl?.includes('Bearer')) {
    return { name: 'optional-auth', status: 'FAIL', error: `optional bearer curl should include Bearer: ${opt?.example?.curl}` };
  }
  return { name: 'optional-auth', status: 'PASS' };
}

// ---- Test 8: --out-md to a separate directory ----

function testOutMdSeparateDir(ctx) {
  const { rootDir, apiDir } = makeFixtureDir(ctx);
  writeOpenApi(apiDir, `openapi: 3.1.0
info:
  title: OutMd Test
  version: 1.0.0
paths:
  /ping:
    get:
      operationId: ping
      summary: Ping
      responses:
        '200':
          description: ok
`);
  const mdDir = path.join(rootDir, 'custom', 'output');
  const mdRel = 'custom/output/INDEX.md';
  const r = runCommand({
    cmd: 'node',
    args: [ctlPath(ctx), 'generate', '--repo-root', rootDir, '--out-md', mdRel],
    evidenceDir: path.join(ctx.evidenceDir, name),
    label: 'outmd-dir',
  });
  if (r.code !== 0) {
    return { name: 'out-md-separate-dir', status: 'FAIL', error: `generate failed: ${r.stderr || r.stdout}` };
  }
  if (!fs.existsSync(path.join(mdDir, 'INDEX.md'))) {
    return { name: 'out-md-separate-dir', status: 'FAIL', error: 'INDEX.md not created in custom dir' };
  }
  return { name: 'out-md-separate-dir', status: 'PASS' };
}

// ---- Test 9: Pipe in summary escaped in Markdown table ----

function testPipeEscaped(ctx) {
  const { rootDir, apiDir } = makeFixtureDir(ctx);
  writeOpenApi(apiDir, `openapi: 3.1.0
info:
  title: Pipe Test
  version: 1.0.0
paths:
  /data:
    get:
      operationId: getData
      summary: "Get A | B"
      responses:
        '200':
          description: ok
`);
  const r = generate(ctx, rootDir, 'pipe-esc');
  if (r.code !== 0) return { name: 'pipe-escaped', status: 'FAIL', error: `generate failed: ${r.stderr}` };
  const md = fs.readFileSync(path.join(apiDir, 'API-INDEX.md'), 'utf8');
  const dataRow = md.split('\n').find(l => l.includes('/data'));
  if (!dataRow) {
    return { name: 'pipe-escaped', status: 'FAIL', error: 'Data row not found in markdown' };
  }
  if (!dataRow.includes('A \\| B')) {
    return { name: 'pipe-escaped', status: 'FAIL', error: `Pipe not escaped in MD: ${dataRow}` };
  }
  const unescaped = dataRow.replace(/\\\|/g, '__ESC__');
  const colCount = unescaped.split('|').filter(c => c.trim() !== '').length;
  if (colCount !== 7) {
    return { name: 'pipe-escaped', status: 'FAIL', error: `Expected 7 columns, got ${colCount}: ${dataRow}` };
  }
  return { name: 'pipe-escaped', status: 'PASS' };
}

// ---- Export ----

export function run(ctx) {
  const tests = [
    testIdempotent, testSecuritySchemes, testAnchorFailFast,
    testPathLevelParams, testMarkdownNotFalsePositive, testApiKeyQueryCookie,
    testOptionalAuth, testOutMdSeparateDir, testPipeEscaped,
  ];
  for (const t of tests) {
    const result = t(ctx);
    ctx.log(`[${name}] ${result.name}: ${result.status}`);
    if (result.status === 'FAIL') return { name, status: 'FAIL', error: `${result.name}: ${result.error}` };
  }
  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
