# Reference: initialize-project-from-requirements

This reference contains detailed specifications that supplement `SKILL.md`.

---

## Stage A must-ask checklist keys

Use with `mark-must-ask` to keep the status board accurate:

| Key | Description |
|-----|-------------|
| `terminologyAlignment` | Terminology alignment decision (skip or sync) |
| `onePurpose` | One-line purpose |
| `userRoles` | Primary user roles |
| `mustRequirements` | In-scope MUST requirements |
| `outOfScope` | Explicit out-of-scope items |
| `userJourneys` | Top user journeys |
| `constraints` | Hard constraints |
| `successMetrics` | Success metrics |

Command example:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to init/_work/stage-a-docs/requirements.md
```

---

## update-root-docs: detailed rules

The `update-root-docs` command updates `README.md` and `AGENTS.md` from the blueprint.

### What it does

| Target | Action |
|--------|--------|
| **README.md intro** | Replace template intro with `project.name - project.description` |
| **README.md Tech Stack** | Add/update table with `repo.language`, `repo.packageManager`, `repo.layout` |
| **AGENTS.md intro** | Replace template intro with project summary |
| **AGENTS.md Key Directories** | Add project code paths (e.g., `src/`, `apps/`), keep `.ai/` and `dev-docs/` rows |

### What it preserves

- Routing table structure
- Global Rules section
- Database SSOT section (if present)
- Any custom sections added after the standard structure

### Usage

```bash
# Preview diff
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs update-root-docs --repo-root .

# Apply after explicit approval
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs update-root-docs --repo-root . --apply
```

### When to run

At Stage C completion checkpoint, after skill retention is confirmed. Explicitly ask:

> "Do you want to update the root README.md and AGENTS.md? This will replace the template description with your project-specific information."

---

## check-docs: validation behavior

The `check-docs` command validates Stage A documents:

- Required files exist under `init/_work/stage-a-docs/`
- Required headings exist in each file
- Template placeholders (e.g., `TBD`, `<fill>`) are flagged

Use `--strict` to treat warnings as errors.
