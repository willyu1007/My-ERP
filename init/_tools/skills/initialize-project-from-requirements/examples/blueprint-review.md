# Example - Blueprint review checklist

Before applying Stage C, review `init/_work/project-blueprint.json`.

> **Note**: The blueprint is stored in `init/_work/project-blueprint.json` during initialization. Optional: if you plan to remove `init/`, use `cleanup-init --archive` to archive artifacts to `docs/project/overview/`.

---

## Checklist

- `project.name` is stable and does not depend on an implementation detail.
- `repo.layout` matches intended structure (`single` vs `monorepo`).
- `capabilities.*` reflect **decisions**, not aspirations (avoid setting `enabled=true` for "maybe later").
- `skills.packs` includes only what you want enabled now.
- Feature flags are intentional (e.g. `features.contextAwareness`).
- No secrets are present (no tokens, passwords, connection strings).

---

## Validate

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate \
  --repo-root .
```

---

## Reconcile packs (recommended)

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs \
  --repo-root .
```

If you want the pipeline to **safe-add** missing recommended packs into the blueprint (it will not remove anything), run:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs \
  --repo-root . \
  --write
```

---

## Approve Stage B

After reviewing packs, confirm `blueprint.skills.packs`:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .
```

After reviewing, approve Stage B:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```
