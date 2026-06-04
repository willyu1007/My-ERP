/**
 * convex-init-contract-smoke.mjs
 * Validate configured-path Convex blueprints and contract bootstrap flow.
 */
import fs from 'fs';
import path from 'path';

import { assertIncludes } from '../../lib/text.mjs';
import {
  createTestDir,
  expectOk,
  materializeConvexFixture,
  runNodeScript,
  scriptPaths,
} from './convex-fixture.mjs';

export const name = 'database-convex-init-contract-smoke';

export function run(ctx) {
  const testDir = createTestDir(ctx, name);
  const scripts = scriptPaths(ctx.repoRoot);
  const blueprintRepoRoot = path.join(testDir, 'blueprint-root');
  fs.mkdirSync(blueprintRepoRoot, { recursive: true });
  const validBlueprintPath = path.join(blueprintRepoRoot, 'project-blueprint.example.json');
  fs.copyFileSync(scripts.exampleBlueprint, validBlueprintPath);

  const validateSingle = runNodeScript({
    script: scripts.initPipeline,
    args: ['validate', '--repo-root', blueprintRepoRoot, '--blueprint', validBlueprintPath],
    cwd: ctx.repoRoot,
    evidenceDir: testDir,
    label: `${name}.validate-single`,
  });
  expectOk(validateSingle, `${name} validate single`);
  assertIncludes(validateSingle.stdout, '[ok] Blueprint is valid', 'Expected valid Convex single-layout blueprint');

  const monorepoBlueprintPath = path.join(blueprintRepoRoot, 'convex-monorepo.blueprint.json');
  const monorepoBlueprint = JSON.parse(fs.readFileSync(validBlueprintPath, 'utf8'));
  monorepoBlueprint.repo.layout = 'monorepo';
  monorepoBlueprint.db.source = {
    kind: 'convex-schema',
    path: 'apps/api/convex/schema.ts',
  };
  fs.writeFileSync(monorepoBlueprintPath, JSON.stringify(monorepoBlueprint, null, 2) + '\n', 'utf8');

  const validateMonorepo = runNodeScript({
    script: scripts.initPipeline,
    args: ['validate', '--repo-root', blueprintRepoRoot, '--blueprint', monorepoBlueprintPath],
    cwd: ctx.repoRoot,
    evidenceDir: testDir,
    label: `${name}.validate-monorepo`,
  });
  expectOk(validateMonorepo, `${name} validate monorepo`);
  assertIncludes(
    validateMonorepo.stdout,
    '[ok] Blueprint is valid',
    'Expected configured monorepo Convex blueprint to validate'
  );

  const outsideBlueprintPath = path.join(blueprintRepoRoot, 'convex-outside.blueprint.json');
  const outsideBlueprint = JSON.parse(fs.readFileSync(validBlueprintPath, 'utf8'));
  outsideBlueprint.db.source = {
    kind: 'convex-schema',
    path: '../outside/convex/schema.ts',
  };
  fs.writeFileSync(outsideBlueprintPath, JSON.stringify(outsideBlueprint, null, 2) + '\n', 'utf8');

  const validateOutside = runNodeScript({
    script: scripts.initPipeline,
    args: ['validate', '--repo-root', blueprintRepoRoot, '--blueprint', outsideBlueprintPath],
    cwd: ctx.repoRoot,
    evidenceDir: testDir,
    label: `${name}.validate-outside`,
  });
  if (validateOutside.error || validateOutside.code === 0) {
    const detail = validateOutside.error ? String(validateOutside.error) : validateOutside.stderr || validateOutside.stdout;
    return { name, status: 'FAIL', error: `expected out-of-repo Convex blueprint validation to fail: ${detail}` };
  }
  assertIncludes(
    `${validateOutside.stdout}\n${validateOutside.stderr}`,
    'must stay within the repo root',
    'Expected out-of-repo blueprint validation error'
  );

  const fixture = materializeConvexFixture(ctx, name, {
    convexSourcePath: 'apps/api/convex/schema.ts',
    rootPackageJson: {
      name: `${name}-workspace`,
      private: true,
      version: '0.0.0',
      workspaces: ['apps/*'],
    },
    packageJsonPath: 'apps/api/package.json',
    packageJson: {
      name: `${name}-api`,
      private: true,
      version: '0.0.0',
    },
    extraFiles: [
      {
        path: 'apps/api/convex/users.ts',
        text: `import { query as baseQuery, mutation as baseMutation } from "./_generated/server";
import { v } from "convex/values";

const authedQuery = baseQuery;
const mutationWithAudit = baseMutation;

export const listByAccount = authedQuery({
  args: {
    accountId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("messages").collect();
  },
});

export const createWithAudit = mutationWithAudit({
  args: {
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      channelId: "stub",
      body: args.body,
      author: "system",
      embedding: [0, 0, 0],
    });
    return null;
  },
});
`,
      },
    ],
  });

  const status = runNodeScript({
    script: fixture.scripts.dbSsotCtl,
    args: ['status', '--repo-root', fixture.rootDir, '--format', 'json'],
    cwd: fixture.rootDir,
    evidenceDir: fixture.testDir,
    label: `${name}.db-ssot-status`,
  });
  expectOk(status, `${name} db-ssot status`);
  const statusJson = JSON.parse(status.stdout);
  if (statusJson.mode !== 'convex') {
    return { name, status: 'FAIL', error: `Expected db.ssot status mode=convex, got ${statusJson.mode}` };
  }
  if (statusJson.paths.convexSchema !== 'apps/api/convex/schema.ts') {
    return { name, status: 'FAIL', error: `Expected nested convex schema path, got ${statusJson.paths.convexSchema}` };
  }
  if ((statusJson.errors || []).length > 0) {
    return { name, status: 'FAIL', error: `Expected no db.ssot config errors, got ${statusJson.errors.join('; ')}` };
  }
  if (!statusJson.exists || statusJson.exists.convexFunctions !== true) {
    return { name, status: 'FAIL', error: 'Expected Convex functions contract to exist after sync-to-context' };
  }
  if (fs.existsSync(path.join(fixture.rootDir, 'convex'))) {
    return { name, status: 'FAIL', error: 'Expected configured nested Convex init to avoid creating a root convex/ scaffold' };
  }

  const verify = runNodeScript({
    script: fixture.scripts.convexCtl,
    args: ['verify', '--repo-root', fixture.rootDir],
    cwd: fixture.rootDir,
    evidenceDir: fixture.testDir,
    label: `${name}.verify`,
  });
  expectOk(verify, `${name} verify`);

  const verifyStrict = runNodeScript({
    script: fixture.scripts.convexCtl,
    args: ['verify', '--repo-root', fixture.rootDir, '--strict'],
    cwd: fixture.rootDir,
    evidenceDir: fixture.testDir,
    label: `${name}.verify-strict`,
  });
  expectOk(verifyStrict, `${name} verify strict`);

  const functionsContract = JSON.parse(fs.readFileSync(fixture.paths.functionsContract, 'utf8'));
  const functionIds = (functionsContract.functions || []).map((fn) => fn.functionId);
  if (!functionIds.includes('messages:list') || !functionIds.includes('messages:create')) {
    return { name, status: 'FAIL', error: 'Expected messages:list and messages:create in generated Convex functions contract' };
  }
  if (!functionIds.includes('users:listByAccount') || !functionIds.includes('users:createWithAudit')) {
    return { name, status: 'FAIL', error: 'Expected alias-based Convex functions in generated contract for nested fixture' };
  }

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
