"""Site layout plan (תוכנית העמדה) — the roofs and panels from the app's map quote, drawn to a standard scale.

The app lays the panels out (B.E.E /quotes/map, @bee/quote-engine roof-geometry) and sends them in local
metres: x east, y north of a common origin. This sheet draws the roof outlines, every panel, the keep-clear
obstacles, the roof names with panels / kWp / direction / tilt, the inverter and board positions when known,
a north arrow and a scale bar. One A3 sheet; the scale is the largest standard one the site fits.
"""
from __future__ import annotations

from typing import Optional

from ezdxf.enums import TextEntityAlignment as TA

from .layers import LAYERS
from .model import Design, SiteLayout
from .sheet import TB_H, SheetContext

SCALES = (50, 100, 200, 250, 500, 1000, 2000, 5000)
COMPASS = ("צפון", "צפון-מזרח", "מזרח", "דרום-מזרח", "דרום", "דרום-מערב", "מערב", "צפון-מערב")


def compass(az: float) -> str:
    return COMPASS[round((az % 360) / 45) % 8]


def pick_scale(w_m: float, h_m: float, w_mm: float, h_mm: float) -> int:
    for s in SCALES:
        if w_m * 1000 / s <= w_mm and h_m * 1000 / s <= h_mm:
            return s
    return SCALES[-1]


def _bounds(site: SiteLayout) -> tuple[float, float, float, float]:
    pts = [p for r in site.roofs for p in r.outline] + [(m.x, m.y) for m in site.marks]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _area(ctx: SheetContext) -> tuple[float, float, float, float]:
    """Drawing area: the frame minus the title block strip and a legend column on the left."""
    return ctx.x0 + 70.0, ctx.x1 - 8.0, ctx.y0 + TB_H + 8.0, ctx.y1 - 18.0


def site_scale(ctx: SheetContext, design: Design) -> int:
    x0, y0, x1, y1 = _bounds(design.site)
    ax0, ax1, ay0, ay1 = _area(ctx)
    return pick_scale(x1 - x0, y1 - y0, ax1 - ax0, ay1 - ay0)


def draw_site(ctx: SheetContext, design: Design) -> tuple[list[str], int]:
    site = design.site
    assert site and site.roofs
    x0, y0, x1, y1 = _bounds(site)
    ax0, ax1, ay0, ay1 = _area(ctx)
    scale = site_scale(ctx, design)
    k = 1000.0 / scale                         # mm on paper per metre
    cx, cy = (ax0 + ax1) / 2, (ay0 + ay1) / 2
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2

    def P(p: tuple[float, float]) -> tuple[float, float]:
        return (cx + (p[0] - mx) * k, cy + (p[1] - my) * k)

    def poly(pts: list[tuple[float, float]], layer: str) -> None:
        ctx.msp.add_lwpolyline([P(p) for p in pts], close=True, dxfattribs={"layer": LAYERS[layer].name})

    ctx.text(f"תוכנית העמדה — קנ\"מ 1:{scale}", (ctx.x1 - 4.0, ctx.y1 - 15.0), 3.0, "legend", TA.BOTTOM_RIGHT, bold=True)
    for r in site.roofs:
        poly(r.outline, "pv_roof")
        for o in r.obstacles:
            poly(o, "hatch")
        for pn in r.panels:
            poly(pn, "pv_module")
        # name under the roof, clear of the panels
        lx = (min(p[0] for p in r.outline) + max(p[0] for p in r.outline)) / 2
        x, y = P((lx, min(p[1] for p in r.outline)))
        y -= 5.0
        line2 = f"{len(r.panels) or r.count} פאנלים" + (f" · {r.kwp:g} kWp" if r.kwp else "")
        line3 = " · ".join(filter(None, [compass(r.azimuth) if r.azimuth is not None else "",
                                         f"שיפוע {r.tilt:g}°" if r.tilt is not None else ""]))
        ctx.text(" · ".join(filter(None, [r.name or "גג", line2, line3])), (x, y + 2.0), 2.0, "sld_text", TA.MIDDLE_CENTER)
    for m in site.marks:
        x, y = P((m.x, m.y))
        ctx.rect(x - 2.5, y - 2.5, 5.0, 5.0, "sld_board")
        ctx.text(m.label, (x + 3.5, y), 2.0, "sld_tag", TA.MIDDLE_LEFT)
    # north arrow (y north), top left of the drawing area
    nx, ny = ax0 + 10.0, ay1 - 14.0
    ctx.line((nx, ny - 8.0), (nx, ny + 8.0), "sld_main")
    ctx.line((nx, ny + 8.0), (nx - 2.5, ny + 3.0), "sld_main")
    ctx.line((nx, ny + 8.0), (nx + 2.5, ny + 3.0), "sld_main")
    ctx.text("N", (nx, ny + 10.0), 3.0, "sld_text", TA.BOTTOM_CENTER, bold=True)
    # scale bar: a round length about 50 mm on paper
    nice = next((v for v in (1, 2, 5, 10, 20, 25, 50, 100, 200, 500) if v * k >= 40.0), 500)
    bx, by = ax0 + 4.0, ay0 + 4.0
    for i in range(5):
        seg = nice * k / 5
        ctx.rect(bx + i * seg, by, seg, 1.5, "hatch" if i % 2 else "sld_main")
    ctx.text("0", (bx, by + 2.5), 1.8, "sld_text", TA.BOTTOM_CENTER)
    ctx.text(f"{nice:g} מ'", (bx + nice * k, by + 2.5), 1.8, "sld_text", TA.BOTTOM_CENTER)
    # legend column: one line per roof
    lines = [f"{r.name or 'גג'}: {len(r.panels) or r.count} פאנלים"
             + (f", {r.kwp:g} kWp" if r.kwp else "")
             + (f", {compass(r.azimuth)} {r.azimuth:.0f}°" if r.azimuth is not None else "")
             + (f", שיפוע {r.tilt:g}°" if r.tilt is not None else "") for r in site.roofs]
    total = sum(len(r.panels) or r.count for r in site.roofs)
    lines += ["", f"סה\"כ {total} פאנלים" + (f" · {design.pv.kwp():.2f} kWp" if design.pv else ""),
              "המיקום והפריסה ממפת ההצעה; למדוד בשטח לפני התקנה.", "מיקום ממירים ולוחות — לפי הסימון, אם הוזן."]
    ctx.text("גגות", (ctx.x0 + 66.0, ctx.y1 - 22.0), 2.4, "notes", TA.TOP_RIGHT, bold=True)
    ctx.mtext(lines, (ctx.x0 + 66.0, ctx.y1 - 27.0), 1.8, "notes", width=60.0)
    warnings: list[str] = []
    if scale == SCALES[-1] and ((x1 - x0) * k > ax1 - ax0 or (y1 - y0) * k > ay1 - ay0):
        warnings.append("site plan larger than the sheet at 1:5000")
    return warnings, scale


def site_from_brief(raw: Optional[dict]) -> Optional[SiteLayout]:
    if not raw or not raw.get("roofs"):
        return None
    return SiteLayout.model_validate(raw)
