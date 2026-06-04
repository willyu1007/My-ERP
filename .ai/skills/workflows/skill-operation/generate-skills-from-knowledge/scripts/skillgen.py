#!/usr/bin/env python3

"""
skillgen.py

A small, provider-agnostic helper for converting knowledge documents into a
filesystem-based Agent Skills bundle.

Design goals:
- Standard library only (portable).
- Safe-by-default (no overwrites unless explicit).
- Reviewable plan -> apply -> lint -> package workflow.

This script does NOT call an LLM. It scaffolds and validates.
An agent/LLM should produce or refine the conversion plan JSON.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as _dt
import json
import os
import re
import shutil
import sys
import textwrap
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional


_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def _now_stamp() -> str:
    return _dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")


def _kebab_case(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "skill"


def _safe_rel_name(name: str) -> str:
    # Prevent path traversal in example/template filenames.
    if name.startswith(("/", "\\")):
        raise ValueError(f"Unsafe filename (absolute path not allowed): {name}")
    if ".." in Path(name).parts:
        raise ValueError(f"Unsafe filename (path traversal not allowed): {name}")
    return name


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"Plan not found: {path}")
    except json.JSONDecodeError as e:
        raise SystemExit(f"Invalid JSON in {path}: {e}")


def _write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _validate_plan(plan: Any) -> Tuple[Dict[str, Any], List[str]]:
    """
    Minimal validation (not full JSON Schema validation).
    Returns (normalized_plan, warnings).
    """
    warnings: List[str] = []
    if not isinstance(plan, dict):
        raise SystemExit("Plan must be a JSON object.")

    required_root = ["version", "skills_root", "skills"]
    for k in required_root:
        if k not in plan:
            raise SystemExit(f"Plan missing required field: {k}")

    version = plan["version"]
    if not isinstance(version, str) or not version.strip():
        raise SystemExit("Plan field 'version' must be a non-empty string.")

    skills_root = plan["skills_root"]
    if not isinstance(skills_root, str) or not skills_root.strip():
        raise SystemExit("Plan field 'skills_root' must be a non-empty string.")

    layout = plan.get("layout", "categorized")
    if layout not in ("flat", "categorized"):
        raise SystemExit("Plan field 'layout' must be one of: flat, categorized.")

    default_tax = plan.get("default_taxonomy") or {}
    if default_tax and not isinstance(default_tax, dict):
        raise SystemExit("Plan field 'default_taxonomy' must be an object when provided.")

    skills = plan["skills"]
    if not isinstance(skills, list) or not skills:
        raise SystemExit("Plan field 'skills' must be a non-empty array.")

    seen_names: set[str] = set()
    for i, sk in enumerate(skills):
        if not isinstance(sk, dict):
            raise SystemExit(f"skills[{i}] must be an object.")
        for k in ("name", "title", "description", "sources"):
            if k not in sk:
                raise SystemExit(f"skills[{i}] missing required field: {k}")

        name = sk["name"]
        if not isinstance(name, str) or not _NAME_RE.match(name):
            raise SystemExit(
                f"skills[{i}].name must be kebab-case (pattern: {_NAME_RE.pattern}). Got: {name!r}"
            )
        if name in seen_names:
            raise SystemExit(f"Duplicate skill name in plan: {name}")
        seen_names.add(name)

        title = sk["title"]
        if not isinstance(title, str) or not title.strip():
            raise SystemExit(f"skills[{i}].title must be a non-empty string.")

        desc = sk["description"]
        if not isinstance(desc, str) or not desc.strip():
            raise SystemExit(f"skills[{i}].description must be a non-empty string.")

        sources = sk["sources"]
        if not isinstance(sources, list) or not sources:
            raise SystemExit(f"skills[{i}].sources must be a non-empty array.")
        for j, src in enumerate(sources):
            if not isinstance(src, dict):
                raise SystemExit(f"skills[{i}].sources[{j}] must be an object.")
            if "path" not in src or not isinstance(src["path"], str) or not src["path"].strip():
                raise SystemExit(f"skills[{i}].sources[{j}].path must be a non-empty string.")

        # Taxonomy defaults
        tier1 = sk.get("tier1") or default_tax.get("tier1")
        tier2 = sk.get("tier2") or default_tax.get("tier2")

        if layout == "categorized":
            if not tier1 or not tier2:
                raise SystemExit(
                    f"skills[{i}] requires tier1/tier2 when layout=categorized "
                    f"(either per-skill or default_taxonomy)."
                )
            if not isinstance(tier1, str) or not _NAME_RE.match(tier1):
                raise SystemExit(f"skills[{i}].tier1 must be kebab-case. Got: {tier1!r}")
            if not isinstance(tier2, str) or not _NAME_RE.match(tier2):
                raise SystemExit(f"skills[{i}].tier2 must be kebab-case. Got: {tier2!r}")
            sk["tier1"] = tier1
            sk["tier2"] = tier2

        create = sk.get("create") or {}
        if create and not isinstance(create, dict):
            raise SystemExit(f"skills[{i}].create must be an object when provided.")
        examples = create.get("examples") or []
        templates = create.get("templates") or []
        if examples and not isinstance(examples, list):
            raise SystemExit(f"skills[{i}].create.examples must be an array when provided.")
        if templates and not isinstance(templates, list):
            raise SystemExit(f"skills[{i}].create.templates must be an array when provided.")

        # Safety check filenames
        for n in examples:
            if not isinstance(n, str) or not n.strip():
                raise SystemExit(f"skills[{i}].create.examples contains an invalid filename: {n!r}")
            _safe_rel_name(n)
        for n in templates:
            if not isinstance(n, str) or not n.strip():
                raise SystemExit(f"skills[{i}].create.templates contains an invalid filename: {n!r}")
            _safe_rel_name(n)

        # A gentle warning if description is too long (discovery)
        if len(desc) > 140:
            warnings.append(f"skills[{i}] description is long (>140 chars). Consider shortening for discovery.")

    return plan, warnings


def _skill_dir(skills_root: Path, layout: str, sk: Dict[str, Any]) -> Path:
    if layout == "flat":
        return skills_root / sk["name"]
    return skills_root / sk["tier1"] / sk["tier2"] / sk["name"]


def _frontmatter(name: str, description: str) -> str:
    # Keep YAML simple for portability.
    description = description.replace("\n", " ").strip()
    return f"---\nname: {name}\ndescription: {description}\n---\n"


def _default_skill_md(name: str, title: str, description: str) -> str:
    fm = _frontmatter(name, description)
    body = f"""\
