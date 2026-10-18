"""Sheet audit — the office rule "0/0/0 before delivery".

* ``text_overlaps``        — text on text
* ``text_line_collisions`` — text crossed by circuit lines (main / secondary / bus / PE / N layers)
* ``text_outside``         — text outside the sheet's drawing area

Bounding boxes come from ezdxf's own text measurement (font aware, rotation aware), so the
audit sees what AutoCAD will plot. Single-character symbols (+ − = ~) are exempt, like in the
office generator. The audit is necessary, not sufficient: every sheet is also looked at.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ezdxf import bbox
from ezdxf.document import Drawing
from ezdxf.math import BoundingBox2d, Vec2

from .layers import LAYERS
from .sheet import A3_H, A3_W, GRID, MARGIN, MARGIN_L

LINE_LAYERS = {LAYERS[k].name for k in ("sld_main", "sld_sec", "sld_bus", "pe", "n", "panel_encl", "panel_rail", "panel_dev")}
TEXT_CLEARANCE = 0.4   # mm shrink of each text box before testing (ezdxf boxes are generous)


@dataclass
class Collision:
    kind: str
    a: str
    b: str
    at: tuple[float, float]


@dataclass
class AuditReport:
    sheet: str
    text_overlaps: list[Collision] = field(default_factory=list)
    text_line_collisions: list[Collision] = field(default_factory=list)
    text_outside: list[Collision] = field(default_factory=list)

    @property
    def counts(self) -> tuple[int, int, int]:
        return len(self.text_overlaps), len(self.text_line_collisions), len(self.text_outside)

    @property
    def clean(self) -> bool:
        return self.counts == (0, 0, 0)

    def summary(self) -> str:
        t, l, o = self.counts
        return f"AUDIT {self.sheet}: text/text={t} text/line={l} outside={o}"


def _text_boxes(doc: Drawing, x0: float, x1: float) -> list[tuple[BoundingBox2d, str]]:
    out = []
    msp = doc.modelspace()
    for e in msp:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        s = e.dxf.text if e.dxftype() == "TEXT" else e.text
        if not s or (len(s.strip()) == 1 and s.strip() in "+-=~×"):
            continue
        try:
            b = bbox.extents([e], fast=False)
        except Exception:
            continue
        if not b.has_data:
            continue
        bx = BoundingBox2d([Vec2(b.extmin.x, b.extmin.y), Vec2(b.extmax.x, b.extmax.y)])
        if bx.extmax.x < x0 or bx.extmin.x > x1:
            continue
        out.append((bx, s))
    return out


def _shrink(b: BoundingBox2d, d: float) -> BoundingBox2d:
    return BoundingBox2d([Vec2(b.extmin.x + d, b.extmin.y + d), Vec2(b.extmax.x - d, b.extmax.y - d)])


def _segments(doc: Drawing, x0: float, x1: float) -> list[tuple[Vec2, Vec2, str]]:
    segs = []
    msp = doc.modelspace()
    for e in msp:
        if e.dxf.layer not in LINE_LAYERS:
            continue
        pts: list[Vec2] = []
        if e.dxftype() == "LINE":
            pts = [Vec2(e.dxf.start), Vec2(e.dxf.end)]
        elif e.dxftype() == "LWPOLYLINE":
            pts = [Vec2(p[0], p[1]) for p in e.get_points()]
            if e.closed and pts:
                pts.append(pts[0])
        for a, b in zip(pts, pts[1:]):
            if max(a.x, b.x) < x0 or min(a.x, b.x) > x1:
                continue
            segs.append((a, b, e.dxf.layer))
    return segs


def _seg_hits_box(a: Vec2, b: Vec2, box: BoundingBox2d) -> bool:
    """Liang–Barsky clip test of segment a-b against an axis-aligned box."""
    x0, y0, x1, y1 = box.extmin.x, box.extmin.y, box.extmax.x, box.extmax.y
    dx, dy = b.x - a.x, b.y - a.y
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, a.x - x0), (dx, x1 - a.x), (-dy, a.y - y0), (dy, y1 - a.y)):
        if p == 0:
            if q < 0:
                return False
            continue
        t = q / p
        if p < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if t0 > t1:
            return False
    return True


def audit_sheet(doc: Drawing, sheet_index: int = 0, sheet: str = "") -> AuditReport:
    ox = (A3_W + 30.0) * sheet_index
    x0, x1 = ox, ox + A3_W
    rep = AuditReport(sheet or f"sheet {sheet_index + 1}")
    boxes = _text_boxes(doc, x0, x1)
    inner = BoundingBox2d([Vec2(ox + MARGIN_L + GRID, MARGIN + GRID), Vec2(ox + A3_W - MARGIN - GRID, A3_H - MARGIN - GRID)])
    for i, (bi, si) in enumerate(boxes):
        bi_s = _shrink(bi, TEXT_CLEARANCE)
        if not (inner.inside(bi.extmin) and inner.inside(bi.extmax)):
            # grid letters/numbers live in the strips on purpose
            if len(si.strip()) > 2:
                rep.text_outside.append(Collision("outside", si, "", (bi.extmin.x - ox, bi.extmin.y)))
        for bj, sj in boxes[i + 1:]:
            if bi_s.has_overlap(_shrink(bj, TEXT_CLEARANCE)):
                rep.text_overlaps.append(Collision("text/text", si, sj, (bi.extmin.x - ox, bi.extmin.y)))
    segs = _segments(doc, x0, x1)
    for bi, si in boxes:
        bi_s = _shrink(bi, TEXT_CLEARANCE)
        for a, b, layer in segs:
            if _seg_hits_box(a, b, bi_s):
                rep.text_line_collisions.append(Collision("text/line", si, layer, (bi.extmin.x - ox, bi.extmin.y)))
                break
    return rep
