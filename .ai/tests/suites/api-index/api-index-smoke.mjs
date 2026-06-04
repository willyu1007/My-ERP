/**
 * api-index-smoke.mjs
 * Smoke test for ctl-api-index.mjs (generate → verify → diff)
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { assertIncludes } from '../../lib/text.mjs';

export const name = 'api-index-smoke';

const SAMPLE_OPENAPI = `openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
  description: Smoke-test fixture
servers: []
paths:
  /api/users:
    get:
      operationId: listUsers
      summary: List all users
      tags: [users]
      parameters:
        - name: limit
          in: query
          required: false
          schema:
            type: integer
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                  total:
                    type: integer
        '401':
          description: Unauthorized
    post:
      operationId: createUser
      summary: Create a new user
      tags: [users]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, name]
              properties:
                email:
                  type: string
                name:
                  type: string
                role:
                  type: string
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                type: object
                required: [id, email]
                properties:
                  id:
                    type: string
                  email:
                    type: string
        '400':
          description: Validation error
        '401':
          description: Unauthorized
  /api/users/{id}:
    get:
      operationId: getUser
      summary: Get user by ID
      tags: [users]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Success
        '404':
          description: Not found
components:
  schemas: {}
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`;

const MODIFIED_OPENAPI = SAMPLE_OPENAPI.replace(
  'summary: List all users',
  'summary: List users (updated)'
);

export function run(ctx) {
  const testDir = path.join(ctx.evidenceDir, name);
  const rootDir = path.join(testDir, 'fixture');
  fs.mkdirSync(rootDir, { recursive: true });

  const ctlApiIndex = path.join(ctx.repoRoot, '.ai', 'scripts', 'ctl-api-index.mjs');
  const apiDir = path.join(rootDir, 'docs', 'context', 'api');
  fs.mkdirSync(apiDir, { recursive: true });

  const openapiPath = path.join(apiDir, 'openapi.yaml');
  const indexJsonPath = path.join(apiDir, 'api-index.json');
  const indexMdPath = path.join(apiDir, 'API-INDEX.md');

  // 1) Write sample OpenAPI
  fs.writeFileSync(openapiPath, SAMPLE_OPENAPI, 'utf8');

  // 2) Generate
  const gen = runCommand({
    cmd: 'node',
    args: [ctlApiIndex, 'generate', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.generate`,
  });
  if (gen.error || gen.code !== 0) {
    return { name, status: 'FAIL', error: `generate failed: ${gen.error || gen.stderr || gen.stdout}` };
  }
  assertIncludes(gen.stdout, '[ok]', 'Expected [ok] in generate output');
  assertIncludes(gen.stdout, '3 endpoints', 'Expected 3 endpoints');

  // 3) Validate generated files exist
  if (!fs.existsSync(indexJsonPath)) {
    return { name, status: 'FAIL', error: 'api-index.json not created' };
  }
  if (!fs.existsSync(indexMdPath)) {
    return { name, status: 'FAIL', error: 'API-INDEX.md not created' };
  }

  // 4) Validate api-index.json structure
  const index = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
  if (index.version !== 1) {
    return { name, status: 'FAIL', error: `Expected version 1, got ${index.version}` };
  }
  if (index.stats.totalEndpoints !== 3) {
    return { name, status: 'FAIL', error: `Expected 3 endpoints, got ${index.stats.totalEndpoints}` };
  }
  if (!index.sourceChecksumSha256 || index.sourceChecksumSha256.length !== 64) {
    return { name, status: 'FAIL', error: 'Invalid sourceChecksumSha256' };
  }

  const postUser = index.endpoints.find(e => e.method === 'POST' && e.path === '/api/users');
  if (!postUser) {
    return { name, status: 'FAIL', error: 'POST /api/users endpoint missing' };
  }
  if (postUser.operationId !== 'createUser') {
    return { name, status: 'FAIL', error: `Expected operationId createUser, got ${postUser.operationId}` };
  }
  if (!postUser.input.body || !postUser.input.body.required.includes('email')) {
    return { name, status: 'FAIL', error: 'POST /api/users missing required field email in body' };
  }
  if (!postUser.errors.includes(400) || !postUser.errors.includes(401)) {
    return { name, status: 'FAIL', error: 'POST /api/users missing expected error codes' };
  }

  // 5) Validate API-INDEX.md content
  const mdContent = fs.readFileSync(indexMdPath, 'utf8');
  assertIncludes(mdContent, 'POST', 'Expected POST in markdown');
  assertIncludes(mdContent, '/api/users', 'Expected /api/users in markdown');
  assertIncludes(mdContent, 'Create a new user', 'Expected summary in markdown');

  // 6) Verify (should pass — just generated)
  const verify1 = runCommand({
    cmd: 'node',
    args: [ctlApiIndex, 'verify', '--strict', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.verify-pass`,
  });
  if (verify1.error || verify1.code !== 0) {
    return { name, status: 'FAIL', error: `verify after generate should pass: ${verify1.error || verify1.stderr}` };
  }
  assertIncludes(verify1.stdout, '[ok]', 'Expected [ok] in verify output');

  // 7) Modify OpenAPI → verify should fail (stale)
  fs.writeFileSync(openapiPath, MODIFIED_OPENAPI, 'utf8');
  const verify2 = runCommand({
    cmd: 'node',
    args: [ctlApiIndex, 'verify', '--strict', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.verify-stale`,
  });
  if (verify2.code === 0) {
    return { name, status: 'FAIL', error: 'verify --strict should fail after OpenAPI modification' };
  }

  // 8) Diff — should detect changes
  const diff1 = runCommand({
    cmd: 'node',
    args: [ctlApiIndex, 'diff', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.diff`,
  });
  if (diff1.error || diff1.code !== 0) {
    return { name, status: 'FAIL', error: `diff failed: ${diff1.error || diff1.stderr}` };
  }
  assertIncludes(diff1.stdout, 'GET /api/users', 'Expected changed endpoint in diff output');

  // 9) Re-generate → verify should pass again
  const gen2 = runCommand({
    cmd: 'node',
    args: [ctlApiIndex, 'generate', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.regenerate`,
  });
  if (gen2.error || gen2.code !== 0) {
    return { name, status: 'FAIL', error: `re-generate failed: ${gen2.error || gen2.stderr}` };
  }

  const verify3 = runCommand({
    cmd: 'node',
    args: [ctlApiIndex, 'verify', '--strict', '--repo-root', rootDir],
    evidenceDir: testDir,
    label: `${name}.verify-after-regen`,
  });
  if (verify3.error || verify3.code !== 0) {
    return { name, status: 'FAIL', error: `verify after re-generate should pass: ${verify3.error || verify3.stderr}` };
  }

  // 10) Verify updated content
  const index2 = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
  const getUser = index2.endpoints.find(e => e.method === 'GET' && e.path === '/api/users');
  if (!getUser || getUser.summary !== 'List users (updated)') {
    return { name, status: 'FAIL', error: 'Re-generated index should reflect updated summary' };
  }

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
