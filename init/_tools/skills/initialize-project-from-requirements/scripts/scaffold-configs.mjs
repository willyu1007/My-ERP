#!/usr/bin/env node
/**
 * scaffold-configs.mjs
 * 
 * Generates base configuration files from blueprint.
 * This is an optional enhancement to the main init-pipeline.mjs scaffold command.
 * 
 * Usage:
 *   node scaffold-configs.mjs --blueprint <path> --repo-root <path> [--apply]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_DIR = __dirname;
const TEMPLATES_DIR = path.join(SCRIPT_DIR, '..', 'templates', 'scaffold-configs');

function usage() {
  console.log(`
Usage:
  node scaffold-configs.mjs --blueprint <path> --repo-root <path> [--apply]

Options:
  --blueprint <path>   Path to project-blueprint.json (required)
  --repo-root <path>   Repository root (default: cwd)
  --apply              Actually write files (default: dry-run)
  --force              Overwrite existing files (default: skip existing)
`.trim());
  process.exit(0);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { apply: false, force: false };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') usage();
    if (arg === '--blueprint') { opts.blueprint = args[++i]; continue; }
    if (arg === '--repo-root') { opts.repoRoot = args[++i]; continue; }
    if (arg === '--apply') { opts.apply = true; continue; }
    if (arg === '--force') { opts.force = true; continue; }
  }
  
  opts.repoRoot = opts.repoRoot || process.cwd();
  return opts;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`[error] Failed to read JSON: ${filePath}`);
    process.exit(1);
  }
}

function getTemplateDir(language, packageManager) {
  // Map language + packageManager to template directory
  const mappings = {
    'typescript-pnpm': 'typescript-pnpm',
    'typescript-npm': 'typescript-pnpm',  // fallback
    'typescript-yarn': 'typescript-pnpm', // fallback
    'javascript-pnpm': 'typescript-pnpm', // fallback
    'javascript-npm': 'typescript-pnpm',  // fallback
    'go-go': 'go',
    'go': 'go',
    'cpp-xmake': 'cpp-xmake',
    'c-xmake': 'cpp-xmake',
    'cpp': 'cpp-xmake',
    'c': 'cpp-xmake',
    'react-native': 'react-native-typescript'
  };

  const key = `${language}-${packageManager}`.toLowerCase();
  let templateName = mappings[key] || mappings[language.toLowerCase()] || null;

  if (!templateName) return null;

  const dir = path.join(TEMPLATES_DIR, templateName);
  return fs.existsSync(dir) ? dir : null;
}

function getConfigHints(language, packageManager) {
  const hints = {
    python: [
      'pyproject.toml - project configuration (pytest, ruff, mypy)',
      'requirements.txt or Pipfile - dependencies',
      'src/<project_name>/__init__.py - package init',
      'tests/__init__.py - test package init'
    ],
    java: packageManager === 'maven' ? [
      'pom.xml - Maven project configuration',
      'src/main/java/<package>/Application.java',
      'src/test/java/<package>/ - test sources'
    ] : [
      'build.gradle.kts - Gradle build script',
      'settings.gradle.kts - Gradle settings',
      'src/main/java/<package>/Application.java',
      'src/test/java/<package>/ - test sources'
    ],
    kotlin: [
      'build.gradle.kts - Gradle build script (with Kotlin plugin)',
      'settings.gradle.kts - Gradle settings',
      'src/main/kotlin/<package>/Application.kt',
      'src/test/kotlin/<package>/ - test sources'
    ],
    dotnet: [
      '<project>.csproj - project file',
      'global.json - SDK version',
      'Program.cs - entry point',
      'appsettings.json - configuration'
    ],
    rust: [
      'Cargo.toml - package manifest',
      'src/main.rs or src/lib.rs - entry point',
      'tests/ - integration tests (optional)'
    ],
    ruby: [
      'Gemfile - dependencies',
      'Rakefile - tasks',
      '.ruby-version - Ruby version'
    ],
    php: [
      'composer.json - dependencies and autoload',
      'phpunit.xml - test configuration',
      'src/ - source files'
    ]
  };
  
  return hints[language.toLowerCase()] || [
    'Project configuration file (language-specific)',
    'Dependencies file',
    'Source directory structure',
    '.gitignore rules for this language'
  ];
}

function renderTemplate(content, variables) {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key.replace('.', '\\.')}\\}\\}`, 'g');
    result = result.replace(pattern, value || '');
  }
  return result;
}

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

export function generateConfigs(blueprint, repoRoot, apply, force) {
  const results = [];
  const repo = blueprint.repo || {};
  const language = repo.language || 'typescript';
  const packageManager = repo.packageManager || 'pnpm';
  const layout = repo.layout || 'single';
  
  const templateDir = getTemplateDir(language, packageManager);
  if (!templateDir) {
    // No built-in template - provide guidance for LLM to generate configs
    console.log(`[info] No built-in template for ${language}-${packageManager}`);
    console.log(`[info] LLM should generate config files based on the blueprint.`);
    console.log(`[info] See: templates/llm-init-guide.md (Phase 5: Config Generation)`);
    console.log('');
    console.log(`[hint] For ${language} projects, typical config files include:`);
    
    const configHints = getConfigHints(language, packageManager);
    for (const hint of configHints) {
      console.log(`  - ${hint}`);
    }
    
    results.push({ 
      file: 'N/A', 
      action: 'llm-generate-required', 
      reason: `no template for ${language}-${packageManager}`,
      language: language,
      packageManager: packageManager,
      guidance: 'See templates/llm-init-guide.md section "Phase 5"'
    });
    return results;
  }
  
  // Flatten blueprint for template variables
  const variables = flattenObject(blueprint);
  
  // Read template files
  const templateFiles = fs.readdirSync(templateDir).filter(f => f.endsWith('.template'));
  
  for (const templateFile of templateFiles) {
    const targetName = templateFile.replace('.template', '');
    const templatePath = path.join(templateDir, templateFile);
    const targetPath = path.join(repoRoot, targetName);
    
    // Skip workspace file for single layout
    if (targetName === 'pnpm-workspace.yaml' && layout !== 'monorepo') {
      results.push({ file: targetName, action: 'skip', reason: 'not monorepo' });
      continue;
    }
    
    // Check if file exists
    if (fs.existsSync(targetPath) && !force) {
      results.push({ file: targetName, action: 'skip', reason: 'exists' });
      continue;
    }
    
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const rendered = renderTemplate(templateContent, variables);
    
    if (apply) {
      fs.writeFileSync(targetPath, rendered, 'utf8');
      results.push({ file: targetName, action: 'write', mode: 'applied' });
    } else {
      results.push({ file: targetName, action: 'write', mode: 'dry-run' });
    }
  }
  
  return results;
}

// Export for init-pipeline.mjs (single source of truth)
export function generateConfigFiles(repoRoot, blueprint, apply, force = false) {
  return generateConfigs(blueprint, repoRoot, apply, force);
}

function main() {
  const opts = parseArgs(process.argv);
  
  if (!opts.blueprint) {
    console.error('[error] --blueprint is required');
    process.exit(1);
  }
  
  const blueprintPath = path.isAbsolute(opts.blueprint) 
    ? opts.blueprint 
    : path.resolve(opts.repoRoot, opts.blueprint);
  
  const blueprint = readJson(blueprintPath);
  const results = generateConfigs(blueprint, opts.repoRoot, opts.apply, opts.force);
  
  console.log(opts.apply ? '[ok] Config files generated:' : '[plan] Config files (dry-run):');
  for (const r of results) {
    const mode = r.mode ? ` (${r.mode})` : '';
    const reason = r.reason ? ` [${r.reason}]` : '';
    console.log(`  - ${r.action}: ${r.file}${mode}${reason}`);
  }
}

// ESM entry point check
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('scaffold-configs.mjs');
if (isMainModule) {
  main();
}
