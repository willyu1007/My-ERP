/**
 * convex-fixture.mjs
 * Shared helpers for Convex database smoke tests.
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';

function buildDbSsotConfig(convexSourcePath) {
  const schemaPath = String(convexSourcePath || 'convex/schema.ts').trim() || 'convex/schema.ts';
  const convexDir = path.posix.dirname(schemaPath);
  return {
    version: 1,
    updatedAt: '2026-03-11T00:00:00.000Z',
    mode: 'convex',
    policy: {
      managedPaths: 'fixed-defaults-v1',
    },
    paths: {
      prismaSchema: 'prisma/schema.prisma',
      dbSchemaTables: 'db/schema/tables.json',
      dbContextContract: 'docs/context/db/schema.json',
      convexSchema: schemaPath,
      convexFunctionsContract: 'docs/context/convex/functions.json',
    },
    db: {
      ssot: 'convex',
      kind: 'convex',
      source: {
        kind: 'convex-schema',
        path: schemaPath,
      },
      contracts: {
        dbSchema: 'docs/context/db/schema.json',
        convexFunctions: 'docs/context/convex/functions.json',
      },
      generated: {
        typesDir: path.posix.join(convexDir, '_generated'),
      },
    },
  };
}

const CONVEX_SCHEMA = `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  channels: defineTable({
    name: v.string(),
    slug: v.string(),
  })
    .index("by_slug", ["slug"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["slug"],
    }),
  messages: defineTable({
    channelId: v.id("channels"),
    body: v.string(),
    author: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_channelId", ["channelId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 3,
      filterFields: ["channelId"],
    }),
});
`;

const CONVEX_MESSAGES = `import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    channelId: v.id("channels"),
  },
  returns: v.array(
    v.object({
      body: v.string(),
      author: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx
      .db
      .query("messages")
      .collect();
    return rows.filter((row) => row.channelId === args.channelId);
  },
});

export const create = mutation({
  args: {
    channelId: v.id("channels"),
    body: v.string(),
    author: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      channelId: args.channelId,
      body: args.body,
      author: args.author,
      embedding: [0, 0, 0],
    });
    return null;
  },
});
`;

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function resolveRepoRelativePath(rootDir, relPath) {
  return path.join(rootDir, ...String(relPath || '').split('/'));
}

function ensureAiSymlink(rootDir, repoRoot) {
  const linkPath = path.join(rootDir, '.ai');
  if (fs.existsSync(linkPath)) return;
  fs.symlinkSync(path.join(repoRoot, '.ai'), linkPath, 'dir');
}

export function createTestDir(ctx, name) {
  const testDir = path.join(ctx.evidenceDir, name);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

export function scriptPaths(repoRoot) {
  return {
    initPipeline: path.join(repoRoot, 'init', '_tools', 'skills', 'initialize-project-from-requirements', 'scripts', 'init-pipeline.mjs'),
    contextCtl: path.join(repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'ctl-context.mjs'),
    dbSsotCtl: path.join(repoRoot, '.ai', 'scripts', 'ctl-db-ssot.mjs'),
    convexCtl: path.join(repoRoot, '.ai', 'skills', 'features', 'database', 'convex-as-ssot', 'scripts', 'ctl-convex.mjs'),
    dbDocCtl: path.join(repoRoot, '.ai', 'skills', 'features', 'database', 'db-human-interface', 'scripts', 'ctl-db-doc.mjs'),
    exampleBlueprint: path.join(
      repoRoot,
      'init',
      '_tools',
      'skills',
      'initialize-project-from-requirements',
      'templates',
      'project-blueprint.example.json'
    ),
  };
}

export function runNodeScript({ script, args, cwd, evidenceDir, label }) {
  return runCommand({
    cmd: 'node',
    args: [script, ...args],
    cwd,
    evidenceDir,
    label,
  });
}

export function expectOk(result, label) {
  if (result.error || result.code !== 0) {
    const detail = result.error ? String(result.error) : result.stderr || result.stdout;
    throw new Error(`${label} failed: ${detail}`);
  }
}

export function materializeConvexFixture(ctx, name, options = {}) {
  const {
    syncContext = true,
    convexSourcePath = 'convex/schema.ts',
    schemaText = CONVEX_SCHEMA,
    rootPackageJson = {
      name,
      private: true,
      version: '0.0.0',
    },
    packageJsonPath = 'package.json',
    packageJson = null,
    sourceFiles = null,
    extraFiles = [],
  } = options;
  const testDir = createTestDir(ctx, name);
  const rootDir = path.join(testDir, 'fixture');
  fs.mkdirSync(rootDir, { recursive: true });
  ensureAiSymlink(rootDir, ctx.repoRoot);

  const scripts = scriptPaths(ctx.repoRoot);
  const schemaRelPath = String(convexSourcePath || 'convex/schema.ts').trim() || 'convex/schema.ts';
  const convexDirRelPath = path.posix.dirname(schemaRelPath);
  const generatedDirRelPath = path.posix.join(convexDirRelPath, '_generated');
  const normalizedSourceFiles = Array.isArray(sourceFiles) && sourceFiles.length > 0
    ? sourceFiles
    : [{ path: path.posix.join(convexDirRelPath, 'messages.ts'), text: CONVEX_MESSAGES }];

  writeJson(path.join(rootDir, 'package.json'), rootPackageJson);
  if (packageJsonPath !== 'package.json') {
    writeJson(resolveRepoRelativePath(rootDir, packageJsonPath), packageJson || {
      name: `${name}-app`,
      private: true,
      version: '0.0.0',
    });
  }

  const initContext = runNodeScript({
    script: scripts.contextCtl,
    args: ['init', '--repo-root', rootDir],
    cwd: rootDir,
    evidenceDir: testDir,
    label: `${name}.context-init`,
  });
  expectOk(initContext, `${name} context init`);

  writeJson(path.join(rootDir, 'docs', 'project', 'db-ssot.json'), buildDbSsotConfig(schemaRelPath));

  const initConvex = runNodeScript({
    script: scripts.convexCtl,
    args: ['init', '--repo-root', rootDir],
    cwd: rootDir,
    evidenceDir: testDir,
    label: `${name}.convex-init`,
  });
  expectOk(initConvex, `${name} convex init`);

  writeText(resolveRepoRelativePath(rootDir, schemaRelPath), schemaText);
  for (const file of normalizedSourceFiles) {
    writeText(resolveRepoRelativePath(rootDir, file.path), file.text);
  }
  for (const file of extraFiles) {
    writeText(resolveRepoRelativePath(rootDir, file.path), file.text);
  }
  writeText(resolveRepoRelativePath(rootDir, path.posix.join(generatedDirRelPath, 'server.d.ts')), '// test placeholder\n');

  if (syncContext) {
    const sync = runNodeScript({
      script: scripts.dbSsotCtl,
      args: ['sync-to-context', '--repo-root', rootDir],
      cwd: rootDir,
      evidenceDir: testDir,
      label: `${name}.sync-to-context`,
    });
    expectOk(sync, `${name} sync-to-context`);
  }

  return {
    name,
    testDir,
    rootDir,
    scripts,
    paths: {
      schema: resolveRepoRelativePath(rootDir, schemaRelPath),
      messages: resolveRepoRelativePath(rootDir, normalizedSourceFiles[0].path),
      convexDir: resolveRepoRelativePath(rootDir, convexDirRelPath),
      generatedDir: resolveRepoRelativePath(rootDir, generatedDirRelPath),
      dbContract: path.join(rootDir, 'docs', 'context', 'db', 'schema.json'),
      functionsContract: path.join(rootDir, 'docs', 'context', 'convex', 'functions.json'),
      dbSsotConfig: path.join(rootDir, 'docs', 'project', 'db-ssot.json'),
      packageJson: resolveRepoRelativePath(rootDir, packageJsonPath),
      registry: path.join(rootDir, 'docs', 'context', 'registry.json'),
    },
  };
}