# {title}

## Purpose
(1–2 sentences) What capability this skill provides.

## When to use
- Trigger 1:
- Trigger 2:

## Inputs
You MUST provide:
- ...

You SHOULD provide:
- ...

## Outputs
- ...

## Steps
1. ...
2. ...
3. ...

## Boundaries
- MUST NOT ...
- SHOULD NOT ...

## Verification
- How to verify success (commands, checks, or expected artifacts).
"""
    return fm + body


def _default_reference_md(sk: Dict[str, Any]) -> str:
    sources = "\n".join([f"- `{s['path']}`" + (f" — {s.get('why','').strip()}" if s.get("why") else "") for s in sk["sources"]])
    return f"""\
# Reference: Source material and conversion notes

## Source documents
{sources}

## Notes
- Replace repo- or provider-specific details with portable placeholders where appropriate.
- Move large examples to `examples/` and reusable snippets to `templates/`.
"""


def _default_example_md(example_name: str) -> str:
    return f"""\
# Example: {example_name}

## Scenario
(Describe the scenario and the user goal.)

## Inputs
- ...

## Expected output
- ...

## Notes
- Keep examples minimal and copy/pasteable.
"""


def _default_template_md(template_name: str) -> str:
    return f"""\
# Template: {template_name}

(Provide a reusable skeleton or snippet.)

