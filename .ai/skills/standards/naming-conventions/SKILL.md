---
name: naming-conventions
description: Apply consistent naming conventions for directories, files, and identifiers - covers kebab-case rules, SSOT layout, skill naming standards, and script-generated file paths (including temporary files under .ai/.tmp/).
---

# Naming Conventions

## Purpose

Define naming conventions for directories, files, and identifiers with these goals:
- **Scriptability**: scripts can locate files reliably with fewer branches
- **Portability**: cross OS/IDE moves should require zero or minimal renaming
- **Readability**: humans and LLMs can infer purpose and scope from names

## When to use

Use the naming-conventions skill when:
- Creating new directories or files
- Naming skills, workflows, or commands
- Reviewing code for naming consistency
- Setting up CI checks for naming standards
- **Scripts generating files** (see Script Integration below)

## Inputs

- The item to name (directory, file, skill, identifier)
- Context (SSOT content, provider stubs, general repo files)

## Outputs

- Correctly named items following conventions
- Validation results for existing names


## Steps
1. Identify what you are naming (file, directory, module, component, hook, API surface, configuration key, or data entity).
2. Choose the most relevant convention section below and follow the MUST rules first.
3. Propose 2–3 candidates and select the one that matches existing local conventions and avoids ambiguous abbreviations.
4. Apply the chosen name consistently across declarations and references (imports, exports, docs, and tests).
5. Verify that the resulting names are searchable, unambiguous, and do not collide with existing names.

## Script Integration (MUST)

Scripts that generate files MUST follow the naming conventions defined in the naming-conventions skill.

**Requirements:**
- Declare a reference to the naming-conventions skill in script header comments
- Generated file/directory names MUST use kebab-case
- Validate output names against convention rules before writing

**Reference comment example:**
```javascript
/**
 * @reference .ai/skills/standards/naming-conventions/SKILL.md
 */
```

**Implementation guidance:**
- Import or read the naming-conventions skill path when generating output paths
- Scripts under `.ai/scripts/` should programmatically validate generated names
- When scaffolding projects, apply kebab-case to all generated directories/files

## Global Rules (MUST)

- Use **kebab-case** (lowercase + hyphens) by default: `skill-name`, `sync-skills`
- Avoid spaces and special characters (except `.`-prefixed directories)
- Recommended charset: `[a-z0-9-._]`
- Directory names express "scope/role"; file names express "type/content"
- Avoid non-maintainable buckets like `misc/` or `temp/`

## Directory Layout (MUST)

### SSOT Root

- SSOT root is fixed: `.ai/`
- SSOT subdirectories:
  - `.ai/skills/` (skills and workflows live here)
  - `.ai/scripts/` (maintenance scripts)
  - `.ai/rules/` (if using rules)

### Skill Entry Stubs

- Entry stub roots are fixed:
  - `.codex/skills/`
  - `.claude/skills/`

Notes:
- Stubs contain only `SKILL.md` pointers back to `.ai/skills/`
- Do not edit stub directories directly; regenerate with `.ai/scripts/sync-skills.mjs`

### Other Top-Level Directories (Recommended)

- `docs/project/`: project-specific documentation (requirements, blueprints)
- `scripts/`: script entrypoints (cross-platform can share the same base name with different suffixes)
- `init/`: bootstrap materials (if present)

### Temporary Directory (MUST)

Use `.ai/.tmp/` for temporary environments, caches, and generated intermediate files.

**Rules:**
- All temporary files MUST be placed under `.ai/.tmp/`
- Do NOT create `temp/`, `tmp/`, `temporary/`, or similar directories elsewhere
- `.ai/.tmp/` SHOULD be added to `.gitignore`
- Script-generated artifacts, build caches, and intermediate outputs go here

**Usage examples:**
- `.ai/.tmp/cache/` - cached data for scripts
- `.ai/.tmp/build/` - intermediate build outputs
- `.ai/.tmp/sandbox/` - temporary test environments

**Cleanup:**
- Scripts are responsible for cleaning up their own temporary files
- Stale files in `.ai/.tmp/` may be deleted without notice

## Skill Naming (MUST)

### Skill Directory

- Path: `.ai/skills/.../<skill-name>/SKILL.md` (taxonomy directories are allowed)
- `<skill-name>`: kebab-case; encode capability/domain/tool
- Avoid ambiguous names

Examples:
- `skill-creator`
- `repo-init`
- `doc-style-guide`

### Skill Name Field

- The `name` in SKILL.md frontmatter MUST match the **leaf** directory name
- Use capability-oriented names (verb + domain/tool)

### Supporting Files

- Use kebab-case or snake_case for filenames
- Allowed: `reference.md`, `examples.md`, `scripts/`, `templates/`
- Forbidden: `resources/` subdirectory

## Workflow Naming

- Workflows are stored as skills
- Name by intent/process: `refactor-planner`, `release-checklist`
- Path: `.ai/skills/.../<workflow-name>/SKILL.md`

## Template Placeholder Conventions (MUST)

Use consistent placeholder formats in template files:

| Format | Usage | Example |
|--------|-------|---------|
| `<placeholder>` | User-editable content (manual fill) | `<Task Title>`, `<One-sentence goal>` |
| `{{variable}}` | Script-replaced variables (auto-generated) | `{{agent_id}}`, `{{timestamp}}` |
| `$ENV_VAR` | Environment variable reference | `$DATABASE_URL`, `$API_KEY` |

**Rules:**
- `<placeholder>`: Angle brackets indicate the user must replace this content manually
- `{{variable}}`: Double curly braces indicate scripts will substitute this value automatically
- Do NOT mix formats in the same context (e.g., don't use `<var>` for script substitution)
- Template files SHOULD include comments explaining which placeholders are user-filled vs auto-replaced

**Examples:**

```markdown
# User-filled template (roadmap.md)
## Goal
- <One-sentence goal statement>

# Script-generated template (verification-report.md)
- Agent ID: {{agent_id}}
- Generated: {{timestamp}}
```

## Versioning and Changes (SHOULD)

- Prefer explicit version fields / change logs for SSOT content
- If the directory structure changes, update all of:
  - Naming conventions documentation
  - Path constants/mappings in `.ai/scripts/`
  - Usage examples in `README.md`

## Verification

Check naming compliance:
- All directories use kebab-case
- No spaces or special characters in names
- Skill `name` field matches directory name
- No `resources/` directories under skills

## Boundaries

- Do NOT use spaces in directory or file names
- Do NOT create `misc/`, `temp/`, or similar catch-all directories
- Do NOT use uppercase in directory names (except for special files like `SKILL.md`, `README.md`)

## Included assets

None.
