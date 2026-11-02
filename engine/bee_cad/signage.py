"""Signage (שילוט): the warning / identification labels a multi-source installation must carry, derived
from the model and listed in a signage table (מס', נוסח, מיקום, כלל, סטטוס).

Rules (each produces rows and, where it has a place on a sheet, a red label box on the single-line):

* ``label_panel_fed_by_storage``  — every board that is also fed by a storage / PV system:
  "הלוח מוזן גם ממערכת אגירת אנרגיה" (תקנות החשמל — סימון מקורות; הנחיות מינהל החשמל לאגירה §… — לאימות).
* ``storage_main_switch``        — the main switch of the storage board: "מפסק ראשי של מערכת אגירת אנרגיה".
* ``storage_emergency_switch``   — boards with an emergency stop: "מפסק חירום להפסקת מערכת אגירת אנרגיה".
* ``storage_module_switch``      — every PCS / battery module feeder: "מפסק אגירה PCS0n".
* ``multi_source_note``          — the utility main board: "המתקן מוזן ממספר מקורות — רשת, סולארי ואגירה".
* ``label_every_device_and_panel`` / ``plans_location_labels`` — general rows (no box).

Red boxes are drawn above the board frame on the single-line (white bold text on a red solid fill),
the way the office draws them; what does not fit stays in the table.
"""
from __future__ import annotations

from typing import Literal, Optional

from ezdxf.enums import TextEntityAlignment as TA
from pydantic import BaseModel

from .layers import LAYERS
from .model import Board, Design
from .sheet import SheetContext

SignKind = Literal["warning", "emergency", "main", "module", "info"]


class Sign(BaseModel):
    no: int = 0
    text: str
    location: str = ""
    rule: str = ""
    status: str = "לביצוע"
    kind: SignKind = "warning"
    board: Optional[str] = None       # board id where a box is drawn
    auto: bool = True


STORAGE_KINDS = {"pcs", "bess", "battery"}
GEN_KINDS = {"pcs", "bess", "battery", "inverter", "pv", "generator"}


def _fed_by(design: Design) -> dict[str, set[str]]:
    """board id → set of source kinds that can energise it ('storage', 'pv', 'utility', 'generator')."""
    kinds: dict[str, set[str]] = {b.id: set() for b in design.boards}
    node_kind = {n.id: n.kind for n in design.nodes}
    # direct: feeders to generating nodes energise the board (and everything upstream of it)
    for b in design.boards:
        if b.supply.kind == "utility":
            kinds[b.id].add("utility")
        if b.supply.kind == "generator":
            kinds[b.id].add("generator")
        if b.supply.kind == "inverter":
            kinds[b.id].add("pv")
        for f in b.feeders:
            k = node_kind.get(f.to_node or "", "")
            if k in STORAGE_KINDS:
                kinds[b.id].add("storage")
            elif k in ("inverter", "pv"):
                kinds[b.id].add("pv")
            elif k == "generator":
                kinds[b.id].add("generator")
    # propagate along board→board feeders in both directions (a source on a sub-board back-feeds the main)
    changed = True
    links = [(b.id, f.to_board) for b in design.boards for f in b.feeders if f.to_board]
    links += [(b.supply.from_board, b.id) for b in design.boards if b.supply.kind == "board" and b.supply.from_board]
    while changed:
        changed = False
        for a, c in links:
            if a in kinds and c in kinds:
                for x, y in ((a, c), (c, a)):
                    new = kinds[x] - kinds[y]
                    if new:
                        kinds[y] |= new
                        changed = True
    return kinds


