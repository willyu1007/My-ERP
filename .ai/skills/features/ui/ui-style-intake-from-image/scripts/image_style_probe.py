#!/usr/bin/env python3
"""image_style_probe.py

Extract lightweight, deterministic style signals from an image (typically a UI screenshot).

Outputs:
- JSON by default
- If --out ends with .md, also emits a concise markdown report embedding the JSON

Notes:
- No OCR
- No semantic UI inference (the LLM should do that)
- Uses Pillow (PIL). If Pillow is unavailable, the script emits a structured JSON
  payload with ok=false and exits 0 so the calling skill can continue.

This probe is intended to support the "Style Intake Protocol":
image -> palette/metrics -> LLM semantic mapping -> token/theme proposal.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

try:
    from PIL import Image
    PIL_IMPORT_ERROR = None
except Exception as e:  # pragma: no cover
    Image = None  # type: ignore[assignment]
    PIL_IMPORT_ERROR = str(e)


def _now_utc_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _clamp01(x: float) -> float:
    return 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)


def _srgb_to_linear(c: float) -> float:
    c = c / 255.0
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def _relative_luminance(rgb: Tuple[int, int, int]) -> float:
    r, g, b = rgb
    rl = _srgb_to_linear(r)
    gl = _srgb_to_linear(g)
    bl = _srgb_to_linear(b)
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl


def _contrast_ratio(rgb1: Tuple[int, int, int], rgb2: Tuple[int, int, int]) -> float:
    l1 = _relative_luminance(rgb1)
    l2 = _relative_luminance(rgb2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def _rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    r, g, b = rgb
    return f"#{r:02x}{g:02x}{b:02x}"


def _parse_hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join([c * 2 for c in h])
    if len(h) != 6:
        raise ValueError(f"Invalid hex color: {hex_color}")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


@dataclass
class PaletteColor:
    hex: str
    rgb: Tuple[int, int, int]
    count: int


def _dominant_palette(img: Image.Image, colors: int) -> List[PaletteColor]:
    # Convert to RGB and downscale to make histogram stable and fast.
    img_small = img.convert("RGB")
    img_small.thumbnail((256, 256))

    # Quantize to N colors.
    quant = img_small.convert("P", palette=Image.Palette.ADAPTIVE, colors=colors)
    palette_raw = quant.getpalette() or []
    # histogram over palette indices
    hist = quant.histogram() or []

    # Build palette entries
    entries: List[PaletteColor] = []
    for idx, count in enumerate(hist[:colors]):
        if count <= 0:
            continue
        base = idx * 3
        if base + 2 >= len(palette_raw):
            continue
        rgb = (palette_raw[base], palette_raw[base + 1], palette_raw[base + 2])
        entries.append(PaletteColor(hex=_rgb_to_hex(rgb), rgb=rgb, count=int(count)))

    # Sort by frequency
    entries.sort(key=lambda e: e.count, reverse=True)
    return entries


def _brightness_stats(img: Image.Image, sample_size: int = 4000) -> Dict[str, Any]:
    img_rgb = img.convert("RGB")
    img_rgb.thumbnail((512, 512))
    px = list(img_rgb.getdata())
    if not px:
        return {"count": 0}

    # Uniform sampling
    step = max(1, len(px) // sample_size)
    sampled = px[::step]

    lums = [_relative_luminance((r, g, b)) for (r, g, b) in sampled]
    lums_sorted = sorted(lums)

    def pct(p: float) -> float:
        if not lums_sorted:
            return 0.0
        i = int(_clamp01(p) * (len(lums_sorted) - 1))
        return float(lums_sorted[i])

    avg = float(statistics.mean(lums)) if lums else 0.0
    med = float(statistics.median(lums)) if lums else 0.0

    return {
        "count": len(sampled),
        "avg": round(avg, 4),
        "median": round(med, 4),
        "p10": round(pct(0.10), 4),
        "p90": round(pct(0.90), 4),
        "is_dark": avg < 0.35,
    }


def _render_markdown(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Image Style Probe")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{report.get('timestamp_utc')}`")
    lines.append(f"- Image: `{report.get('image_path')}`")
    lines.append(f"- Size: `{report.get('width')}x{report.get('height')}`")
    lines.append("")

    palette = report.get("palette", [])
    lines.append("## Dominant palette")
    if not palette:
        lines.append("- (no palette extracted)")
    else:
        lines.append("| Rank | Color | Count |")
        lines.append("|---:|---|---:|")
        for i, c in enumerate(palette, start=1):
            lines.append(f"| {i} | `{c.get('hex')}` | {c.get('count')} |")
    lines.append("")

    lines.append("## Brightness summary")
    bs = report.get("brightness", {})
    for k in ["avg", "median", "p10", "p90", "is_dark"]:
        if k in bs:
            lines.append(f"- {k}: `{bs[k]}`")
    lines.append("")

    lines.append("## Raw JSON")
    lines.append("```json")
    lines.append(json.dumps(report, indent=2, sort_keys=True))
    lines.append("```")
    return "\n".join(lines) + "\n"


def _render_missing_dependency_markdown(payload: Dict[str, Any]) -> str:
    return (
        "# Image Style Probe\n\n"
        "## Status\n\n"
        "- ok: `false`\n"
        "- error: `missing_dependency`\n"
        "- dependency: `Pillow`\n\n"
        "## Detail\n\n"
        f"- detail: `{payload.get('detail', '')}`\n"
        f"- hint: `{payload.get('hint', '')}`\n\n"
        "## Raw JSON\n\n"
        "```json\n"
        f"{json.dumps(payload, indent=2, sort_keys=True)}\n"
        "```\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract dominant palette + brightness signals from an image.")
    parser.add_argument("image", help="Path to an image file (png/jpg/webp)")
    parser.add_argument("--colors", type=int, default=8, help="Number of dominant colors to extract")
    parser.add_argument("--out", default=None, help="Output path (.json or .md). If omitted, prints JSON.")
    args = parser.parse_args()

    if Image is None:
        payload = {
            "ok": False,
            "error": "missing_dependency",
            "dependency": "Pillow",
            "detail": PIL_IMPORT_ERROR or "Unknown import error",
            "hint": "Install with: pip install pillow",
        }
        out = args.out
        if out:
            os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
            if out.lower().endswith(".md"):
                with open(out, "w", encoding="utf-8") as f:
                    f.write(_render_missing_dependency_markdown(payload))
            else:
                with open(out, "w", encoding="utf-8") as f:
                    f.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")
            print(out)
            return 0

        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    image_path = args.image
    if not os.path.isfile(image_path):
        print(f"ERROR: File not found: {image_path}", file=sys.stderr)
        return 1

    try:
        img = Image.open(image_path)
        img.load()
    except Exception as e:
        print(f"ERROR: Failed to open image: {e}", file=sys.stderr)
        return 1

    palette_entries = _dominant_palette(img, max(2, min(args.colors, 32)))
    palette = [{"hex": p.hex, "count": p.count} for p in palette_entries]

    bg_rgb: Tuple[int, int, int] | None = None
    if palette_entries:
        bg_rgb = palette_entries[0].rgb

    # Estimate a plausible "text" color as the darkest among the palette.
    text_rgb: Tuple[int, int, int] | None = None
    if palette_entries:
        darkest = min(palette_entries, key=lambda p: _relative_luminance(p.rgb))
        text_rgb = darkest.rgb

    contrast = None
    if bg_rgb is not None and text_rgb is not None:
        contrast = round(_contrast_ratio(bg_rgb, text_rgb), 3)

    report: Dict[str, Any] = {
        "timestamp_utc": _now_utc_iso(),
        "image_path": os.path.abspath(image_path),
        "width": img.width,
        "height": img.height,
        "palette": palette,
        "estimated": {
            "background": _rgb_to_hex(bg_rgb) if bg_rgb else None,
            "text_candidate": _rgb_to_hex(text_rgb) if text_rgb else None,
            "contrast_ratio_bg_text_candidate": contrast,
        },
        "brightness": _brightness_stats(img),
    }

    out = args.out
    if out:
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        if out.lower().endswith(".md"):
            with open(out, "w", encoding="utf-8") as f:
                f.write(_render_markdown(report))
        else:
            with open(out, "w", encoding="utf-8") as f:
                f.write(json.dumps(report, indent=2, sort_keys=True) + "\n")
        print(out)
        return 0

    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