"""


def cmd_init_plan(args: argparse.Namespace) -> int:
    inputs: List[str] = []
    for p in args.inputs:
        # Expand globs
        expanded = [str(pp) for pp in Path().glob(p)] if any(ch in p for ch in "*?[]") else [p]
        inputs.extend(expanded)

    # De-dup preserving order
    seen: set[str] = set()
    unique_inputs: List[str] = []
    for p in inputs:
        if p not in seen:
            seen.add(p)
            unique_inputs.append(p)

    if not unique_inputs:
        raise SystemExit("No input files found. Provide paths or glob patterns.")

    skills: List[Dict[str, Any]] = []
    used_names: set[str] = set()
    for p in unique_inputs:
        stem = Path(p).stem
        name = _kebab_case(stem)
        base = name
        n = 2
        while name in used_names:
            name = f"{base}-{n}"
            n += 1
        used_names.add(name)

        title = " ".join([w.capitalize() for w in name.split("-")])
        skills.append({
            "name": name,
            "title": title,
            "description": "DRAFT: Replace with a high-signal discovery sentence (when to use this skill).",
            "sources": [{"path": p, "why": "Source document"}],
            "create": {"reference": True, "examples": [], "templates": []},
        })

    plan: Dict[str, Any] = {
        "version": "1.0",
        "skills_root": args.skills_root,
        "layout": args.layout,
        "default_taxonomy": {"tier1": args.tier1, "tier2": args.tier2} if args.layout == "categorized" else None,
        "operations": [],
        "skills": skills,
    }

    # Remove null default_taxonomy for flat layout to keep the file clean.
    if plan["default_taxonomy"] is None:
        del plan["default_taxonomy"]

    _write_json(Path(args.out), plan)
    print(f"Wrote plan: {args.out}")
    print(f"Skills in plan: {len(skills)}")
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    plan_path = Path(args.plan)
    plan_raw = _read_json(plan_path)
    plan, warnings = _validate_plan(plan_raw)
    for w in warnings:
        _eprint(f"WARNING: {w}")

    skills_root = Path(plan["skills_root"]).expanduser()
    if args.cwd:
        skills_root = (Path(args.cwd) / skills_root).resolve()

    layout = plan.get("layout", "categorized")

    if skills_root.exists() and args.backup:
        backup_dir = skills_root.parent / f"{skills_root.name}.bak.{_now_stamp()}"
        shutil.copytree(skills_root, backup_dir)
        print(f"Backup created: {backup_dir}")

    skills_created = 0
    for sk in plan["skills"]:
        out_dir = _skill_dir(skills_root, layout, sk)

        if out_dir.exists():
            if not args.overwrite:
                raise SystemExit(f"Refusing to overwrite existing skill dir: {out_dir} (use --overwrite)")
            shutil.rmtree(out_dir)

        out_dir.mkdir(parents=True, exist_ok=True)

        # Required SKILL.md
        skill_md_path = out_dir / "SKILL.md"
        skill_md_path.write_text(
            _default_skill_md(sk["name"], sk["title"], sk["description"]),
            encoding="utf-8"
        )

        # Optional reference.md
        create = sk.get("create") or {}
        if create.get("reference", True):
            (out_dir / "reference.md").write_text(_default_reference_md(sk), encoding="utf-8")

        # Optional examples/templates
        examples = create.get("examples") or []
        templates = create.get("templates") or []

        if examples:
            ex_dir = out_dir / "examples"
            ex_dir.mkdir(parents=True, exist_ok=True)
            for ex in examples:
                ex_path = ex_dir / _safe_rel_name(ex)
                ex_path.write_text(_default_example_md(ex), encoding="utf-8")

        if templates:
            tpl_dir = out_dir / "templates"
            tpl_dir.mkdir(parents=True, exist_ok=True)
            for tpl in templates:
                tpl_path = tpl_dir / _safe_rel_name(tpl)
                tpl_path.write_text(_default_template_md(tpl), encoding="utf-8")

        skills_created += 1

    # Conversion report stub
    report_path = skills_root / "CONVERSION_REPORT.md"
    if not report_path.exists() or args.overwrite_report:
        report = _render_report(plan, skills_root)
        report_path.write_text(report, encoding="utf-8")
        print(f"Wrote report: {report_path}")

    print(f"Scaffolded skills: {skills_created}")
    print(f"Output root: {skills_root}")
    return 0


def _render_report(plan: Dict[str, Any], skills_root: Path) -> str:
    lines: List[str] = []
    lines.append("# Conversion Report")
    lines.append("")
    lines.append(f"- Generated at: {_dt.datetime.utcnow().isoformat()}Z")
    lines.append(f"- Plan version: {plan.get('version','')}")
    lines.append(f"- Output root: `{skills_root}`")
    lines.append("")
    lines.append("## Source documents (as declared in plan)")
    seen: set[str] = set()
    for sk in plan["skills"]:
        for src in sk["sources"]:
            p = src["path"]
            if p not in seen:
                seen.add(p)
                lines.append(f"- `{p}`")
    lines.append("")
    lines.append("## Skills created")
    for sk in plan["skills"]:
        lines.append(f"- `{sk['name']}` — {sk['title']}")
    lines.append("")
    lines.append("## Operations log")
    ops = plan.get("operations") or []
    if ops:
        for op in ops:
            lines.append(f"- **{op.get('type','')}**: {op.get('detail','')}")
    else:
        lines.append("- (none declared)")
    lines.append("")
    lines.append("## Follow-ups")
    lines.append("- Replace DRAFT descriptions with high-signal discovery sentences.")
    lines.append("- Move large examples into `examples/` and reusable snippets into `templates/`.")
    lines.append("- Run lint and fix all errors before landing into an SSOT skills root.")
    lines.append("")
    return "\n".join(lines) + "\n"


def _parse_frontmatter(md_text: str) -> Dict[str, str]:
    """
    Parse a minimal YAML frontmatter block:
    ---
    name: foo
    description: bar
    ---
    """
    lines = md_text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    try:
        end_idx = lines[1:].index("---") + 1
    except ValueError:
        return {}
    fm_lines = lines[1:end_idx]
    out: Dict[str, str] = {}
    for ln in fm_lines:
        if ":" not in ln:
            continue
        k, v = ln.split(":", 1)
        out[k.strip()] = v.strip()
    return out


def _find_skill_dirs(skills_root: Path) -> List[Path]:
    out: List[Path] = []
    for p in skills_root.rglob("SKILL.md"):
        out.append(p.parent)
    return sorted(set(out))


def cmd_lint(args: argparse.Namespace) -> int:
    skills_root = Path(args.skills_root).expanduser()
    if args.cwd:
        skills_root = (Path(args.cwd) / skills_root).resolve()

    if not skills_root.exists():
        raise SystemExit(f"skills_root does not exist: {skills_root}")

    skill_dirs = _find_skill_dirs(skills_root)
    if not skill_dirs:
        raise SystemExit(f"No SKILL.md found under: {skills_root}")

    errors: List[str] = []
    warnings: List[str] = []

    for sd in skill_dirs:
        skill_md = sd / "SKILL.md"
        text = skill_md.read_text(encoding="utf-8")
        fm = _parse_frontmatter(text)
        if not fm:
            errors.append(f"{skill_md}: missing or invalid YAML frontmatter.")
            continue

        name = fm.get("name", "")
        desc = fm.get("description", "")
        if not name or not desc:
            errors.append(f"{skill_md}: frontmatter must include name and description.")
        if name and sd.name != name:
            errors.append(f"{skill_md}: directory name '{sd.name}' must match frontmatter name '{name}'.")

        line_count = len(text.splitlines())
        if line_count > 500:
            errors.append(f"{skill_md}: exceeds 500 lines ({line_count}). Use progressive disclosure.")

        # Forbidden resources/
        if (sd / "resources").exists():
            errors.append(f"{sd}: forbidden directory 'resources/' exists.")

        # Cross-skill link heuristic
        if re.search(r"\]\((\.\./|\.\./\.\.)", text):
            warnings.append(f"{skill_md}: contains relative parent links (../...). Consider removing cross-skill references.")

        # "See also" / "Related docs" headings (heuristic)
        if re.search(r"^##\s+(See also|Related|Related docs)\b", text, flags=re.IGNORECASE | re.MULTILINE):
            warnings.append(f"{skill_md}: contains a 'See also/Related' section. Prefer relying on discovery instead.")

    if warnings and not args.quiet:
        _eprint("WARNINGS:")
        for w in warnings:
            _eprint(f"- {w}")

    if errors:
        _eprint("ERRORS:")
        for e in errors:
            _eprint(f"- {e}")
        return 2

    print(f"Lint OK. Skills found: {len(skill_dirs)}")
    return 0


def cmd_package(args: argparse.Namespace) -> int:
    skills_root = Path(args.skills_root).expanduser()
    if args.cwd:
        skills_root = (Path(args.cwd) / skills_root).resolve()

    if not skills_root.exists():
        raise SystemExit(f"skills_root does not exist: {skills_root}")

    out_zip = Path(args.out).expanduser()
    if out_zip.exists() and not args.overwrite:
        raise SystemExit(f"Refusing to overwrite existing zip: {out_zip} (use --overwrite)")

    out_zip.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in skills_root.rglob("*"):
            if p.is_dir():
                continue
            rel = p.relative_to(skills_root)
            z.write(p, arcname=str(rel))
    print(f"Wrote zip: {out_zip}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="skillgen.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=textwrap.dedent(
            """\
            Convert knowledge documents into an Agent Skills bundle using a safe plan->apply workflow.

            Common flows:
              1) init-plan -> edit plan -> apply -> edit skills -> lint -> package
            """
        ),
    )
    p.add_argument("--cwd", help="Optional working directory to resolve relative paths against.")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("init-plan", help="Create a draft conversion plan from input doc paths.")
    sp.add_argument("--inputs", nargs="+", required=True, help="Input file paths or glob patterns.")
    sp.add_argument("--out", required=True, help="Output plan JSON path.")
    sp.add_argument("--skills-root", default="out/skills", help="Output skills_root to embed in the plan.")
    sp.add_argument("--layout", choices=["flat", "categorized"], default="categorized")
    sp.add_argument("--tier1", default="workflows", help="Default tier1 when layout=categorized.")
    sp.add_argument("--tier2", default="common", help="Default tier2 when layout=categorized.")
    sp.set_defaults(func=cmd_init_plan)

    sp = sub.add_parser("apply", help="Apply a conversion plan to scaffold skill directories.")
    sp.add_argument("--plan", required=True, help="Path to conversion plan JSON.")
    sp.add_argument("--overwrite", action="store_true", help="Overwrite existing generated skill dirs.")
    sp.add_argument("--backup", action="store_true", help="Backup existing skills_root before writing.")
    sp.add_argument("--overwrite-report", action="store_true", help="Overwrite CONVERSION_REPORT.md if it exists.")
    sp.set_defaults(func=cmd_apply)

    sp = sub.add_parser("lint", help="Lint a generated skills_root for common issues.")
    sp.add_argument("--skills-root", required=True, help="Skills root to lint.")
    sp.add_argument("--quiet", action="store_true", help="Suppress warnings.")
    sp.set_defaults(func=cmd_lint)

    sp = sub.add_parser("package", help="Zip a skills_root into a bundle.")
    sp.add_argument("--skills-root", required=True, help="Skills root to zip.")
    sp.add_argument("--out", required=True, help="Output zip path.")
    sp.add_argument("--overwrite", action="store_true", help="Overwrite existing zip.")
    sp.set_defaults(func=cmd_package)

    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
