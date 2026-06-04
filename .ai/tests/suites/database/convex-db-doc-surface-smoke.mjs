/**
 * convex-db-doc-surface-smoke.mjs
 * Exercise read-only Convex function search and surface rendering.
 */
import fs from 'fs';
import path from 'path';

import { assertIncludes } from '../../lib/text.mjs';
import {
  expectOk,
  materializeConvexFixture,
  runNodeScript,
} from './convex-fixture.mjs';

export const name = 'database-convex-db-doc-surface-smoke';

function readGeneratedDoc(rootDir, relPath) {
  const trimmed = String(relPath || '').trim();
  if (!trimmed) {
    throw new Error('Expected db-human-interface command to print an output path');
  }
  const absPath = path.join(rootDir, trimmed);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Expected generated doc at ${trimmed}`);
  }
  return { relPath: trimmed, content: fs.readFileSync(absPath, 'utf8') };
}

export function run(ctx) {
  const fixture = materializeConvexFixture(ctx, name);

  const status = runNodeScript({
    script: fixture.scripts.dbDocCtl,
    args: ['status', '--repo-root', fixture.rootDir],
    cwd: fixture.rootDir,
    evidenceDir: fixture.testDir,
    label: `${name}.status`,
  });
  expectOk(status, `${name} status`);
  const statusJson = JSON.parse(status.stdout);
  if (statusJson.ssot.mode !== 'convex') {
    return { name, status: 'FAIL', error: `Expected db-doc status to report convex mode, got ${statusJson.ssot.mode}` };
  }
  if (!statusJson.convexFunctions?.available || statusJson.convexFunctions.functions < 2) {
    return { name, status: 'FAIL', error: 'Expected db-doc status to report available Convex functions' };
  }

  const searchExact = runNodeScript({
    script: fixture.scripts.dbDocCtl,
    args: ['search', 'messages:list', '--repo-root', fixture.rootDir],
    cwd: fixture.rootDir,
    evidenceDir: fixture.testDir,
    label: `${name}.search-exact`,
  });
  expectOk(searchExact, `${name} search exact`);
  assertIncludes(searchExact.stdout, 'function', 'Expected function match kind in search output');
  assertIncludes(searchExact.stdout, 'messages:list', 'Expected exact function id in search output');

  const searchTerm = runNodeScript({
    script: fixture.scripts.dbDocCtl,
    args: ['search', 'messages', '--repo-root', fixture.rootDir],
    cwd: fixture.rootDir,
    evidenceDir: fixture.testDir,
    label: `${name}.search-term`,
  });
  expectOk(searchTerm, `${name} search term`);
  assertIncludes(searchTerm.stdout, 'messages:list', 'Expected list function in fuzzy function search results');
  assertIncludes(searchTerm.stdout, 'messages:create', 'Expected create function in fuzzy function search results');

  const querySurface = runNodeScript({
    script: fixture.scripts.dbDocCtl,
    args: ['query', 'messages:list', '--view', 'surface', '--repo-root', fixture.rootDir],
    cwd: fixture.rootDir,
    evidenceDir: fixture.testDir,
    label: `${name}.query-surface`,
  });
  expectOk(querySurface, `${name} query surface`);
  const surfaceDoc = readGeneratedDoc(fixture.rootDir, querySurface.stdout);
  assertIncludes(surfaceDoc.relPath, '__surface.md', 'Expected surface doc filename suffix');
  assertIncludes(surfaceDoc.content, '# Convex function surface: messages:list', 'Expected surface doc title');
  assertIncludes(surfaceDoc.content, '- Reads: `messages`', 'Expected surface doc read table summary');

  const queryFunctions = runNodeScript({
    script: fixture.scripts.dbDocCtl,
    args: ['query', 'messages', '--view', 'functions', '--repo-root', fixture.rootDir],
    cwd: fixture.rootDir,
    evidenceDir: fixture.testDir,
    label: `${name}.query-functions`,
  });
  expectOk(queryFunctions, `${name} query functions`);
  const functionsDoc = readGeneratedDoc(fixture.rootDir, queryFunctions.stdout);
  assertIncludes(functionsDoc.relPath, '__functions.md', 'Expected functions doc filename suffix');
  assertIncludes(functionsDoc.content, '# Convex functions: messages', 'Expected function list doc title');
  assertIncludes(functionsDoc.content, 'messages:list', 'Expected list function in function list doc');

  const queryAuto = runNodeScript({
    script: fixture.scripts.dbDocCtl,
    args: ['query', 'messages:list', '--repo-root', fixture.rootDir],
    cwd: fixture.rootDir,
    evidenceDir: fixture.testDir,
    label: `${name}.query-auto`,
  });
  expectOk(queryAuto, `${name} query auto`);
  const autoDoc = readGeneratedDoc(fixture.rootDir, queryAuto.stdout);
  assertIncludes(autoDoc.content, '# Convex function surface: messages:list', 'Expected auto query to prefer function surface in Convex mode');

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}
