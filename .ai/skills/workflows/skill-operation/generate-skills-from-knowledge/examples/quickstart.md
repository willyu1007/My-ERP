# Quickstart: Convert Knowledge Docs into Skills

This example shows the safe-by-default workflow:

1) create a draft plan
2) edit the plan (by hand or with an LLM)
3) scaffold the skills bundle
4) edit skill content
5) lint
6) optionally package

## 1) Create a draft plan
From inside the skill directory:

```bash
python3 scripts/skillgen.py init-plan   --inputs "docs/**/*.md"   --out conversion-plan.json   --skills-root out/skills   --layout categorized   --tier1 workflows   --tier2 common
```

Review `conversion-plan.json`. The generated `description` fields are placeholders and MUST be rewritten.

## 2) Apply the plan (scaffold)
```bash
python3 scripts/skillgen.py apply --plan conversion-plan.json
```

This creates `out/skills/.../<skill-name>/SKILL.md` and optional supporting files.

## 3) Edit the skills
Rewrite each `SKILL.md` to be:
- high-signal (agent selection)
- short (progressive disclosure)
- portable (no provider coupling unless required)

Move deep detail to `reference.md`, `examples/`, and `templates/`.

## 4) Lint
```bash
python3 scripts/skillgen.py lint --skills-root out/skills
```

Fix all errors. Treat warnings as “should fix” unless you have a clear reason not to.

## 5) Package (optional)
```bash
python3 scripts/skillgen.py package   --skills-root out/skills   --out skills-bundle.zip   --overwrite
```
