"""Hebrew text for DXF.

Two modes, chosen per drawing:

* ``unicode`` — text is stored in logical order (UTF-8, DXF R2018). AutoCAD 2010+ with a
  TrueType font that has Hebrew glyphs (Arial, David, Tahoma) renders it right-to-left.
  This is the default and the right choice for Revit / modern AutoCAD.
* ``shx`` — legacy Israeli SHX fonts (HEBREW.SHX, SIVAN, NARKIS …) draw glyphs left-to-right,
  so Hebrew runs must be stored in *visual* order (reversed). Numbers and Latin stay as they
  are. This matches how the office's older DWG sets and the constructor's gcad files are
  typed. The SHX fonts live in ``engine/assets/fonts/shx``.

Both modes are verified against AutoCAD on the office computer, never assumed.
"""
from __future__ import annotations

import re
from typing import Literal

TextMode = Literal["unicode", "shx"]

_HEB = re.compile(r"[֐-׿]")


def has_hebrew(s: str) -> bool:
    return bool(_HEB.search(s))


def to_visual(s: str) -> str:
    """Logical → visual order for SHX fonts (bidi algorithm, base direction RTL)."""
    try:
        from bidi.algorithm import get_display  # type: ignore
    except Exception:  # pragma: no cover - fallback when python-bidi missing
        return _naive_reverse(s)
    return get_display(s, base_dir="R" if has_hebrew(s) else "L")


def _naive_reverse(s: str) -> str:
    """Reverse Hebrew runs only; keep digits / Latin runs intact."""
    out: list[str] = []
    for run in re.findall(r"[֐-׿\s\"'()\-–—]+|[^֐-׿]+", s):
        out.append(run[::-1] if has_hebrew(run) else run)
    return "".join(reversed(out)) if has_hebrew(s) else s


def encode(s: str, mode: TextMode) -> str:
    return to_visual(s) if mode == "shx" else s


def split_bidi_safe(label: str) -> list[str]:
    """The office rule: never mix Hebrew with Latin / numbers in one string where it can garble.

    Splits "RCD-A 4P 40A 30mA Type A" style labels from Hebrew descriptions into separate
    lines so each line is single-script.
    """
    parts = re.split(r"\s+[—–-]\s+", label)
    lines: list[str] = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if has_hebrew(p) and re.search(r"[A-Za-z0-9]{3,}", p):
            heb = " ".join(w for w in p.split() if has_hebrew(w))
            lat = " ".join(w for w in p.split() if not has_hebrew(w))
            lines.extend([x for x in (heb, lat) if x])
        else:
            lines.append(p)
    return lines