def auto_signage(design: Design) -> list[Sign]:
    out: list[Sign] = []
    fed = _fed_by(design)
    node_kind = {n.id: n.kind for n in design.nodes}
    for b in design.boards:
        srcs = fed.get(b.id, set())
        extra = [s for s in ("storage", "pv", "generator") if s in srcs]
        if extra and not (b.existing and not extra):
            words = {"storage": "מערכת אגירת אנרגיה", "pv": "מערכת סולארית", "generator": "גנרטור"}
            txt = "הלוח מוזן גם מ" + " ומ".join(words[s] for s in extra)
            out.append(Sign(text=txt, location=f"{b.title} ({b.id})", rule="label_panel_fed_by_storage", kind="warning", board=b.id))
        has_storage_feeder = any(node_kind.get(f.to_node or "", "") in STORAGE_KINDS for f in b.feeders)
        if has_storage_feeder and b.incomer:
            out.append(Sign(text="מפסק ראשי של מערכת אגירת אנרגיה", location=f"על {b.incomer.tag} בלוח {b.id}", rule="storage_main_switch",
                            kind="main", board=b.id))
        if b.emergency_stop:
            out.append(Sign(text="מפסק חירום להפסקת מערכת אגירת אנרגיה", location=f"ליד לחצן החירום — לוח {b.id}", rule="storage_emergency_switch",
                            kind="emergency", board=b.id))
        for f in b.feeders:
            if node_kind.get(f.to_node or "", "") in STORAGE_KINDS:
                out.append(Sign(text=f"מפסק אגירה {f.to_node} — {f.device.tag}", location=f"על {f.device.tag} בלוח {b.id}",
                                rule="storage_module_switch", kind="module", board=None))
        if b.supply.kind == "utility" and len(srcs) > 1:
            out.append(Sign(text="המתקן מוזן ממספר מקורות — רשת החשמל, מערכת סולארית ומערכת אגירה. יש לנתק את כל המקורות לפני טיפול",
                            location=f"דלת לוח {b.id} ובארון המונה", rule="multi_source_note", kind="warning", board=None))
    out.append(Sign(text="שם המיתקן ומספר המעגל על כל לוח, מפסק ומעגל", location="כל לוח ומפסק", rule="label_every_device_and_panel", kind="info"))
    out.append(Sign(text="שלטי זיהוי למיקום הארונות, הלוחות והתוואים", location="על הציוד בחצר", rule="plans_location_labels", kind="info"))
    for i, s in enumerate(out, 1):
        s.no = i
    return out


def all_signage(design: Design) -> list[Sign]:
    rows = auto_signage(design)
    for raw in design.signage:
        rows.append(Sign.model_validate({**raw, "auto": False}))
    for i, s in enumerate(rows, 1):
        s.no = i
    return rows


def label_box(ctx: SheetContext, x: float, y: float, w: float, h: float, text: str, h_text: float = 1.8, max_lines: int = 2) -> None:
    """Red solid box with white bold text (wrapped to ``max_lines``)."""
    hatch = ctx.msp.add_hatch(color=1, dxfattribs={"layer": LAYERS["label"].name})
    hatch.paths.add_polyline_path([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], is_closed=True)
    ctx.rect(x, y, w, h, "label")
    max_chars = int((w - 2.0) / (h_text * 0.95))
    words, lines, cur = text.split(), [], ""
    for wd in words:
        if cur and len(cur) + 1 + len(wd) > max_chars:
            lines.append(cur)
            cur = wd
        else:
            cur = f"{cur} {wd}".strip()
    if cur:
        lines.append(cur)
    lines = lines[:max_lines]
    n = len(lines)
    for i, line in enumerate(lines):
        yy = y + h / 2 + (n - 1 - 2 * i) * (h_text * 0.65)
        ctx.text(line, (x + w / 2, yy), h_text, "label_text", TA.MIDDLE_CENTER, bold=True, color=7, true_color=0xFFFFFF)


def draw_board_labels(ctx: SheetContext, design: Design, b: Board, x0: float, x1: float, y: float) -> int:
    """Draw the board's red label boxes above its frame: right-aligned from x1, up to two rows.
    Wide room: 46 mm boxes, two text lines; narrow room (down to 24 mm): one column, three smaller lines.
    Returns the number drawn; the rest stay in the signage table only."""
    signs = [s for s in all_signage(design) if s.board == b.id]
    if not signs:
        return 0
    gap = 2.0
    room = x1 - x0
    if room >= 46.0:
        bw, bh, ht, ml = 46.0, 8.0, 1.8, 2
        if room < len(signs) * 48.0:
            bw = max(36.0, min(46.0, (room - gap) / max(1, (len(signs) + 1) // 2) - gap))
            ht = 1.7 if bw < 44 else 1.8
    elif room >= 24.0:
        bw, bh, ht, ml = room, 10.0, 1.4, 3
    else:
        return 0
    per_row = max(1, int((room + gap) // (bw + gap)))
    n = 0
    for i, sg in enumerate(signs[: per_row * 2]):
        row, col = divmod(i, per_row)
        x = x1 - (col + 1) * bw - col * gap
        if x < x0 - 1e-6:
            break
        label_box(ctx, x, y + row * (bh + gap), bw, bh, sg.text, ht, ml)
        n += 1
    return n
