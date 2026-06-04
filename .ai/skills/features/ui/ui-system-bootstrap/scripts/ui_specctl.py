#!/usr/bin/env python3
"""ui_specctl.py

Deterministic UI spec management for the "data-ui contract" approach (Scheme B).

This script is designed to be:
- dependency-light (stdlib only)
- idempotent (safe to re-run)
- repo-local (operates on ./ui and ./docs/context/ui)

Primary commands:
- init: scaffold ui/ and docs/context/ui if missing
- validate: validate tokens + contract
- codegen: generate CSS variables (tokens.css), TS types (contract-types.ts), and UI context (docs/context/ui/ui-spec.json)

The scripts live inside `.ai/skills/features/ui/ui-system-bootstrap/scripts/` so they can be
used without requiring a separate tooling repository.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


def utc_now_iso() -> str:
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def die(msg: str, code: int = 1) -> int:
    print(f"ERROR: {msg}", file=sys.stderr)
    return code


def read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def flatten_tokens(obj: Any, prefix: str = "") -> Dict[str, str]:
    """Flatten nested token dict to {"path.like.this": "value"}.

    - Dict keys are joined with '.'
    - Only string/int/float/bool values are included.
    - Lists are not supported (avoid in token files).
    """
    out: Dict[str, str] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "meta":
                continue
            p = f"{prefix}.{k}" if prefix else str(k)
            out.update(flatten_tokens(v, p))
    else:
        if isinstance(obj, (str, int, float, bool)):
            out[prefix] = str(obj)
        else:
            # Skip unsupported structures (lists, nulls)
            pass
    return out


def token_key_to_css_var(key: str) -> str:
    # Convert token path to CSS var name.
    # Example: "color.text_primary" -> "--ui-color-text_primary"
    safe = re.sub(r"[^a-zA-Z0-9_\.-]", "-", key)
    safe = safe.replace(".", "-")
    return f"--ui-{safe}"


def merge_dicts(base: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    """Deep-merge overlay into base (returns new dict)."""
    out = json.loads(json.dumps(base))

    def _merge(a: Dict[str, Any], b: Dict[str, Any]) -> None:
        for k, v in b.items():
            if k == "meta":
                continue
            if isinstance(v, dict) and isinstance(a.get(k), dict):
                _merge(a[k], v)
            else:
                a[k] = v

    _merge(out, overlay)
    return out


def validate_tokens(tokens: Dict[str, Any]) -> List[str]:
    errs: List[str] = []
    required_top = ["color", "typography", "space", "radius", "shadow", "border", "motion", "z"]
    for k in required_top:
        if k not in tokens or not isinstance(tokens[k], dict):
            errs.append(f"tokens missing required dict: {k}")
    if "meta" not in tokens or not isinstance(tokens["meta"], dict):
        errs.append("tokens missing meta")
    # Simple value sanity checks
    flat = flatten_tokens(tokens)
    for k, v in flat.items():
        if v.strip() == "":
            errs.append(f"empty token value: {k}")
    return errs


def validate_contract(contract: Dict[str, Any]) -> List[str]:
    errs: List[str] = []
    if "meta" not in contract or not isinstance(contract["meta"], dict):
        errs.append("contract missing meta")
    roles = contract.get("roles")
    if not isinstance(roles, dict) or not roles:
        errs.append("contract.roles missing or empty")
        return errs

    role_name_re = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
    attr_name_re = re.compile(r"^[a-z][a-z0-9_]*$")

    for role, spec in roles.items():
        if not role_name_re.match(role):
            errs.append(f"invalid role name: {role}")
        if not isinstance(spec, dict):
            errs.append(f"role spec not an object: {role}")
            continue
        attrs = spec.get("attrs", {})
        slots = spec.get("slots", [])
        if not isinstance(attrs, dict):
            errs.append(f"role attrs must be dict: {role}")
        else:
            for aname, avals in attrs.items():
                if not attr_name_re.match(aname):
                    errs.append(f"invalid attr name '{aname}' in role '{role}'")
                if not isinstance(avals, list) or not avals:
                    errs.append(f"attr '{aname}' values must be non-empty list in role '{role}'")
                else:
                    for v in avals:
                        if not isinstance(v, str) or not v:
                            errs.append(f"attr '{aname}' has non-string/empty value in role '{role}'")
        if not isinstance(slots, list):
            errs.append(f"role slots must be list: {role}")
        else:
            for s in slots:
                if not isinstance(s, str) or not s:
                    errs.append(f"role '{role}' has invalid slot value")
    return errs


def find_skill_assets_template_dir() -> Path:
    # scripts/ui_specctl.py -> skill_root
    script_dir = Path(__file__).resolve().parent
    skill_root = script_dir.parent
    template_dir = skill_root / "assets" / "ui-template"
    return template_dir


def copy_template_into_repo(template_dir: Path, repo_root: Path, force: bool) -> None:
    if not template_dir.exists():
        raise FileNotFoundError(f"Template dir not found: {template_dir}")

    # Copy ui/ and docs/context/ui
    for rel in ["ui", "docs/context/ui"]:
        src = template_dir / rel
        dst = repo_root / rel
        if not src.exists():
            continue
        if dst.exists():
            if force:
                # destructive overwrite
                if dst.is_dir():
                    shutil.rmtree(dst)
                else:
                    dst.unlink()
            else:
                # merge-copy (create missing files only)
                for root, dirs, files in os.walk(src):
                    r = Path(root)
                    relp = r.relative_to(src)
                    (dst / relp).mkdir(parents=True, exist_ok=True)
                    for fn in files:
                        sfile = r / fn
                        dfile = dst / relp / fn
                        if dfile.exists():
                            continue
                        shutil.copy2(sfile, dfile)
                continue

        shutil.copytree(src, dst)


def render_tokens_css(base_tokens: Dict[str, Any], theme_files: List[Tuple[str, Dict[str, Any]]]) -> str:
    base_flat = flatten_tokens(base_tokens)

    lines: List[str] = []
    lines.append("/* GENERATED FILE. DO NOT EDIT BY HAND.")
    lines.append(" * Source: ui/tokens/base.json + ui/tokens/themes/*.json")
    lines.append(" */")
    lines.append("@layer tokens {")
    lines.append("  :root {")
    for k in sorted(base_flat.keys()):
        css_var = token_key_to_css_var(k)
        v = base_flat[k]
        lines.append(f"    {css_var}: {v};")
    lines.append("  }")

    for theme_name, theme_tokens in theme_files:
        merged = merge_dicts(base_tokens, theme_tokens)
        merged_flat = flatten_tokens(merged)
        # Only emit overrides that differ from base
        overrides = {k: v for k, v in merged_flat.items() if base_flat.get(k) != v}
        if not overrides:
            continue
        lines.append("")
        lines.append(f"  :root[data-theme=\"{theme_name}\"] {{")
        for k in sorted(overrides.keys()):
            css_var = token_key_to_css_var(k)
            v = overrides[k]
            lines.append(f"    {css_var}: {v};")
        lines.append("  }")

    lines.append("}")
    return "\n".join(lines) + "\n"


def render_contract_types(contract: Dict[str, Any]) -> str:
    roles = contract.get("roles", {})

    def ts_string_union(values: Iterable[str]) -> str:
        vals = list(values)
        if not vals:
            return "never"
        return " | ".join([json.dumps(v) for v in vals])

    lines: List[str] = []
    lines.append("/* GENERATED FILE. DO NOT EDIT BY HAND.")
    lines.append(" * Source: ui/contract/contract.json")
    lines.append(" */")
    lines.append("")
    lines.append(f"export type UiRole = {ts_string_union(sorted(roles.keys()))};")
    lines.append("")

    # Per-role attribute unions
    lines.append("export interface UiRoleAttributesMap {")
    for role in sorted(roles.keys()):
        spec = roles[role]
        attrs = spec.get("attrs", {})
        lines.append(f"  {json.dumps(role)}: {{")
        if not attrs:
            lines.append("  };")
            continue
        for aname in sorted(attrs.keys()):
            lines.append(f"    {aname}?: {ts_string_union(attrs[aname])};")
        lines.append("  };")
    lines.append("}")
    lines.append("")
    lines.append("export type UiAttrsForRole<R extends UiRole> = UiRoleAttributesMap[R];")
    lines.append("")

    # Slot unions (optional helper)
    lines.append("export interface UiRoleSlotsMap {")
    for role in sorted(roles.keys()):
        slots = roles[role].get("slots", [])
        lines.append(f"  {json.dumps(role)}: {ts_string_union(slots)};")
    lines.append("}")
    lines.append("")
    lines.append("export type UiSlotsForRole<R extends UiRole> = UiRoleSlotsMap[R];")

    return "\n".join(lines) + "\n"


def load_theme_files(themes_dir: Path) -> List[Tuple[str, Dict[str, Any]]]:
    out: List[Tuple[str, Dict[str, Any]]] = []
    if not themes_dir.exists():
        return out
    for p in sorted(themes_dir.glob("*.json")):
        data = read_json(p)
        theme_name = data.get("meta", {}).get("theme")
        if not theme_name:
            # fallback to file stem
            theme_name = p.stem
        out.append((theme_name, data))
    return out


def update_ui_spec_version(repo_root: Path, version: str, generated_at: str) -> None:
    p = repo_root / "ui" / "spec-version.json"
    if not p.exists():
        return
    data = read_json(p)
    data["ui_spec_version"] = version
    data["generated_at_utc"] = generated_at
    write_json(p, data)


def write_context_ui_spec(repo_root: Path, ui_spec_version: str, themes: List[str], roles: List[str]) -> None:
    p = repo_root / "docs" / "context" / "ui" / "ui-spec.json"
    # Keep locked parameters explicitly visible to the LLM (and humans).
    # This reduces drift and avoids relying on external docs during generation.
    locked_parameters = {
        "contract_roles_count": len(roles),
        "tokens_required_groups": ["color", "typography", "space", "radius", "shadow", "border", "motion", "z"],
        "governance_gates": ["spec_validate", "code_audit", "tailwind_B1_audit", "feature_css_audit"],
    }
    obj: Dict[str, Any] = {
        "ui_spec_version": ui_spec_version,
        "generated_at_utc": utc_now_iso(),
        "tailwind_policy": "B1-layout-only",
        "theme_policy": "token-only",
        "paths": {
            "tokens": "ui/tokens/base.json",
            "themes": "ui/tokens/themes/*.json",
            "contract": "ui/contract/contract.json",
            "styles_entry": "ui/styles/ui.css",
            "governance_config": "ui/config/governance.json"
        },
        "locked_parameters": locked_parameters,
        "themes": themes,
        "roles": roles,
        "notes": {
            "tailwind_boundary": "Tailwind is allowed for layout only; do not use it for color/typography/radius/shadow/spacing.",
            "global_vs_feature_css": "Global UI lives in ui/styles (layers reset/tokens/contract). Feature CSS must stay in @layer feature and must not define visual tokens.",
            "change_policy": "Theme changes are token-only. Contract expansion requires RFC + approval."
        }
    }
    write_json(p, obj)


def cmd_validate(repo_root: Path) -> int:
    base_path = repo_root / "ui" / "tokens" / "base.json"
    contract_path = repo_root / "ui" / "contract" / "contract.json"
    if not base_path.exists():
        return die(f"Missing tokens: {base_path}. Run init first.")
    if not contract_path.exists():
        return die(f"Missing contract: {contract_path}. Run init first.")

    base_tokens = read_json(base_path)
    contract = read_json(contract_path)

    errs = []
    errs.extend(validate_tokens(base_tokens))
    errs.extend(validate_contract(contract))

    if errs:
        for e in errs:
            print(f"- {e}")
        return 2
    print("OK: tokens and contract validate")
    return 0


def cmd_codegen(repo_root: Path) -> int:
    # Load
    base_path = repo_root / "ui" / "tokens" / "base.json"
    contract_path = repo_root / "ui" / "contract" / "contract.json"
    version_path = repo_root / "ui" / "spec-version.json"

    if not base_path.exists() or not contract_path.exists() or not version_path.exists():
        return die("Missing ui/ spec. Run init first.")

    base_tokens = read_json(base_path)
    contract = read_json(contract_path)
    version_obj = read_json(version_path)
    ui_spec_version = str(version_obj.get("ui_spec_version", "1.0.0"))

    theme_files = load_theme_files(repo_root / "ui" / "tokens" / "themes")

    # Validate
    errs = []
    errs.extend(validate_tokens(base_tokens))
    errs.extend(validate_contract(contract))
    if errs:
        for e in errs:
            print(f"- {e}")
        return 2

    # tokens.css
    tokens_css = render_tokens_css(base_tokens, theme_files)
    write_text(repo_root / "ui" / "styles" / "tokens.css", tokens_css)

    # TS types
    types_ts = render_contract_types(contract)
    write_text(repo_root / "ui" / "codegen" / "contract-types.ts", types_ts)

    # Context
    theme_names = [name for name, _ in theme_files]
    role_names = sorted(list(contract.get("roles", {}).keys()))
    write_context_ui_spec(repo_root, ui_spec_version=ui_spec_version, themes=theme_names, roles=role_names)

    # Update version file timestamp
    update_ui_spec_version(repo_root, version=ui_spec_version, generated_at=utc_now_iso())

    print("OK: codegen complete")
    return 0


def cmd_init(repo_root: Path, force: bool) -> int:
    template_dir = find_skill_assets_template_dir()
    try:
        copy_template_into_repo(template_dir, repo_root, force=force)
    except Exception as e:
        return die(str(e))

    # Ensure tmp evidence root exists
    (repo_root / ".ai" / ".tmp" / "ui").mkdir(parents=True, exist_ok=True)

    # codegen after init
    rc = cmd_codegen(repo_root)
    if rc != 0:
        return rc

    print("OK: ui spec initialized")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="UI spec control (tokens/contract/codegen/context).")
    parser.add_argument("--repo-root", default=".", help="Repo root (default: current directory)")

    sub = parser.add_subparsers(dest="cmd", required=True)

    p_init = sub.add_parser("init", help="Initialize ui/ + docs/context/ui scaffolding")
    p_init.add_argument("--force", action="store_true", help="Overwrite existing ui/ and docs/context/ui")

    sub.add_parser("validate", help="Validate tokens and contract")
    sub.add_parser("codegen", help="Generate tokens.css + TS types + docs/context/ui/ui-spec.json")

    args = parser.parse_args()
    repo_root = Path(args.repo_root).resolve()

    if args.cmd == "init":
        return cmd_init(repo_root, force=bool(args.force))
    if args.cmd == "validate":
        return cmd_validate(repo_root)
    if args.cmd == "codegen":
        return cmd_codegen(repo_root)

    return die("unknown command")


if __name__ == "__main__":
    raise SystemExit(main())
