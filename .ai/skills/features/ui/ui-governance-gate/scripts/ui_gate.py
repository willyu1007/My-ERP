#!/usr/bin/env python3
"""ui_gate.py

UI Governance Gate for the "data-ui contract" UI system.

Goals:
- Provide a deterministic, dependency-light baseline (stdlib only) that always runs.
- Optionally orchestrate external quality tools (ESLint, Stylelint, Playwright) under
  a single gate entrypoint and single evidence directory.
- Provide a real-time approval workflow (local, non-PR) to reduce UI spec drift:
  - spec changes (tokens/contract/patterns) require a "spec_change" approval
  - governance/policy relaxations require an "exception" approval (with expiry recommended)

Evidence (quick mode): .ai/.tmp/ui/<run-id>/

This script is repo-scoped and is intended to be called by the ui-governance-gate skill.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple


APPROVAL_VERSION = 1


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def default_run_id() -> str:
    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + f"-{os.getpid()}"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_text(s: str) -> str:
    return sha256_bytes(s.encode("utf-8"))


def _safe_relpath(repo_root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(repo_root))
    except Exception:
        return str(path)


@dataclasses.dataclass
class Issue:
    severity: str  # ERROR | WARN
    rule: str
    path: str
    line: Optional[int]
    message: str

    def to_dict(self) -> Dict[str, object]:
        return {
            "severity": self.severity,
            "rule": self.rule,
            "path": self.path,
            "line": self.line,
            "message": self.message,
        }


@dataclasses.dataclass
class ToolResult:
    name: str
    status: str  # PASS | FAIL | SKIP
    command: Optional[str]
    exit_code: Optional[int]
    duration_ms: int
    stdout_rel: Optional[str]
    stderr_rel: Optional[str]
    report_rel: Optional[str]
    notes: Optional[str]

    def to_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "status": self.status,
            "command": self.command,
            "exit_code": self.exit_code,
            "duration_ms": self.duration_ms,
            "stdout_rel": self.stdout_rel,
            "stderr_rel": self.stderr_rel,
            "report_rel": self.report_rel,
            "notes": self.notes,
        }


def load_json(path: Path) -> Dict[str, object]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, obj: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def find_repo_root(start: Path) -> Path:
    p = start.resolve()
    for _ in range(8):
        # Prefer the nearest directory that contains the UI SSOT root.
        # This makes smoke tests and nested worktrees deterministic even when they
        # live inside a larger git repository.
        if (p / "ui" / "tokens" / "base.json").exists() and (
            p / "ui" / "contract" / "contract.json"
        ).exists():
            return p
        if (p / ".git").exists():
            return p
        if p.parent == p:
            break
        p = p.parent
    return start.resolve()


def load_governance_config(repo_root: Path) -> Dict[str, object]:
    cfg_path = repo_root / "ui" / "config" / "governance.json"
    if cfg_path.exists():
        try:
            return load_json(cfg_path)
        except Exception:
            pass

    # Defaults aligned with ui-system-bootstrap template.
    return {
        "tailwind_policy": "B1-layout-only",
        "theme_policy": "token-only",
        "scan": {
            "include_roots": ["src", "app", "pages", "components"],
            "exclude_roots": [
                "node_modules",
                "dist",
                "build",
                ".next",
                ".ai",
                ".codex",
                "coverage",
            ],
        },
        "tailwind": {
            "allowed_utility_whitelist": [
                "sr-only",
                "truncate",
                "break-words",
                "break-all",
                "whitespace-nowrap",
            ],
            "disallowed_prefixes": [
                "bg-",
                "text-",
                "from-",
                "via-",
                "to-",
                "decoration-",
                "font-",
                "leading-",
                "tracking-",
                "shadow",
                "rounded",
                "ring-",
                "outline-",
                "border",
                "divide-",
                "p-",
                "px-",
                "py-",
                "pt-",
                "pr-",
                "pb-",
                "pl-",
                "m-",
                "mx-",
                "my-",
                "mt-",
                "mr-",
                "mb-",
                "ml-",
            ],
            "disallowed_substrings": ["[", "]", "#", "("],
        },
        "code_rules": {
            "disallow_inline_style": True,
            "disallow_hardcoded_color_literals": True,
            "disallow_raw_box_shadow": True,
        },
        "feature_css_rules": {
            "disallow_properties": [
                "color",
                "background",
                "background-color",
                "font",
                "font-family",
                "font-size",
                "font-weight",
                "line-height",
                "border-radius",
                "box-shadow",
                "margin",
                "padding",
            ]
        },
        "approvals": {
            "enabled": True,
            "approvals_dir": "ui/approvals",
            "enforce_spec_approval": True,
            "enforce_exception_approval": True,
            "auto_baseline_if_missing": True,
        },
        "tools": {
            "eslint": {
                "enabled": "auto",
                "command": "npx eslint . --ext .ts,.tsx,.js,.jsx --format json --output-file {out}",
                "report": "eslint.json",
            },
            "stylelint": {
                "enabled": "auto",
                "command": 'npx stylelint "src/**/*.{css,scss}" --formatter json --output-file {out}',
                "report": "stylelint.json",
            },
            "playwright": {
                "enabled": "auto",
                "command": "npx playwright test",
                "artifacts": ["playwright-report", "test-results"],
            },
        },
    }


def validate_tokens(tokens: Dict[str, object]) -> List[str]:
    errs: List[str] = []
    required_top = [
        "color",
        "typography",
        "space",
        "radius",
        "shadow",
        "border",
        "motion",
        "z",
    ]
    for k in required_top:
        if k not in tokens:
            errs.append(f"Missing required token group: {k}")
    if "meta" not in tokens:
        errs.append("Missing meta")
    return errs


def validate_contract(
    contract: Dict[str, object],
) -> Tuple[List[str], Set[str], Dict[str, Dict[str, Set[str]]], Set[str]]:
    errs: List[str] = []
    roles: Set[str] = set()
    role_attr_values: Dict[str, Dict[str, Set[str]]] = {}
    slot_vocab: Set[str] = set()

    meta = contract.get("meta")
    if not isinstance(meta, dict):
        errs.append("contract.meta must be an object")

    roles_obj = contract.get("roles")
    if not isinstance(roles_obj, dict):
        errs.append("contract.roles must be an object")
        return errs, roles, role_attr_values, slot_vocab

    for role, spec in roles_obj.items():
        roles.add(role)
        if not isinstance(spec, dict):
            errs.append(f"role {role} spec must be an object")
            continue
        attrs = spec.get("attrs", {})
        if not isinstance(attrs, dict):
            errs.append(f"role {role}.attrs must be an object")
            attrs = {}
        slots = spec.get("slots", [])
        if not isinstance(slots, list):
            errs.append(f"role {role}.slots must be a list")
            slots = []
        slot_vocab.update([s for s in slots if isinstance(s, str)])

        role_attr_values[role] = {}
        for attr_name, allowed in attrs.items():
            if not isinstance(allowed, list) or not all(
                isinstance(v, str) for v in allowed
            ):
                errs.append(f"role {role}.attrs.{attr_name} must be a list[str]")
                continue
            role_attr_values[role][attr_name] = set(allowed)

    return errs, roles, role_attr_values, slot_vocab


def iter_scan_files(
    repo_root: Path, include_roots: List[str], exclude_roots: List[str]
) -> Iterable[Path]:
    include_paths = [repo_root / p for p in include_roots]
    exclude_abs: Set[Path] = {(repo_root / p).resolve() for p in exclude_roots}

    exts = {".ts", ".tsx", ".js", ".jsx", ".css", ".scss"}

    for base in include_paths:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in exts:
                continue
            rp = path.resolve()
            if any(str(rp).startswith(str(ex)) for ex in exclude_abs):
                continue
            yield path


HEX_COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RGB_COLOR_RE = re.compile(r"\b(?:rgb|rgba|hsl|hsla)\(")
INLINE_STYLE_RE = re.compile(r"\bstyle\s*=")
BOX_SHADOW_RE = re.compile(r"\bbox-shadow\s*:")


def scan_file_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")


def compute_line_number(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


def _is_ident_char(ch: str) -> bool:
    return ch.isalnum() or ch in {"_", "-"}


def _at_word_boundary(text: str, idx: int, name: str) -> bool:
    # Ensure `name` at idx is not a substring of a larger identifier.
    before = text[idx - 1] if idx > 0 else ""
    after_i = idx + len(name)
    after = text[after_i] if after_i < len(text) else ""
    if before and _is_ident_char(before):
        return False
    if after and _is_ident_char(after):
        return False
    return True


def _parse_quoted_string(text: str, start: int) -> Tuple[Optional[str], int]:
    """Parse a JS string starting at `start` (quote is at start).

    Returns (value, end_index_exclusive). If unparseable, value is None.
    """
    if start >= len(text) or text[start] not in {'"', "'"}:
        return None, start
    quote = text[start]
    i = start + 1
    out: List[str] = []
    while i < len(text):
        c = text[i]
        if c == "\\":
            # Skip escape + next char
            if i + 1 < len(text):
                out.append(text[i + 1])
                i += 2
                continue
            i += 1
            continue
        if c == quote:
            return "".join(out), i + 1
        out.append(c)
        i += 1
    return None, i


def _parse_template_literal(
    text: str, start: int
) -> Tuple[Optional[List[str]], Optional[List[str]], int]:
    """Parse a JS template literal starting at `start` (backtick at start).

    Returns (static_segments, nested_string_literals, end_index_exclusive).

    - static_segments: list of raw static segments between ${...} expressions.
    - nested_string_literals: best-effort extraction of string literals within ${...} expressions.

    If unparseable, static_segments/nested_string_literals are None.
    """
    if start >= len(text) or text[start] != "`":
        return None, None, start
    i = start + 1
    seg: List[str] = []
    segments: List[str] = []
    nested: List[str] = []
    while i < len(text):
        c = text[i]
        if c == "\\":
            if i + 1 < len(text):
                seg.append(text[i + 1])
                i += 2
                continue
            i += 1
            continue
        if c == "`":
            segments.append("".join(seg))
            return segments, nested, i + 1
        if c == "$" and i + 1 < len(text) and text[i + 1] == "{":
            # Flush current static segment
            segments.append("".join(seg))
            seg = []
            # Skip ${ ... }
            inner, end = _parse_braced_expression(text, i + 1)
            if inner is None:
                return None, None, end
            # Extract string literals inside the template expression.
            nested.extend(_extract_string_literals_js(inner))
            # Keep walking from end
            i = end
            continue
        seg.append(c)
        i += 1
    return None, None, i


def _parse_braced_expression(text: str, start: int) -> Tuple[Optional[str], int]:
    """Parse a { ... } expression starting at `start` (must be '{').

    Returns (inner_text, end_index_exclusive). If unparseable, inner_text is None.
    """
    if start >= len(text) or text[start] != "{":
        return None, start
    depth = 0
    i = start
    in_s = False
    in_d = False
    in_t = False
    while i < len(text):
        c = text[i]
        if in_s:
            if c == "\\":
                i += 2
                continue
            if c == "'":
                in_s = False
            i += 1
            continue
        if in_d:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_d = False
            i += 1
            continue
        if in_t:
            if c == "\\":
                i += 2
                continue
            if c == "`":
                in_t = False
                i += 1
                continue
            i += 1
            continue

        # Not in a quoted region
        if c == "'":
            in_s = True
            i += 1
            continue
        if c == '"':
            in_d = True
            i += 1
            continue
        if c == "`":
            in_t = True
            i += 1
            continue
        if c == "{":
            depth += 1
            i += 1
            continue
        if c == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i], i + 1
            i += 1
            continue
        i += 1

    return None, i


def _extract_string_literals_js(expr: str) -> List[str]:
    """Extract string literals (single/double quoted) + template static segments from JS code.

    Best-effort heuristic (not a full JS parser).
    """
    out: List[str] = []
    i = 0
    while i < len(expr):
        c = expr[i]
        if c in {'"', "'"}:
            s, end = _parse_quoted_string(expr, i)
            if s is not None:
                out.append(s)
            i = max(end, i + 1)
            continue
        if c == "`":
            segments, nested, end = _parse_template_literal(expr, i)
            if segments is not None:
                out.extend(
                    [seg for seg in segments if isinstance(seg, str) and seg != ""]
                )
            if nested is not None:
                out.extend([s for s in nested if isinstance(s, str) and s != ""])
            i = max(end, i + 1)
            continue
        i += 1
    return out


def _iter_jsx_attr_values(
    text: str, attr_name: str
) -> Iterable[Tuple[int, str, str, List[str]]]:
    """Yield occurrences of JSX attribute values.

    Returns tuples: (attr_start_index, kind, raw_value, extracted_literals)

    kind:
    - "string": raw_value is the string content
    - "expr": raw_value is the inner expression (without outer braces)
    - "bare": raw_value is the unquoted token
    - "unparseable": raw_value is a best-effort capture
    """
    i = 0
    while True:
        idx = text.find(attr_name, i)
        if idx == -1:
            return
        i = idx + len(attr_name)
        if not _at_word_boundary(text, idx, attr_name):
            continue
        j = i
        while j < len(text) and text[j].isspace():
            j += 1
        if j >= len(text) or text[j] != "=":
            continue
        j += 1
        while j < len(text) and text[j].isspace():
            j += 1
        if j >= len(text):
            continue

        c = text[j]
        if c in {'"', "'"}:
            s, end = _parse_quoted_string(text, j)
            raw = s or ""
            yield idx, "string", raw, [raw]
            i = max(end, j + 1)
            continue
        if c == "{":
            inner, end = _parse_braced_expression(text, j)
            raw = inner or ""
            lits = _extract_string_literals_js(raw) if inner is not None else []
            yield idx, "expr", raw, lits
            i = max(end, j + 1)
            continue
        if c == "`":
            segments, nested, end = _parse_template_literal(text, j)
            raw = "".join(segments or [])
            lits: List[str] = []
            if segments is not None:
                lits.extend([s for s in segments if isinstance(s, str) and s.strip()])
            if nested is not None:
                lits.extend([s for s in nested if isinstance(s, str) and s.strip()])
            yield idx, "template", raw, lits
            i = max(end, j + 1)
            continue

        # Bare token (identifier/number)
        start_tok = j
        while j < len(text) and (not text[j].isspace()) and text[j] not in {">", "/"}:
            j += 1
        raw = text[start_tok:j]
        yield idx, "bare", raw, []
        i = j


def _find_tag_end(text: str, tag_start: int) -> Optional[int]:
    """Find the end '>' for a JSX opening tag starting at tag_start."""
    i = tag_start
    in_s = False
    in_d = False
    in_t = False
    brace_depth = 0
    while i < len(text):
        c = text[i]
        if in_s:
            if c == "\\":
                i += 2
                continue
            if c == "'":
                in_s = False
            i += 1
            continue
        if in_d:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_d = False
            i += 1
            continue
        if in_t:
            if c == "\\":
                i += 2
                continue
            if c == "`":
                in_t = False
            i += 1
            continue

        if c == "'":
            in_s = True
            i += 1
            continue
        if c == '"':
            in_d = True
            i += 1
            continue
        if c == "`":
            in_t = True
            i += 1
            continue
        if c == "{":
            brace_depth += 1
            i += 1
            continue
        if c == "}" and brace_depth > 0:
            brace_depth -= 1
            i += 1
            continue
        if c == ">" and brace_depth == 0:
            return i
        i += 1
    return None


def _extract_opening_tag(text: str, attr_idx: int) -> Optional[Tuple[int, int, str]]:
    """Extract the full '<...>' tag that contains a given attribute occurrence."""
    start = text.rfind("<", 0, attr_idx)
    while start != -1 and start + 1 < len(text) and text[start + 1] == "/":
        # Skip closing tags
        start = text.rfind("<", 0, start)
    if start == -1:
        return None
    end = _find_tag_end(text, start)
    if end is None:
        return None
    return start, end, text[start : end + 1]


def _parse_tag_attributes(tag_text: str) -> List[Tuple[str, str, str, List[str], int]]:
    """Parse attributes from a JSX opening tag.

    Returns a list of (name, kind, raw_value, literals, attr_offset_in_tag).
    """
    attrs: List[Tuple[str, str, str, List[str], int]] = []
    if not tag_text.startswith("<"):
        return attrs
    i = 1
    # Skip tag name
    while i < len(tag_text) and tag_text[i].isspace():
        i += 1
    while (
        i < len(tag_text)
        and not tag_text[i].isspace()
        and tag_text[i] not in {">", "/"}
    ):
        i += 1

    while i < len(tag_text):
        while i < len(tag_text) and tag_text[i].isspace():
            i += 1
        if i >= len(tag_text) or tag_text[i] in {">", "/"}:
            break

        name_start = i
        while (
            i < len(tag_text)
            and not tag_text[i].isspace()
            and tag_text[i] not in {"=", ">", "/"}
        ):
            i += 1
        name = tag_text[name_start:i]

        while i < len(tag_text) and tag_text[i].isspace():
            i += 1

        kind = "boolean"
        raw = ""
        lits: List[str] = []
        if i < len(tag_text) and tag_text[i] == "=":
            i += 1
            while i < len(tag_text) and tag_text[i].isspace():
                i += 1
            if i >= len(tag_text):
                attrs.append((name, "unparseable", "", [], name_start))
                break
            c = tag_text[i]
            if c in {'"', "'"}:
                s, end = _parse_quoted_string(tag_text, i)
                raw = s or ""
                kind = "string"
                lits = [raw]
                i = max(end, i + 1)
            elif c == "{":
                inner, end = _parse_braced_expression(tag_text, i)
                raw = inner or ""
                kind = "expr"
                lits = _extract_string_literals_js(raw) if inner is not None else []
                i = max(end, i + 1)
            elif c == "`":
                segments, nested, end = _parse_template_literal(tag_text, i)
                raw = "".join(segments or [])
                kind = "template"
                lits = []
                if segments is not None:
                    lits.extend(
                        [s for s in segments if isinstance(s, str) and s.strip()]
                    )
                if nested is not None:
                    lits.extend([s for s in nested if isinstance(s, str) and s.strip()])
                i = max(end, i + 1)
            else:
                start_tok = i
                while (
                    i < len(tag_text)
                    and (not tag_text[i].isspace())
                    and tag_text[i] not in {">", "/"}
                ):
                    i += 1
                raw = tag_text[start_tok:i]
                kind = "bare"
                lits = []

        attrs.append((name, kind, raw, lits, name_start))
    return attrs


def scan_code_and_css(
    repo_root: Path,
    files: Iterable[Path],
    cfg: Dict[str, object],
    roles: Set[str],
    role_attr_values: Dict[str, Dict[str, Set[str]]],
    slot_vocab: Set[str],
) -> List[Issue]:
    issues: List[Issue] = []

    tailwind_cfg = (
        cfg.get("tailwind", {}) if isinstance(cfg.get("tailwind"), dict) else {}
    )
    disallowed_prefixes = [
        p for p in tailwind_cfg.get("disallowed_prefixes", []) if isinstance(p, str)
    ]
    disallowed_substrings = [
        s for s in tailwind_cfg.get("disallowed_substrings", []) if isinstance(s, str)
    ]
    allow_whitelist = set(
        [
            s
            for s in tailwind_cfg.get("allowed_utility_whitelist", [])
            if isinstance(s, str)
        ]
    )

    feature_css_cfg = (
        cfg.get("feature_css_rules", {})
        if isinstance(cfg.get("feature_css_rules"), dict)
        else {}
    )
    disallow_props = set(
        [
            p
            for p in feature_css_cfg.get("disallow_properties", [])
            if isinstance(p, str)
        ]
    )

    code_rules = (
        cfg.get("code_rules", {}) if isinstance(cfg.get("code_rules"), dict) else {}
    )

    for path in files:
        rel = _safe_relpath(repo_root, path)
        text = scan_file_text(path)

        if code_rules.get("disallow_inline_style", True):
            for m in INLINE_STYLE_RE.finditer(text):
                issues.append(
                    Issue(
                        "ERROR",
                        "no-inline-style",
                        rel,
                        compute_line_number(text, m.start()),
                        "Inline style attribute found.",
                    )
                )

        if code_rules.get("disallow_hardcoded_color_literals", True):
            for m in HEX_COLOR_RE.finditer(text):
                issues.append(
                    Issue(
                        "ERROR",
                        "no-hardcoded-colors",
                        rel,
                        compute_line_number(text, m.start()),
                        f"Hard-coded color literal: {m.group(0)}",
                    )
                )
            for m in RGB_COLOR_RE.finditer(text):
                issues.append(
                    Issue(
                        "ERROR",
                        "no-hardcoded-colors",
                        rel,
                        compute_line_number(text, m.start()),
                        "rgb()/hsl() color literal found.",
                    )
                )

        if code_rules.get("disallow_raw_box_shadow", True):
            for m in BOX_SHADOW_RE.finditer(text):
                issues.append(
                    Issue(
                        "ERROR",
                        "no-raw-box-shadow",
                        rel,
                        compute_line_number(text, m.start()),
                        "Raw box-shadow found. Use tokens via contract.",
                    )
                )

        # Tailwind B1 checks (robust): parse className attribute values and inspect string literals.
        # This closes common bypasses (clsx/template literals) while keeping the scanner dependency-light.
        if path.suffix in {".ts", ".tsx", ".js", ".jsx"}:
            for attr_idx, kind, raw, lits in _iter_jsx_attr_values(text, "className"):
                # If className is dynamic and we can't see any string literals, treat as a bypass risk.
                if kind in {"expr", "bare", "template", "unparseable"} and not lits:
                    issues.append(
                        Issue(
                            "ERROR",
                            "tailwind-b1-unparseable",
                            rel,
                            compute_line_number(text, attr_idx),
                            "className is dynamic and contains no analyzable string literals. "
                            "Under Tailwind B1 (layout-only), className must be composed from explicit string literals.",
                        )
                    )
                    continue

                for lit in [s for s in lits if isinstance(s, str) and s.strip()]:
                    for token in lit.split():
                        if token in allow_whitelist:
                            continue
                        if any(sub in token for sub in disallowed_substrings):
                            issues.append(
                                Issue(
                                    "ERROR",
                                    "tailwind-b1",
                                    rel,
                                    compute_line_number(text, attr_idx),
                                    f"Disallowed Tailwind token (substring): {token}",
                                )
                            )
                            continue
                        if any(token.startswith(pref) for pref in disallowed_prefixes):
                            issues.append(
                                Issue(
                                    "ERROR",
                                    "tailwind-b1",
                                    rel,
                                    compute_line_number(text, attr_idx),
                                    f"Disallowed Tailwind token (prefix): {token}",
                                )
                            )

        # Contract usage: validate data-ui roles + per-role attrs on the same JSX opening tag.
        if path.suffix in {".ts", ".tsx", ".js", ".jsx"}:
            # Validate tags that contain data-ui.
            for ui_idx, ui_kind, ui_raw, ui_lits in _iter_jsx_attr_values(
                text, "data-ui"
            ):
                tag = _extract_opening_tag(text, ui_idx)
                if tag is None:
                    issues.append(
                        Issue(
                            "ERROR",
                            "contract-tag-parse",
                            rel,
                            compute_line_number(text, ui_idx),
                            "Unable to locate enclosing JSX tag for data-ui attribute.",
                        )
                    )
                    continue
                tag_start, tag_end, tag_text = tag
                attrs = _parse_tag_attributes(tag_text)

                # Find role value
                role_val: Optional[str] = None
                for n, k, raw, lits, off in attrs:
                    if n == "data-ui":
                        if k == "string" and raw:
                            role_val = raw
                        elif k in {"expr", "template"}:
                            if len([s for s in lits if s is not None]) == 1:
                                role_val = [s for s in lits if s is not None][0]
                        break
                if not role_val:
                    issues.append(
                        Issue(
                            "ERROR",
                            "contract-role",
                            rel,
                            compute_line_number(text, ui_idx),
                            "data-ui must be a single string literal.",
                        )
                    )
                    continue
                if role_val not in roles:
                    issues.append(
                        Issue(
                            "ERROR",
                            "contract-role",
                            rel,
                            compute_line_number(text, ui_idx),
                            f"Unknown data-ui role: {role_val}",
                        )
                    )
                    continue

                allowed_map = role_attr_values.get(role_val, {})

                # Validate other data-* attributes on this tag
                for n, k, raw, lits, off in attrs:
                    if not n.startswith("data-"):
                        continue
                    if n in {"data-ui", "data-slot"}:
                        continue
                    key = n[len("data-") :]
                    line = compute_line_number(text, tag_start + off)

                    if key not in allowed_map:
                        issues.append(
                            Issue(
                                "ERROR",
                                "contract-attr",
                                rel,
                                line,
                                f"Role {role_val} does not allow attribute {n}",
                            )
                        )
                        continue

                    allowed_vals = allowed_map.get(key, set())
                    if k == "string":
                        if raw not in allowed_vals:
                            issues.append(
                                Issue(
                                    "ERROR",
                                    "contract-enum",
                                    rel,
                                    line,
                                    f"Role {role_val} attribute {n} invalid value: {raw}",
                                )
                            )
                        continue

                    if k in {"expr", "template"}:
                        if not lits:
                            issues.append(
                                Issue(
                                    "ERROR",
                                    "contract-dynamic",
                                    rel,
                                    line,
                                    f"Attribute {n} is dynamic but contains no analyzable string literals. "
                                    "Use explicit string literals or conditional rendering.",
                                )
                            )
                            continue
                        for v in [s for s in lits if isinstance(s, str) and s != ""]:
                            if v not in allowed_vals:
                                issues.append(
                                    Issue(
                                        "ERROR",
                                        "contract-enum",
                                        rel,
                                        line,
                                        f"Role {role_val} attribute {n} invalid value: {v}",
                                    )
                                )
                        continue

                    # boolean/bare/unparseable
                    issues.append(
                        Issue(
                            "ERROR",
                            "contract-dynamic",
                            rel,
                            line,
                            f"Attribute {n} must be a string literal or a conditional expression of string literals.",
                        )
                    )

            # Global data-slot vocabulary check (warn-only)
            for slot_idx, slot_kind, slot_raw, slot_lits in _iter_jsx_attr_values(
                text, "data-slot"
            ):
                if slot_kind == "string":
                    if slot_raw not in slot_vocab:
                        issues.append(
                            Issue(
                                "WARN",
                                "contract-slot",
                                rel,
                                compute_line_number(text, slot_idx),
                                f"Unknown data-slot value: {slot_raw}",
                            )
                        )
                elif slot_kind in {"expr", "template"}:
                    if not slot_lits:
                        issues.append(
                            Issue(
                                "WARN",
                                "contract-slot",
                                rel,
                                compute_line_number(text, slot_idx),
                                "data-slot is dynamic and not analyzable.",
                            )
                        )
                    for v in [s for s in slot_lits if isinstance(s, str) and s.strip()]:
                        if v not in slot_vocab:
                            issues.append(
                                Issue(
                                    "WARN",
                                    "contract-slot",
                                    rel,
                                    compute_line_number(text, slot_idx),
                                    f"Unknown data-slot value: {v}",
                                )
                            )
                else:
                    issues.append(
                        Issue(
                            "WARN",
                            "contract-slot",
                            rel,
                            compute_line_number(text, slot_idx),
                            "data-slot is not a string literal.",
                        )
                    )

        # Feature CSS: disallow visual properties (heuristic)
        if path.suffix in {".css", ".scss"}:
            for i, line in enumerate(text.splitlines(), start=1):
                m = re.match(r"\s*([a-zA-Z-]+)\s*:\s*", line)
                if not m:
                    continue
                prop = m.group(1).lower()
                if prop in disallow_props:
                    issues.append(
                        Issue(
                            "ERROR",
                            "feature-css-visual",
                            rel,
                            i,
                            f"Disallowed CSS property in feature layer: {prop}",
                        )
                    )

    return issues


# ----------------------- Approvals (real-time local) -----------------------


def approvals_cfg(cfg: Dict[str, object]) -> Dict[str, object]:
    ap = cfg.get("approvals")
    return ap if isinstance(ap, dict) else {}


def approvals_dir(repo_root: Path, cfg: Dict[str, object]) -> Path:
    ap = approvals_cfg(cfg)
    d = ap.get("approvals_dir")
    return repo_root / str(d) if isinstance(d, str) else repo_root / "ui" / "approvals"


def load_approvals(dir_path: Path) -> List[Dict[str, object]]:
    if not dir_path.exists():
        return []
    out: List[Dict[str, object]] = []
    for p in sorted(dir_path.glob("*.json")):
        try:
            obj = load_json(p)
            obj["__path"] = str(p)
            try:
                st = p.stat()
                obj["__mtime_ns"] = int(getattr(st, "st_mtime_ns", int(st.st_mtime * 1_000_000_000)))
            except Exception:
                obj["__mtime_ns"] = 0
            out.append(obj)
        except Exception:
            continue
    out.sort(
        key=lambda o: (
            str(o.get("approved_at_utc") or ""),
            int(o.get("__mtime_ns") or 0),
            str(o.get("__path") or ""),
        )
    )
    return out


def latest_approval(
    approvals: List[Dict[str, object]], approval_type: str
) -> Optional[Dict[str, object]]:
    matches = [a for a in approvals if str(a.get("approval_type")) == approval_type]
    return matches[-1] if matches else None


def approval_is_expired(approval: Dict[str, object]) -> bool:
    exp = approval.get("expires_at_utc")
    if not exp:
        return False
    return str(exp) < utc_now_iso()  # ISO Zulu sorts lexicographically


def list_ui_ssot_files(repo_root: Path) -> List[Path]:
    """SSOT files that require spec approval when changed."""
    files: List[Path] = []
    base = repo_root / "ui" / "tokens" / "base.json"
    if base.exists():
        files.append(base)
    themes_dir = repo_root / "ui" / "tokens" / "themes"
    if themes_dir.exists():
        files.extend(sorted(themes_dir.glob("*.json")))
    contract = repo_root / "ui" / "contract" / "contract.json"
    if contract.exists():
        files.append(contract)

    # Global UI style entrypoints are part of the UI spec SSOT.
    # They must not drift without explicit spec approval.
    styles_dir = repo_root / "ui" / "styles"
    if styles_dir.exists():
        for fn in ["ui.css", "contract.css", "tokens.css"]:
            p = styles_dir / fn
            if p.exists():
                files.append(p)
    patterns = repo_root / "ui" / "patterns"
    if patterns.exists():
        files.extend(sorted([p for p in patterns.rglob("*.md") if p.is_file()]))
    return files


def compute_spec_fingerprint(repo_root: Path) -> Tuple[str, Dict[str, str]]:
    per: Dict[str, str] = {}
    parts: List[str] = []
    for p in list_ui_ssot_files(repo_root):
        rel = _safe_relpath(repo_root, p)
        dig = sha256_bytes(p.read_bytes())
        per[rel] = dig
        parts.append(f"{rel}:{dig}")
    parts.sort()
    return sha256_text("\n".join(parts)), per


def governance_exception_subset(cfg: Dict[str, object]) -> Dict[str, object]:
    """Subset of governance.json that can weaken enforcement.

    Excludes tool orchestration config, so enabling lint/tests does NOT require exception approval.
    """
    subset: Dict[str, object] = {}
    for k in [
        "tailwind_policy",
        "theme_policy",
        "scan",
        "tailwind",
        "code_rules",
        "feature_css_rules",
    ]:
        if k in cfg:
            subset[k] = cfg[k]

    ap = approvals_cfg(cfg)
    subset["approvals"] = {
        "enabled": ap.get("enabled", True),
        "enforce_spec_approval": ap.get("enforce_spec_approval", True),
        "enforce_exception_approval": ap.get("enforce_exception_approval", True),
        "auto_baseline_if_missing": ap.get("auto_baseline_if_missing", True),
    }
    return subset


def compute_exception_fingerprint(cfg: Dict[str, object]) -> str:
    return sha256_text(
        json.dumps(governance_exception_subset(cfg), sort_keys=True, ensure_ascii=False)
    )


def changed_files(old: Dict[str, str], new: Dict[str, str]) -> List[str]:
    out: List[str] = []
    keys = set(old.keys()) | set(new.keys())
    for k in sorted(keys):
        if old.get(k) != new.get(k):
            out.append(k)
    return out


def ensure_baseline_approvals(
    repo_root: Path, cfg: Dict[str, object]
) -> Tuple[Optional[Path], Optional[Path]]:
    ap = approvals_cfg(cfg)
    if not ap.get("enabled", True):
        return None, None
    if not ap.get("auto_baseline_if_missing", True):
        return None, None

    adir = approvals_dir(repo_root, cfg)
    approvals = load_approvals(adir)
    created_spec: Optional[Path] = None
    created_exc: Optional[Path] = None

    if latest_approval(approvals, "spec_change") is None:
        fp, per = compute_spec_fingerprint(repo_root)
        obj = {
            "approval_version": APPROVAL_VERSION,
            "approval_type": "spec_change",
            "approved_at_utc": utc_now_iso(),
            "approved_by": "system-baseline",
            "fingerprint": fp,
            "files": sorted(list(per.keys())),
            "notes": "Auto-created baseline to avoid bootstrapping deadlock. Subsequent spec changes require explicit approval.",
        }
        created_spec = write_approval_file(adir, obj)

    approvals = load_approvals(adir)
    if latest_approval(approvals, "exception") is None:
        obj = {
            "approval_version": APPROVAL_VERSION,
            "approval_type": "exception",
            "approved_at_utc": utc_now_iso(),
            "approved_by": "system-baseline",
            "fingerprint": compute_exception_fingerprint(cfg),
            # Exception approvals SHOULD have expiry. Baseline is effectively permanent.
            "expires_at_utc": "9999-12-31T00:00:00Z",
            "notes": "Auto-created baseline for governance policy. Any future policy relaxation should use an explicit exception approval with expiry.",
        }
        created_exc = write_approval_file(adir, obj)

    return created_spec, created_exc


def write_approval_file(adir: Path, obj: Dict[str, object]) -> Path:
    adir.mkdir(parents=True, exist_ok=True)
    short = sha256_text(json.dumps(obj, sort_keys=True, ensure_ascii=False))[:8]
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    typ = str(obj.get("approval_type", "approval"))
    path = adir / f"{ts}-{typ}-{short}.json"
    write_json(path, obj)
    return path


def build_approval_request(
    *,
    approval_type: str,
    repo_root: Path,
    previous_fingerprint: Optional[str],
    current_fingerprint: str,
    changed: List[str],
    notes: str,
) -> Dict[str, object]:
    return {
        "approval_version": APPROVAL_VERSION,
        "approval_type": approval_type,
        "requested_at_utc": utc_now_iso(),
        "repo_root": str(repo_root),
        "previous_fingerprint": previous_fingerprint,
        "current_fingerprint": current_fingerprint,
        "changed_files": changed,
        "approved_by": None,
        "approved_at_utc": None,
        "expires_at_utc": None,
        "notes": notes,
        "how_to_approve": "python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py approval-approve --request <path> --approved-by <name> [--expires-at-utc <iso>]",
    }


def write_approval_request(evidence_dir: Path, request: Dict[str, object]) -> Path:
    p = evidence_dir / "approval.request.json"
    write_json(p, request)
    return p


def approval_approve(
    repo_root: Path,
    cfg: Dict[str, object],
    request_path: Path,
    approved_by: str,
    expires_at_utc: Optional[str],
) -> Path:
    req = load_json(request_path)
    typ = str(req.get("approval_type"))
    if typ not in {"spec_change", "exception"}:
        raise ValueError(f"Unsupported approval_type in request: {typ}")

    # Verify the request is still current
    if typ == "spec_change":
        cur_fp, _ = compute_spec_fingerprint(repo_root)
        expected = str(req.get("current_fingerprint"))
        if expected and cur_fp != expected:
            raise ValueError(
                "Spec fingerprint changed since request was created. Re-run the gate to generate a new request."
            )
        obj: Dict[str, object] = {
            "approval_version": APPROVAL_VERSION,
            "approval_type": "spec_change",
            "approved_at_utc": utc_now_iso(),
            "approved_by": approved_by,
            "fingerprint": cur_fp,
            "notes": req.get("notes"),
        }
    else:
        cur_fp = compute_exception_fingerprint(cfg)
        expected = str(req.get("current_fingerprint"))
        if expected and cur_fp != expected:
            raise ValueError(
                "Exception fingerprint changed since request was created. Re-run the gate to generate a new request."
            )
        obj = {
            "approval_version": APPROVAL_VERSION,
            "approval_type": "exception",
            "approved_at_utc": utc_now_iso(),
            "approved_by": approved_by,
            "fingerprint": cur_fp,
            "expires_at_utc": expires_at_utc,
            "notes": req.get("notes"),
        }

    adir = approvals_dir(repo_root, cfg)
    return write_approval_file(adir, obj)


# ----------------------- External tools (one gate entrypoint) -----------------------


def _enabled_mode(v: object) -> str:
    if v is True:
        return "on"
    if v is False or v is None:
        return "off"
    if isinstance(v, str) and v.lower() == "auto":
        return "auto"
    return "auto"


def _has_any(repo_root: Path, rel_paths: List[str]) -> bool:
    for rp in rel_paths:
        if (repo_root / rp).exists():
            return True
    return False


def _tool_ready(tool_name: str, repo_root: Path) -> Tuple[bool, str]:
    """Best-effort "is it configured" checks to avoid spurious failures in auto mode.

    Checks for standalone config files only. ESM (.mjs) is preferred.
    """
    if tool_name == "eslint":
        if _has_any(
            repo_root,
            [
                # ESM flat config (preferred)
                "eslint.config.mjs",
                "eslint.config.js",
                "eslint.config.cjs",
                # Legacy eslintrc (deprecated in ESLint 9+)
                ".eslintrc",
                ".eslintrc.json",
                ".eslintrc.yml",
                ".eslintrc.yaml",
                ".eslintrc.mjs",
                ".eslintrc.cjs",
                ".eslintrc.js",
            ],
        ):
            return True, ""
        return False, "no eslint config (use eslint.config.mjs)"

    if tool_name == "stylelint":
        if _has_any(
            repo_root,
            [
                # ESM config (preferred)
                "stylelint.config.mjs",
                "stylelint.config.js",
                "stylelint.config.cjs",
                # Legacy stylelintrc
                ".stylelintrc",
                ".stylelintrc.json",
                ".stylelintrc.yml",
                ".stylelintrc.yaml",
                ".stylelintrc.mjs",
                ".stylelintrc.cjs",
                ".stylelintrc.js",
            ],
        ):
            return True, ""
        return False, "no stylelint config (use stylelint.config.mjs)"

    if tool_name == "playwright":
        if _has_any(
            repo_root,
            [
                # ESM config (preferred)
                "playwright.config.mjs",
                "playwright.config.ts",
                "playwright.config.js",
                "playwright.config.cjs",
            ],
        ):
            return True, ""
        return False, "no playwright config (use playwright.config.mjs)"

    return True, ""


def run_tool(
    repo_root: Path,
    evidence_dir: Path,
    tool_name: str,
    tool_cfg: Dict[str, object],
    mode: str,
) -> ToolResult:
    if mode == "minimal":
        return ToolResult(
            tool_name, "SKIP", None, None, 0, None, None, None, "minimal mode"
        )

    enabled = _enabled_mode(tool_cfg.get("enabled", "auto"))
    if enabled == "off":
        return ToolResult(
            tool_name, "SKIP", None, None, 0, None, None, None, "disabled"
        )

    cmd = tool_cfg.get("command") if isinstance(tool_cfg.get("command"), str) else None
    report_name = (
        tool_cfg.get("report") if isinstance(tool_cfg.get("report"), str) else None
    )

    if enabled == "auto":
        ready, reason = _tool_ready(tool_name, repo_root)
        if not ready:
            return ToolResult(
                tool_name,
                "SKIP",
                None,
                None,
                0,
                None,
                None,
                None,
                f"auto-skip: {reason}",
            )
    artifacts = (
        tool_cfg.get("artifacts") if isinstance(tool_cfg.get("artifacts"), list) else []
    )

    if not cmd:
        return ToolResult(
            tool_name, "SKIP", None, None, 0, None, None, None, "no command configured"
        )

    tool_dir = evidence_dir / "tools" / tool_name
    tool_dir.mkdir(parents=True, exist_ok=True)
    stdout_p = tool_dir / "stdout.log"
    stderr_p = tool_dir / "stderr.log"

    report_rel: Optional[str] = None
    if report_name:
        report_path = tool_dir / report_name
        cmd = cmd.replace("{out}", str(report_path))
        report_rel = _safe_relpath(evidence_dir, report_path)

    t0 = time.time()
    try:
        proc = subprocess.run(
            cmd, cwd=str(repo_root), shell=True, capture_output=True, text=True
        )
        dur_ms = int((time.time() - t0) * 1000)
        stdout_p.write_text(proc.stdout or "", encoding="utf-8")
        stderr_p.write_text(proc.stderr or "", encoding="utf-8")

        stderr_l = (proc.stderr or "").lower()
        combined_l = (proc.stdout or "" + "\n" + proc.stderr or "").lower()
        missing = (
            proc.returncode == 127
            or "not found" in stderr_l
            or "could not determine executable" in combined_l
        )

        if proc.returncode != 0 and missing and enabled == "auto":
            return ToolResult(
                tool_name,
                "SKIP",
                cmd,
                proc.returncode,
                dur_ms,
                _safe_relpath(evidence_dir, stdout_p),
                _safe_relpath(evidence_dir, stderr_p),
                report_rel,
                "auto-skip: tool unavailable",
            )

        # Copy artifacts (best-effort)
        for art in artifacts:
            if not isinstance(art, str):
                continue
            src = repo_root / art
            if not src.exists():
                continue
            dst = tool_dir / art
            try:
                if src.is_dir():
                    if dst.exists():
                        shutil.rmtree(dst)
                    shutil.copytree(src, dst)
                else:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)
            except Exception:
                pass

        status = "PASS" if proc.returncode == 0 else "FAIL"
        return ToolResult(
            tool_name,
            status,
            cmd,
            proc.returncode,
            dur_ms,
            _safe_relpath(evidence_dir, stdout_p),
            _safe_relpath(evidence_dir, stderr_p),
            report_rel,
            None,
        )
    except Exception as e:
        dur_ms = int((time.time() - t0) * 1000)
        stdout_p.write_text("", encoding="utf-8")
        stderr_p.write_text(str(e), encoding="utf-8")
        if enabled == "auto":
            return ToolResult(
                tool_name,
                "SKIP",
                cmd,
                None,
                dur_ms,
                _safe_relpath(evidence_dir, stdout_p),
                _safe_relpath(evidence_dir, stderr_p),
                report_rel,
                "auto-skip: exception",
            )
        return ToolResult(
            tool_name,
            "FAIL",
            cmd,
            None,
            dur_ms,
            _safe_relpath(evidence_dir, stdout_p),
            _safe_relpath(evidence_dir, stderr_p),
            report_rel,
            "exception",
        )


# ----------------------- Reporting -----------------------


def render_markdown_report(
    summary: Dict[str, object],
    issues: List[Issue],
    tools: List[ToolResult],
    approvals_info: Dict[str, object],
) -> str:
    lines: List[str] = []
    lines.append("# UI Governance Gate Report")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{summary.get('timestamp_utc')}`")
    lines.append(f"- Repo root: `{summary.get('repo_root')}`")
    lines.append(f"- UI spec version: `{summary.get('ui_spec_version')}`")
    lines.append(f"- Tailwind policy: `{summary.get('tailwind_policy')}`")
    lines.append(f"- Gate mode: `{summary.get('mode')}`")
    lines.append("")

    errs = [i for i in issues if i.severity == "ERROR"]
    warns = [i for i in issues if i.severity == "WARN"]
    lines.append("## Result")
    lines.append("")
    lines.append(f"- Errors: **{len(errs)}**")
    lines.append(f"- Warnings: **{len(warns)}**")
    lines.append("")

    lines.append("## Approvals")
    for k in ["spec_status", "exception_status"]:
        if k in approvals_info:
            lines.append(f"- {k}: `{approvals_info.get(k)}`")
    if approvals_info.get("approval_request"):
        lines.append(f"- approval_request: `{approvals_info.get('approval_request')}`")
    lines.append("")

    lines.append("## Tool Runs")
    if not tools:
        lines.append("- (none)")
        lines.append("")
    else:
        lines.append("| Tool | Status | Exit | Duration (ms) | Notes |")
        lines.append("|---|---|---:|---:|---|")
        for tr in tools:
            lines.append(
                f"| `{tr.name}` | **{tr.status}** | {tr.exit_code if tr.exit_code is not None else ''} | {tr.duration_ms} | {tr.notes or ''} |"
            )
        lines.append("")

    def section(title: str, items: List[Issue]) -> None:
        lines.append(f"## {title}")
        if not items:
            lines.append("- (none)")
            lines.append("")
            return
        lines.append("| Severity | Rule | File | Line | Message |")
        lines.append("|---|---|---|---:|---|")
        for it in items[:200]:
            lines.append(
                f"| {it.severity} | `{it.rule}` | `{it.path}` | {it.line or ''} | {it.message} |"
            )
        if len(items) > 200:
            lines.append(f"\n(Truncated: showing first 200 of {len(items)} issues.)")
        lines.append("")

    section("Errors", errs)
    section("Warnings", warns)
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="UI governance gate (baseline + optional tool orchestration)."
    )
    parser.add_argument(
        "cmd",
        choices=["run", "audit", "approval-approve", "approval-status"],
        help="run/audit: gate; approval-* : real-time approval workflow",
    )
    parser.add_argument("--repo-root", default=".", help="Repository root (default: .)")
    parser.add_argument("--run-id", default=None, help="Run id for evidence folder")
    parser.add_argument(
        "--evidence-root", default=".ai/.tmp/ui", help="Evidence root directory"
    )
    parser.add_argument(
        "--mode",
        choices=["minimal", "full"],
        default="full",
        help="minimal: baseline only; full: baseline + external tools",
    )
    parser.add_argument(
        "--fail-on",
        choices=["errors", "warnings"],
        default="errors",
        help="Fail threshold. 'errors' fails only on errors; 'warnings' fails on any issue.",
    )
    parser.add_argument(
        "--request",
        default=None,
        help="Path to approval.request.json for approval-approve",
    )
    parser.add_argument(
        "--approved-by", default=None, help="Approver name for approval-approve"
    )
    parser.add_argument(
        "--expires-at-utc",
        default=None,
        help="Expiry ISO time for exception approvals (recommended)",
    )
    args = parser.parse_args()

    repo_root = find_repo_root(Path(args.repo_root))
    cfg = load_governance_config(repo_root)

    if args.cmd == "approval-status":
        ensure_baseline_approvals(repo_root, cfg)
        adir = approvals_dir(repo_root, cfg)
        approvals = load_approvals(adir)
        spec = latest_approval(approvals, "spec_change")
        exc = latest_approval(approvals, "exception")
        cur_spec_fp, _ = compute_spec_fingerprint(repo_root)
        cur_exc_fp = compute_exception_fingerprint(cfg)
        print(
            json.dumps(
                {
                    "approvals_dir": str(adir),
                    "latest_spec": spec,
                    "latest_exception": exc,
                    "current_spec_fingerprint": cur_spec_fp,
                    "current_exception_fingerprint": cur_exc_fp,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0

    if args.cmd == "approval-approve":
        if not args.request or not args.approved_by:
            print(
                "ERROR: approval-approve requires --request and --approved-by",
                file=os.sys.stderr,
            )
            return 2
        p = Path(args.request)
        if not p.is_absolute():
            p = (Path.cwd() / p).resolve()
        try:
            outp = approval_approve(
                repo_root, cfg, p, args.approved_by, args.expires_at_utc
            )
        except Exception as e:
            print(f"ERROR: {e}", file=os.sys.stderr)
            return 2
        print(str(outp))
        return 0

    # Gate commands
    tokens_path = repo_root / "ui" / "tokens" / "base.json"
    contract_path = repo_root / "ui" / "contract" / "contract.json"
    spec_version_path = repo_root / "ui" / "spec-version.json"

    issues: List[Issue] = []
    tools: List[ToolResult] = []
    approvals_info: Dict[str, object] = {}

    # Determine evidence dir early for gate modes (needed for approval requests + tool outputs)
    run_id = args.run_id or default_run_id()
    evidence_dir = (repo_root / args.evidence_root / run_id).resolve()
    if args.cmd in {"run", "audit"}:
        evidence_dir.mkdir(parents=True, exist_ok=True)
        if args.cmd == "run":
            templ_dir = Path(__file__).resolve().parent.parent / "templates"
            if templ_dir.exists():
                for p in templ_dir.glob("*.md"):
                    dst = evidence_dir / p.name
                    if not dst.exists():
                        shutil.copy2(p, dst)

    # Load + validate tokens
    if not tokens_path.exists():
        issues.append(
            Issue(
                "ERROR",
                "missing-ui-spec",
                _safe_relpath(repo_root, tokens_path),
                None,
                "Missing ui/tokens/base.json. Run ui-system-bootstrap.",
            )
        )
        tokens = {}
    else:
        tokens = load_json(tokens_path)
        for e in validate_tokens(tokens):
            issues.append(
                Issue(
                    "ERROR",
                    "tokens-validate",
                    _safe_relpath(repo_root, tokens_path),
                    None,
                    e,
                )
            )

    # Load + validate contract
    if not contract_path.exists():
        issues.append(
            Issue(
                "ERROR",
                "missing-ui-spec",
                _safe_relpath(repo_root, contract_path),
                None,
                "Missing ui/contract/contract.json. Run ui-system-bootstrap.",
            )
        )
        contract = {}
        contract_errs, roles, role_attr_values, slot_vocab = [], set(), {}, set()
    else:
        contract = load_json(contract_path)
        contract_errs, roles, role_attr_values, slot_vocab = validate_contract(contract)
        for e in contract_errs:
            issues.append(
                Issue(
                    "ERROR",
                    "contract-validate",
                    _safe_relpath(repo_root, contract_path),
                    None,
                    e,
                )
            )

    ui_spec_version = "unknown"
    if spec_version_path.exists():
        try:
            ui_spec_version = str(
                load_json(spec_version_path).get("ui_spec_version") or "unknown"
            )
        except Exception:
            ui_spec_version = "unknown"

    # Approvals checks (real-time local)
    ap_cfg = approvals_cfg(cfg)
    if ap_cfg.get("enabled", True) and tokens_path.exists() and contract_path.exists():
        ensure_baseline_approvals(repo_root, cfg)
        adir = approvals_dir(repo_root, cfg)
        approvals = load_approvals(adir)

        # Spec approval
        if ap_cfg.get("enforce_spec_approval", True):
            cur_fp, cur_map = compute_spec_fingerprint(repo_root)
            latest = latest_approval(approvals, "spec_change")
            prev_fp = str(latest.get("fingerprint")) if latest else None
            if prev_fp and prev_fp != cur_fp:
                # build change list (best-effort)
                # if baseline approval stored per-file list only, we still provide file list (not per-file hash)
                old_map: Dict[str, str] = {}
                if latest and isinstance(latest.get("files"), list):
                    # we can't reconstruct per-file digests from old approval; list what exists now.
                    old_map = {
                        str(k): "" for k in latest.get("files") if isinstance(k, str)
                    }
                ch = (
                    changed_files(old_map, cur_map)
                    if old_map
                    else sorted(list(cur_map.keys()))
                )
                notes = "UI spec (tokens/contract/patterns) changed since last approval. Approve spec_change to proceed."
                req = build_approval_request(
                    approval_type="spec_change",
                    repo_root=repo_root,
                    previous_fingerprint=prev_fp,
                    current_fingerprint=cur_fp,
                    changed=ch,
                    notes=notes,
                )
                if args.cmd == "run":
                    req_path = write_approval_request(evidence_dir, req)
                    approvals_info["approval_request"] = _safe_relpath(
                        repo_root, req_path
                    )
                issues.append(
                    Issue(
                        "ERROR",
                        "spec-approval-required",
                        "ui/",
                        None,
                        "UI spec changed without approval. See approval.request.json and run approval-approve.",
                    )
                )
                approvals_info["spec_status"] = "MISMATCH"
            else:
                approvals_info["spec_status"] = "OK"

        # Exception approval
        if ap_cfg.get("enforce_exception_approval", True):
            cur_exc = compute_exception_fingerprint(cfg)
            latest_exc = latest_approval(approvals, "exception")
            prev_exc = str(latest_exc.get("fingerprint")) if latest_exc else None
            if latest_exc and approval_is_expired(latest_exc):
                prev_exc = None
            if prev_exc and prev_exc != cur_exc:
                notes = "Governance policy changed (may relax enforcement). Approve exception to proceed (expiry recommended)."
                req = build_approval_request(
                    approval_type="exception",
                    repo_root=repo_root,
                    previous_fingerprint=prev_exc,
                    current_fingerprint=cur_exc,
                    changed=["ui/config/governance.json"],
                    notes=notes,
                )
                if args.cmd == "run":
                    req_path = write_approval_request(evidence_dir, req)
                    approvals_info["approval_request"] = _safe_relpath(
                        repo_root, req_path
                    )
                issues.append(
                    Issue(
                        "ERROR",
                        "exception-approval-required",
                        "ui/config/governance.json",
                        None,
                        "Governance policy changed without exception approval. See approval.request.json.",
                    )
                )
                approvals_info["exception_status"] = "MISMATCH"
            else:
                approvals_info["exception_status"] = "OK"

    # Code scan
    include_roots = cfg.get("scan", {}).get("include_roots", [])
    exclude_roots = cfg.get("scan", {}).get("exclude_roots", [])
    if not isinstance(include_roots, list):
        include_roots = []
    if not isinstance(exclude_roots, list):
        exclude_roots = []

    files = list(iter_scan_files(repo_root, include_roots, exclude_roots))
    issues.extend(
        scan_code_and_css(repo_root, files, cfg, roles, role_attr_values, slot_vocab)
    )

    # Tools orchestration (full mode only)
    if args.cmd in {"run", "audit"} and args.mode == "full":
        # Always write tool evidence under the same evidence run directory.
        tool_evidence_dir = evidence_dir
        tool_evidence_dir.mkdir(parents=True, exist_ok=True)

        tools_cfg = cfg.get("tools") if isinstance(cfg.get("tools"), dict) else {}
        for name in ["eslint", "stylelint", "playwright"]:
            tcfg = tools_cfg.get(name) if isinstance(tools_cfg.get(name), dict) else {}
            tr = run_tool(repo_root, tool_evidence_dir, name, tcfg, args.mode)
            tools.append(tr)
            if tr.status == "FAIL":
                issues.append(
                    Issue(
                        "ERROR",
                        "tool-fail",
                        f"tools/{name}",
                        None,
                        f"Tool {name} failed. See evidence logs.",
                    )
                )

    summary = {
        "timestamp_utc": utc_now_iso(),
        "repo_root": str(repo_root),
        "ui_spec_version": ui_spec_version,
        "tailwind_policy": cfg.get("tailwind_policy"),
        "theme_policy": cfg.get("theme_policy"),
        "mode": args.mode,
        "files_scanned": len(files),
        "errors": sum(1 for i in issues if i.severity == "ERROR"),
        "warnings": sum(1 for i in issues if i.severity == "WARN"),
    }

    report_json: Dict[str, object] = {
        "summary": summary,
        "approvals": approvals_info,
        "tools": [t.to_dict() for t in tools],
        "issues": [i.to_dict() for i in issues],
    }

    md = render_markdown_report(summary, issues, tools, approvals_info)

    def should_fail() -> bool:
        if args.fail_on == "warnings":
            return (summary["errors"] + summary["warnings"]) > 0
        return summary["errors"] > 0

    if args.cmd == "audit":
        print(json.dumps(report_json, indent=2, ensure_ascii=False))
        return 0 if not should_fail() else 2

    # run
    (evidence_dir / "ui-gate-report.json").write_text(
        json.dumps(report_json, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (evidence_dir / "ui-gate-report.md").write_text(md, encoding="utf-8")

    return 0 if not should_fail() else 2


if __name__ == "__main__":
    raise SystemExit(main())
