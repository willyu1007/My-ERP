#!/usr/bin/env python3
"""
land_skills.py

A stdlib-only installer tool for Agent Skills bundles.

Design goals:
- Safe by default (dry-run unless --apply is provided)
- Auditable (prints a deterministic plan; optional JSON report)
- Provider-agnostic (SSOT is configurable)
- Portable (no third-party dependencies)

This script intentionally avoids non-stdlib Python packages.

Note: Provider stubs (for .codex/skills, .claude/skills, etc.) should be
generated using `node .ai/scripts/sync-skills.mjs`, not this script.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as _dt
import fnmatch
import hashlib
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


SKILL_MD = "SKILL.md"

DEFAULT_IGNORE = [
    "**/.DS_Store",
    "**/__pycache__/**",
    "**/*.pyc",
]

EXIT_CONFLICT = 2
EXIT_INVALID = 3


@dataclasses.dataclass
class SkillInfo:
    skill_dir: Path
    name: str
    description: str


@dataclasses.dataclass
class Action:
    kind: str  # mkdir|copy|skip|conflict|delete|note
    src: Optional[str] = None
    dst: Optional[str] = None
    reason: Optional[str] = None


def _posix_relpath(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _match_any(patterns: List[str], rel_posix: str) -> bool:
    # Best-effort glob matching against POSIX-style relative paths.
    for pat in patterns:
        p = pat[2:] if pat.startswith("./") else pat
        if fnmatch.fnmatch(rel_posix, p):
            return True
        if p.startswith("**/") and fnmatch.fnmatch(rel_posix, p[3:]):
            return True
    return False


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_frontmatter(skill_md_path: Path) -> Tuple[Optional[str], Optional[str], List[str]]:
    """
    Minimal YAML frontmatter parser (stdlib-only).

    Returns: (name, description, errors)
    """
    errors: List[str] = []
    try:
        text = _read_text(skill_md_path)
    except Exception as e:
        return None, None, [f"Cannot read {skill_md_path}: {e}"]

    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, None, ["Missing YAML frontmatter start '---'"]

    end_idx = None
    for i in range(1, min(len(lines), 400)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return None, None, ["Missing YAML frontmatter end '---'"]

    fm_lines = lines[1:end_idx]
    name = None
    desc = None
    for raw in fm_lines:
        if ":" not in raw:
            continue
        key, value = raw.split(":", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key == "name" and value:
            name = value
        if key == "description" and value:
            desc = value

    if not name:
        errors.append("Frontmatter missing required 'name'")
    if not desc:
        errors.append("Frontmatter missing required 'description'")
    return name, desc, errors


def find_skill_dirs(root: Path, ignore_patterns: List[str]) -> List[Path]:
    """
    Recursively find skill directories (directories containing SKILL.md).
    """
    if not root.exists():
        return []
    skill_dirs: List[Path] = []
    for skill_md in root.rglob(SKILL_MD):
        rel = _posix_relpath(skill_md, root)
        if _match_any(ignore_patterns, rel):
            continue
        skill_dirs.append(skill_md.parent)
    return sorted(set(skill_dirs))


def top_level_skill_dirs(skill_dirs: List[Path]) -> List[Path]:
    """
    If a directory contains SKILL.md and also contains nested directories with SKILL.md,
    treat only the outermost directories as skills to avoid double-copying.
    """
    s = set(skill_dirs)
    tops: List[Path] = []
    for d in skill_dirs:
        if any(parent in s for parent in d.parents):
            continue
        tops.append(d)
    return sorted(tops)


def _unwrap_single_top_dir(root: Path) -> Path:
    """
    Many .zip bundles are wrapped in a single top-level folder.
    Unwrap up to 3 times if the directory contains exactly one visible subdirectory.
    """
    cur = root
    for _ in range(3):
        if not cur.exists() or not cur.is_dir():
            return cur
        entries = []
        for e in cur.iterdir():
            if e.name in ("__MACOSX",):
                continue
            if e.name.startswith("."):
                continue
            entries.append(e)
        if len(entries) == 1 and entries[0].is_dir():
            cur = entries[0]
            continue
        break
    return cur


def detect_source_root(source_path: Path) -> Path:
    """
    Detect the most likely "skills root" inside a bundle.

    Preference order:
    1) <root>/.ai/skills
    2) <root>/.codex/skills
    3) <root>/.claude/skills
    4) <root>

    Also unwrap a common single-directory zip wrapper.
    """
    root = _unwrap_single_top_dir(source_path)

    candidates = [
        root / ".ai" / "skills",
        root / ".codex" / "skills",
        root / ".claude" / "skills",
        root,
    ]
    for c in candidates:
        if c.exists() and c.is_dir():
            return c
    return root


def ensure_dir(path: Path, actions: List[Action], apply: bool) -> None:
    if path.exists():
        return
    actions.append(Action(kind="mkdir", dst=str(path)))
    if apply:
        path.mkdir(parents=True, exist_ok=True)


def copy_file(
    repo_root: Path,
    src: Path,
    dst: Path,
    actions: List[Action],
    apply: bool,
    overwrite: str,
    backup: bool,
    backup_root: Optional[Path],
) -> None:
    """
    overwrite: never|changed|always
    """
    if dst.exists():
        if dst.is_dir():
            actions.append(Action(kind="conflict", src=str(src), dst=str(dst), reason="Destination is a directory"))
            return

        try:
            same = _sha256(src) == _sha256(dst)
        except Exception:
            same = False

        if same:
            actions.append(Action(kind="skip", src=str(src), dst=str(dst), reason="Same content"))
            return

        if overwrite == "never":
            actions.append(Action(kind="conflict", src=str(src), dst=str(dst), reason="Different content; overwrite=never"))
            return

        if backup and backup_root is not None:
            try:
                rel = dst.relative_to(repo_root)
                backup_path = backup_root / rel
            except Exception:
                backup_path = backup_root / dst.name

            actions.append(Action(kind="note", dst=str(backup_path), reason="Backup existing file"))
            if apply:
                backup_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(dst, backup_path)

        actions.append(Action(kind="copy", src=str(src), dst=str(dst), reason=f"Overwrite ({overwrite})"))
        if apply:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
        return

    actions.append(Action(kind="copy", src=str(src), dst=str(dst), reason="New file"))
    if apply:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def iter_files(root: Path, ignore_patterns: List[str]) -> Iterable[Path]:
    for p in root.rglob("*"):
        rel = _posix_relpath(p, root)
        if _match_any(ignore_patterns, rel):
            continue
        if p.is_file():
            yield p


def plan_tree_copy(
    repo_root: Path,
    src_root: Path,
    dst_root: Path,
    ignore_patterns: List[str],
    apply: bool,
    overwrite: str,
    backup: bool,
    backup_root: Optional[Path],
    prune: bool,
) -> List[Action]:
    actions: List[Action] = []
    ensure_dir(dst_root, actions, apply)

    src_files = list(iter_files(src_root, ignore_patterns))
    src_rel_set = set()

    for src_file in src_files:
        rel = src_file.relative_to(src_root)
        src_rel_set.add(rel.as_posix())
        dst_file = dst_root / rel
        copy_file(repo_root, src_file, dst_file, actions, apply, overwrite, backup, backup_root)

    if prune and dst_root.exists():
        for dst_file in dst_root.rglob("*"):
            if dst_file.is_file():
                rel = dst_file.relative_to(dst_root).as_posix()
                if _match_any(ignore_patterns, rel):
                    continue
                if rel not in src_rel_set:
                    actions.append(Action(kind="delete", dst=str(dst_file), reason="Prune: not present in source"))
                    if apply:
                        dst_file.unlink(missing_ok=True)

        # Remove empty dirs bottom-up
        for dst_dir in sorted([d for d in dst_root.rglob("*") if d.is_dir()], reverse=True):
            try:
                if not any(dst_dir.iterdir()):
                    actions.append(Action(kind="delete", dst=str(dst_dir), reason="Prune: empty directory"))
                    if apply:
                        dst_dir.rmdir()
            except Exception:
                pass

    return actions


def collect_skills(root: Path, ignore_patterns: List[str]) -> Tuple[List[SkillInfo], List[str]]:
    errors: List[str] = []
    skills: List[SkillInfo] = []

    for d in find_skill_dirs(root, ignore_patterns):
        md = d / SKILL_MD
        name, desc, fm_errors = parse_frontmatter(md)
        if fm_errors:
            errors.extend([f"{_posix_relpath(md, root)}: {e}" for e in fm_errors])
            continue
        assert name is not None and desc is not None
        skills.append(SkillInfo(skill_dir=d, name=name, description=desc))

    seen: Dict[str, str] = {}
    for s in skills:
        if s.name in seen:
            errors.append(f"Duplicate skill name '{s.name}' in '{s.skill_dir}' and '{seen[s.name]}'")
        else:
            seen[s.name] = str(s.skill_dir)

    return skills, errors


def install_from_source(
    repo_root: Path,
    source_root: Path,
    ssot_root: Path,
    ignore_patterns: List[str],
    apply: bool,
    overwrite: str,
    backup: bool,
    backup_root: Optional[Path],
    prune: bool,
) -> List[Action]:
    """
    Install skill directories found under source_root into ssot_root, preserving relative layout.

    Important behavior:
    - Only directories containing SKILL.md are copied (plus their internal files).
    - If source_root itself is a skill directory, it is installed as ssot_root/<source_root.name>/...
    - If prune is enabled, it prunes *within each installed skill directory* (it does not remove entire skills that disappeared).
    """
    actions: List[Action] = []
    all_skill_dirs = top_level_skill_dirs(find_skill_dirs(source_root, ignore_patterns))
    if not all_skill_dirs:
        actions.append(Action(kind="conflict", reason=f"No skills found under source_root={source_root}"))
        return actions

    actions.append(Action(kind="note", reason=f"Detected {len(all_skill_dirs)} skill(s) in source bundle"))

    for skill_dir in all_skill_dirs:
        rel = skill_dir.relative_to(source_root)
        if str(rel) == ".":
            rel = Path(skill_dir.name)  # install single-skill bundle as a folder under SSOT

        dst_skill_dir = ssot_root / rel
        actions.append(Action(kind="note", reason=f"Install skill: {skill_dir} -> {dst_skill_dir}"))
        actions.extend(
            plan_tree_copy(
                repo_root=repo_root,
                src_root=skill_dir,
                dst_root=dst_skill_dir,
                ignore_patterns=ignore_patterns,
                apply=apply,
                overwrite=overwrite,
                backup=backup,
                backup_root=backup_root,
                prune=prune,
            )
        )

    return actions


def load_config(path: Optional[str]) -> Dict[str, object]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Config not found: {path}")
    return json.loads(p.read_text(encoding="utf-8"))


def extract_if_zip(source: Path) -> Tuple[Path, Optional[tempfile.TemporaryDirectory]]:
    if source.is_file() and source.suffix.lower() == ".zip":
        td = tempfile.TemporaryDirectory(prefix="skills-bundle-")
        out = Path(td.name)
        with zipfile.ZipFile(source, "r") as zf:
            zf.extractall(out)
        return out, td
    return source, None


def normalize_root(repo_root: Path, p: Path) -> Path:
    return p if p.is_absolute() else (repo_root / p)


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser(
        description="Install/update Agent Skills bundles into a repository SSOT."
    )
    ap.add_argument("--repo-root", default=".", help="Target repository root (default: current directory).")
    ap.add_argument("--source", help="Path to skills bundle (dir or .zip). Required for install/update.")
    ap.add_argument("--ssot-dir", default=None, help="Destination SSOT dir inside repo (default: config or .ai/skills).")
    ap.add_argument("--config", default=None, help="Optional JSON config file.")
    ap.add_argument("--plan", action="store_true", help="Dry-run only (default unless --apply).")
    ap.add_argument("--apply", action="store_true", help="Actually write changes.")
    ap.add_argument("--overwrite", choices=["never", "changed", "always"], default=None, help="Overwrite mode.")
    ap.add_argument("--backup", action="store_true", help="Backup overwritten files.")
    ap.add_argument("--backup-dir", default=None, help="Backup base dir (default: config or .ai/.backups/skills-landing).")
    ap.add_argument("--prune", action="store_true", help="Prune within installed skills (OFF by default).")
    ap.add_argument("--verify", action="store_true", help="Verify SSOT skill structure after operations.")
    ap.add_argument("--json-report", default=None, help="Write JSON report to this path; use '-' for stdout.")

    args = ap.parse_args(argv)

    repo_root = Path(args.repo_root).expanduser().resolve()
    if not repo_root.exists():
        print(f"[error] repo root not found: {repo_root}", file=sys.stderr)
        return EXIT_INVALID

    config = load_config(args.config)

    ssot_dir_cfg = config.get("ssot_dir", ".ai/skills")
    ssot_dir = Path(args.ssot_dir) if args.ssot_dir else Path(str(ssot_dir_cfg))
    ssot_root = normalize_root(repo_root, ssot_dir)

    overwrite = args.overwrite or str(config.get("default_overwrite", "changed"))
    if overwrite not in ("never", "changed", "always"):
        overwrite = "changed"

    ignore_patterns = list(config.get("ignore", DEFAULT_IGNORE)) if isinstance(config.get("ignore"), list) else DEFAULT_IGNORE
    if not ignore_patterns:
        ignore_patterns = DEFAULT_IGNORE

    apply = bool(args.apply)
    if not args.plan and not args.apply:
        apply = False  # default to plan mode

    prune = bool(args.prune) or bool(config.get("default_prune", False))

    backup_dir_cfg = config.get("backup_dir", ".ai/.backups/skills-landing")
    backup_base = Path(args.backup_dir) if args.backup_dir else Path(str(backup_dir_cfg))
    backup_base = normalize_root(repo_root, backup_base)

    backup_root: Optional[Path] = None
    if args.backup:
        ts = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_root = backup_base / ts

    all_actions: List[Action] = []

    tmp_dir = None
    try:
        if args.source:
            source_in = Path(args.source).expanduser()
            if not source_in.is_absolute():
                source_in = (Path.cwd() / source_in).resolve()
            if not source_in.exists():
                print(f"[error] source not found: {source_in}", file=sys.stderr)
                return EXIT_INVALID

            extracted, tmp_dir = extract_if_zip(source_in)
            source_root = detect_source_root(extracted)

            all_actions.append(Action(kind="note", reason=f"Source root detected: {source_root}"))
            all_actions.append(Action(kind="note", reason=f"SSOT destination: {ssot_root}"))
            all_actions.extend(
                install_from_source(
                    repo_root=repo_root,
                    source_root=source_root,
                    ssot_root=ssot_root,
                    ignore_patterns=ignore_patterns,
                    apply=apply,
                    overwrite=overwrite,
                    backup=args.backup,
                    backup_root=backup_root,
                    prune=prune,
                )
            )

        if args.verify:
            skills, errors = collect_skills(ssot_root, ignore_patterns)
            if errors:
                for e in errors:
                    all_actions.append(Action(kind="conflict", reason=f"SSOT verify error: {e}"))
            else:
                all_actions.append(Action(kind="note", reason=f"SSOT verify OK: {len(skills)} skills"))

    finally:
        if tmp_dir is not None:
            tmp_dir.cleanup()

    copies = sum(1 for a in all_actions if a.kind == "copy")
    deletes = sum(1 for a in all_actions if a.kind == "delete")
    conflicts = sum(1 for a in all_actions if a.kind == "conflict")

    mode = "APPLY" if apply else "PLAN"
    print(f"[{mode}] repo_root={repo_root}")
    print(f"[{mode}] actions={len(all_actions)} copies={copies} deletes={deletes} conflicts={conflicts}")
    if backup_root is not None:
        print(f"[{mode}] backup_root={backup_root}")

    for a in all_actions:
        if a.kind == "note":
            print(f"  - note: {a.reason}")
        elif a.kind == "mkdir":
            print(f"  - mkdir: {a.dst}")
        elif a.kind == "copy":
            reason = f" ({a.reason})" if a.reason else ""
            print(f"  - copy: {a.src} -> {a.dst}{reason}")
        elif a.kind == "skip":
            print(f"  - skip: {a.dst} ({a.reason})")
        elif a.kind == "delete":
            print(f"  - delete: {a.dst} ({a.reason})")
        elif a.kind == "conflict":
            msg = a.reason or "conflict"
            if a.src and a.dst:
                print(f"  - CONFLICT: {a.src} -> {a.dst} ({msg})")
            else:
                print(f"  - CONFLICT: {msg}")

    if args.json_report:
        payload = {
            "mode": mode,
            "repo_root": str(repo_root),
            "ssot_root": str(ssot_root),
            "backup_root": str(backup_root) if backup_root is not None else None,
            "actions": [dataclasses.asdict(a) for a in all_actions],
            "summary": {
                "actions": len(all_actions),
                "copies": copies,
                "deletes": deletes,
                "conflicts": conflicts,
            },
        }
        if args.json_report == "-":
            print(json.dumps(payload, indent=2))
        else:
            Path(args.json_report).write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return EXIT_CONFLICT if conflicts else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
