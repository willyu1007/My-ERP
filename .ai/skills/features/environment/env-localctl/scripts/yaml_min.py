"""yaml_min: minimal YAML loader with no external dependencies.

Goals:
- Avoid mandatory PyYAML dependency in Codex/agent environments.
- Support the strict subset of YAML used by these skills:
  - mappings (key: value)
  - nested mappings via indentation
  - lists via "-" items (scalars or mappings)
  - scalars: strings (quoted/unquoted), ints, floats, booleans, null
  - inline list: [a, b]
  - inline map: {k: v}

Determinism note:
- By default, this module uses the minimal parser even if PyYAML is installed.
  This prevents "works on my machine" YAML (PyYAML) from breaking in agent/CI
  environments that only support the strict subset.
- You can opt in to PyYAML parsing by setting `YAML_MIN_USE_PYYAML=1`.

This module intentionally does NOT implement the full YAML spec.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence, Tuple


class YamlError(ValueError):
    pass


def safe_load(text: str) -> Any:
    """Parse YAML into Python objects.

    Deterministic by default:
    - Parses a strict YAML subset implemented in this file.
    - If `YAML_MIN_USE_PYYAML=1` and PyYAML is installed, uses yaml.safe_load.
    """

    use_pyyaml = str(os.getenv("YAML_MIN_USE_PYYAML", "")).strip().lower() in {"1", "true", "yes", "on"}
    if use_pyyaml:
        try:
            import yaml  # type: ignore

            try:
                return yaml.safe_load(text)
            except Exception as e:  # noqa: BLE001
                raise YamlError(f"PyYAML failed to parse YAML: {e}")
        except ModuleNotFoundError:
            # Fall back to minimal parser.
            pass

    return _safe_load_minimal(text)


@dataclass(frozen=True)
class _Line:
    indent: int
    content: str


def _strip_comment(line: str) -> str:
    """Strip YAML comments (# ...) unless they appear inside quotes."""

    in_s = False
    in_d = False
    out: List[str] = []
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == "'" and not in_d:
            in_s = not in_s
            out.append(ch)
            i += 1
            continue
        if ch == '"' and not in_s:
            in_d = not in_d
            out.append(ch)
            i += 1
            continue
        if ch == "#" and not in_s and not in_d:
            break
        out.append(ch)
        i += 1
    return "".join(out)


def _tokenize(text: str) -> List[_Line]:
    lines: List[_Line] = []
    for raw in text.splitlines():
        if "\t" in raw:
            raise YamlError("Tabs are not supported in minimal YAML parser; use spaces.")
        s = raw.rstrip("\n")
        s = _strip_comment(s)
        if not s.strip():
            continue
        indent = len(s) - len(s.lstrip(" "))
        content = s.strip()
        lines.append(_Line(indent=indent, content=content))
    return lines


def _safe_load_minimal(text: str) -> Any:
    lines = _tokenize(text)
    if not lines:
        return None
    obj, idx = _parse_block(lines, 0, lines[0].indent)
    if idx != len(lines):
        # Should not happen; indicates parser bug.
        raise YamlError(f"Unexpected trailing YAML content at line index {idx}.")
    return obj


def _parse_block(lines: Sequence[_Line], idx: int, indent: int) -> Tuple[Any, int]:
    if idx >= len(lines):
        return None, idx

    # Determine block type based on first line at this indent.
    first = lines[idx]
    if first.indent != indent:
        # Caller ensures indent.
        raise YamlError("Internal error: misaligned indent")

    if first.content.startswith("-"):
        return _parse_list(lines, idx, indent)
    return _parse_mapping(lines, idx, indent)


def _parse_mapping(lines: Sequence[_Line], idx: int, indent: int) -> Tuple[Dict[str, Any], int]:
    out: Dict[str, Any] = {}

    while idx < len(lines) and lines[idx].indent == indent:
        line = lines[idx].content
        if line.startswith("-"):
            raise YamlError(f"Mixed list item in mapping block: {line!r}")

        key, sep, rest = line.partition(":")
        if not sep:
            raise YamlError(f"Expected 'key: value' mapping entry, got: {line!r}")
        key = key.strip()
        if not key:
            raise YamlError(f"Empty mapping key in line: {line!r}")

        rest = rest.lstrip(" ")
        idx += 1

        if rest == "":
            # Nested block or null.
            if idx < len(lines) and lines[idx].indent > indent:
                val, idx = _parse_block(lines, idx, lines[idx].indent)
                out[key] = val
            else:
                out[key] = None
        else:
            out[key] = _parse_scalar(rest)

    return out, idx


def _parse_list(lines: Sequence[_Line], idx: int, indent: int) -> Tuple[List[Any], int]:
    out: List[Any] = []

    while idx < len(lines) and lines[idx].indent == indent:
        line = lines[idx].content
        if not line.startswith("-"):
            raise YamlError(f"Expected list item '-', got: {line!r}")

        rest = line[1:].lstrip(" ")
        idx += 1

        if rest == "":
            # Nested item or null.
            if idx < len(lines) and lines[idx].indent > indent:
                val, idx = _parse_block(lines, idx, lines[idx].indent)
                out.append(val)
            else:
                out.append(None)
            continue

        # If it looks like an inline mapping, treat it as start of a mapping item.
        if _looks_like_inline_mapping(rest):
            k, _sep, vrest = rest.partition(":")
            k = k.strip()
            vrest = vrest.lstrip(" ")
            item: Dict[str, Any] = {}
            if vrest == "":
                if idx < len(lines) and lines[idx].indent > indent:
                    val, idx = _parse_block(lines, idx, lines[idx].indent)
                else:
                    val = None
                item[k] = val
            else:
                item[k] = _parse_scalar(vrest)

            # Merge any additional mapping lines for this list item.
            if idx < len(lines) and lines[idx].indent > indent:
                extra, idx = _parse_block(lines, idx, lines[idx].indent)
                if isinstance(extra, dict):
                    for ek, ev in extra.items():
                        item[ek] = ev
                else:
                    raise YamlError("List mapping item has a non-mapping continuation block")

            out.append(item)
            continue

        out.append(_parse_scalar(rest))

    return out, idx


_INLINE_MAP_RE = re.compile(r"^[^\s\[\{\"\']+\s*:\s*.*$")


def _looks_like_inline_mapping(s: str) -> bool:
    # Conservative: treat as mapping only when it clearly matches 'k: ...' and key has no spaces.
    return bool(_INLINE_MAP_RE.match(s))


def _split_top_level(s: str, sep: str) -> List[str]:
    """Split string by sep, ignoring separators inside quotes or nested []/{}."""

    parts: List[str] = []
    buf: List[str] = []
    in_s = False
    in_d = False
    depth = 0

    for ch in s:
        if ch == "'" and not in_d:
            in_s = not in_s
        elif ch == '"' and not in_s:
            in_d = not in_d
        elif not in_s and not in_d:
            if ch in "[{":
                depth += 1
            elif ch in "]}":
                depth = max(0, depth - 1)
            elif ch == sep and depth == 0:
                parts.append("".join(buf))
                buf = []
                continue
        buf.append(ch)

    parts.append("".join(buf))
    return parts


_BOOL_TRUE = {"true", "yes", "on"}
_BOOL_FALSE = {"false", "no", "off"}
_NULL = {"null", "none", "~"}


_NUM_INT_RE = re.compile(r"^[+-]?[0-9]+$")
_NUM_FLOAT_RE = re.compile(r"^[+-]?([0-9]*\.[0-9]+|[0-9]+\.[0-9]*)([eE][+-]?[0-9]+)?$")


def _parse_scalar(s: str) -> Any:
    s = s.strip()
    if s == "":
        return ""

    # Quoted strings
    if (s.startswith("\"") and s.endswith("\"")) or (s.startswith("'") and s.endswith("'")):
        if s[0] == "'":
            # YAML single quotes escape by doubling ''
            inner = s[1:-1].replace("''", "'")
            return inner
        inner = s[1:-1]
        # Minimal escapes for double quotes
        inner = inner.replace(r"\\", "\\").replace(r"\"", '"')
        return inner

    low = s.lower()
    if low in _NULL:
        return None
    if low in _BOOL_TRUE:
        return True
    if low in _BOOL_FALSE:
        return False

    # Inline list
    if s.startswith("[") and s.endswith("]"):
        inner = s[1:-1].strip()
        if not inner:
            return []
        items = [_parse_scalar(p.strip()) for p in _split_top_level(inner, ",")]
        return items

    # Inline map
    if s.startswith("{") and s.endswith("}"):
        inner = s[1:-1].strip()
        if not inner:
            return {}
        out: Dict[str, Any] = {}
        for part in _split_top_level(inner, ","):
            k, sep, v = part.partition(":")
            if not sep:
                raise YamlError(f"Invalid inline map entry: {part!r}")
            out[k.strip()] = _parse_scalar(v.strip())
        return out

    # Numbers
    if _NUM_INT_RE.match(s):
        try:
            return int(s, 10)
        except Exception:
            pass
    if _NUM_FLOAT_RE.match(s):
        try:
            return float(s)
        except Exception:
            pass

    # Fallback: bare string
    return s
