"""Calculation sheet (דף חישובים) — one row per circuit with the numbers behind every rating.

The same numbers the rule checks use: design current, cable capacity at the installation
method, voltage drop of the circuit and from the meter, minimum fault current at the far end
against the magnetic trip. The sheet ends the drawing set, as the calculation page of a permit pack.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ezdxf.enums import TextEntityAlignment as TA

from .calc import (TRIP_MULTIPLE, ampacity, design_current, ik1_min_a, ik3_max_ka, let_through_i2t,
                   loaded_conductors, node_kw, parse_cable, source_impedance, voltage_drop_pct, withstand_i2t)
from .checks import DU_LIMIT_LIGHTING_PCT, DU_LIMIT_PCT, Finding, _method, check
from .model import Board, Circuit, Design
from .pv import dc_rows
from .sheet import TB_H, SheetContext

ROW_H = 4.4


@dataclass
class CalcRow:
    board: str
    tag: str
    load: str
    device: str
    cable: str
    method: str
    ib: Optional[float]
    iz: Optional[float]
    du: Optional[float]
    du_total: Optional[float]
    du_limit: float
    ik1: Optional[float]
    ia: Optional[float]
    i2t_ok: Optional[bool]      # k²S² ≥ the device's let-through at Ik max of the board; None = not checked
    ok: bool


def _row(b: Board, c: Circuit, zs: float, up: list, up_du: float, kw: Optional[float],
         ik_board: Optional[float] = None) -> CalcRow:
    d = c.device
    three = c.phase == "L1-3" or d.poles >= 3
    method = _method(c)
    ib = design_current(c, kw)
    iz = du = ik1 = ia = i2t_ok = None
    if c.cable:
        spec = parse_cable(c.cable.designation)
        if spec:
            iz = ampacity(spec, method, loaded_conductors(c.phase, d.poles), c.cable.ambient_c, c.cable.grouped)
            i2t = let_through_i2t(d, ik_board) if ik_board else None
            if i2t is not None:
                i2t_ok = i2t <= withstand_i2t(spec)
        if ib and c.cable.length_m:
            du = voltage_drop_pct(c.cable, ib, three, c.cos_phi)
        if c.kind == "final" and d.kind in ("mcb", "rcbo") and d.rating_a and b.supply.kind in ("utility", "transformer"):
            mult = TRIP_MULTIPLE.get((d.curve or "C").upper()[:1])
            ik1 = ik1_min_a(zs, up + [c.cable])
            ia = mult * d.rating_a if mult else None
    final = c.kind == "final"
    total = du + up_du if du is not None and final else du
    limit = DU_LIMIT_LIGHTING_PCT if "תאורה" in c.load else DU_LIMIT_PCT
    ok = not (iz is not None and d.rating_a and d.rating_a > iz) and not (total is not None and total > limit) \
        and not (ib and d.rating_a and ib > d.rating_a + 1e-9)
    if c.cable and c.cable.grouped and c.cable.grouped > 1:
        method = f"{method}×{c.cable.grouped}"
    return CalcRow(b.id, c.tag, c.load or (c.to_node or c.to_board or ""), " ".join(d.label_lines()[:2]),
                   c.cable.designation if c.cable else "—", method, ib, iz, du, total, limit, ik1, ia, i2t_ok, ok)


def calc_rows(design: Design) -> list[CalcRow]:
    work = design.model_copy(deep=True)
    check(work)                                   # fills the supply-cable drop the rows build on
    nodes = {n.id: n for n in work.nodes}
    rows: list[CalcRow] = []
    for b in work.boards:
        zs = source_impedance(b.supply.ik_ka) if b.supply.ik_ka else 0.0
        up = [b.supply.cable] if b.supply.cable and b.supply.cable.length_m else []
        up_du = (b.supply.cable.du_pct or 0.0) if b.supply.cable else 0.0
        ikb = ik3_max_ka(zs, up) if b.supply.ik_ka and b.supply.kind in ("utility", "transformer") else None
        for c in b.all_circuits():
            node = nodes.get(c.to_node or "")
            rows.append(_row(b, c, zs, up, up_du, node_kw(node.rating) if node else None, ikb))
    return rows


def _f(v: Optional[float], fmt: str = "{:.0f}") -> str:
    return fmt.format(v) if v is not None else "-"


COLS = [("לוח", 12.0), ("תג", 13.0), ("צרכן", 52.0), ("הגנה", 20.0), ("כבל", 26.0), ("שיטה", 10.0),
        ("Ib [A]", 13.0), ("Iz [A]", 13.0), ("ΔU מעגל %", 17.0), ("ΔU מצטבר %", 18.0), ("גבול %", 12.0),
        ("Ik1 min [A]", 17.0), ("Ia [A]", 13.0), ("I²t", 10.0), ("תקין", 11.0)]


def rows_per_sheet(ctx: SheetContext) -> int:
    return int((ctx.y1 - 16.0 - (ctx.y0 + TB_H + 46.0)) / ROW_H) - 1


def _table(ctx: SheetContext, title: str, spec: list[tuple[str, float]], rows: list[list[str]], x_right: float,
           y_top: float, width: float, wide: str = "") -> float:
    """A titled grid stretched to ``width``; returns its height. Column ``wide`` is right-aligned (Hebrew text)."""
    k = width / sum(c[1] for c in spec)
    cols = [(n, w * k) for n, w in spec]
    ctx.text(title, (x_right, y_top + 1.0), 3.0, "legend", TA.BOTTOM_RIGHT, bold=True)
    h = ROW_H * (len(rows) + 1)
    ctx.rect(x_right - width, y_top - h, width, h, "legend")
    xx = x_right
    for name, cw in cols:
        ctx.text(name, (xx - cw / 2, y_top - ROW_H / 2), 1.7, "legend", TA.MIDDLE_CENTER, bold=True)
        xx -= cw
        ctx.line((xx, y_top - h), (xx, y_top), "legend")
    for i, vals in enumerate(rows):
        yy = y_top - ROW_H * (i + 1.5)
        ctx.line((x_right - width, yy + ROW_H / 2), (x_right, yy + ROW_H / 2), "legend")
        xx = x_right
        for (name, cw), v in zip(cols, vals):
            al = TA.MIDDLE_RIGHT if name == wide else TA.MIDDLE_CENTER
            pos = (xx - 1.5, yy) if al == TA.MIDDLE_RIGHT else (xx - cw / 2, yy)
            ctx.text(v, pos, 1.6, "legend", al)
            xx -= cw
    return h


DC_COLS = [("ממיר", 10.0), ("MPPT", 10.0), ("חזית", 22.0), ("מחרוזות", 13.0), ("פאנלים", 12.0),
           ("Voc קר [V]", 16.0), ("Vmp קר [V]", 16.0), ("Vmp חם [V]", 16.0), ("I MPPT [A]", 15.0),
           ("נתיך gPV", 14.0), ("כבל [ממ\"ר]", 14.0), ("Iz / נדרש [A]", 20.0), ("ΔU DC %", 13.0)]


def draw_calc(ctx: SheetContext, design: Design, rows: list[CalcRow], first: bool, findings: list[Finding]) -> list[str]:
    tw = ctx.x1 - ctx.x0 - 8.0
    x_right = ctx.x1 - 4.0
    y_top = ctx.y1 - 16.0
    vals = []
    for r in rows:
        ik_ok = r.ik1 is None or r.ia is None or r.ik1 >= r.ia
        vals.append([r.board, r.tag, r.load[:48], r.device, r.cable, r.method, _f(r.ib, "{:.1f}"), _f(r.iz, "{:g}"),
                     _f(r.du, "{:.2f}"), _f(r.du_total, "{:.2f}"), f"{r.du_limit:g}", _f(r.ik1), _f(r.ia),
                     "-" if r.i2t_ok is None else ("✓" if r.i2t_ok else "✗"),
                     "כן" if r.ok and ik_ok and r.i2t_ok is not False else "לבדוק"])
    h = _table(ctx, "דף חישובים — מעגלים ויציאות", COLS, vals, x_right, y_top, tw, wide="צרכן")
    if first and design.pv and design.pv.strings:
        y_top -= h + 10.0
        dc = [[str(r.inverter), str(r.mppt), r.face, str(r.strings), str(r.modules), f"{r.voc_cold:.0f}",
               f"{r.vmp_cold:.0f}", f"{r.vmp_hot:.0f}", f"{r.i_mppt:.1f}", _f(r.fuse_a, "{:g}A"), f"{r.cable_mm2:g}",
               f"{_f(r.cable_iz, '{:g}')} / {r.cable_req_a:g}", _f(r.du_pct, "{:.2f}")] for r in dc_rows(design.pv)]
        h = _table(ctx, "צד DC — מחרוזות לכל כניסת MPPT (IEC 62548)", DC_COLS, dc, x_right, y_top, tw, wide="חזית")
    if not first:
        return []
    # assumptions and findings under the table
    y = y_top - h - 8.0
    ik = ", ".join(f"{b.id} {b.supply.ik_ka:g}kA" for b in design.boards if b.supply.ik_ka) or "לא הוזן"
    basis = [
        "Ib: מ-load_kw או מהספק הממיר (cos φ = 1), אחרת דירוג המפסק.",
        "Iz: IEC 60364-5-52 נספח B, נחושת, 30°C באוויר / 20°C בקרקע או לפי ambient_c, כפול מקדם קיבוץ (B.52.17/19). "
        "B1 = מוליכים בצינור, C = כבל על קיר, E = כבל על סולם/באוויר, D1 = כבל בצינור בקרקע; ×n = n מעגלים יחד.",
        "Ib ≤ In ≤ Iz (IEC 60364-4-43 433.1). I²t: k²S² ≥ אנרגיית המעבר של המפסק בזרם הקצר המקסימלי בלוח "
        "(k = 115 PVC / 143 XLPE; מפסק זעיר EN 60898-1 class 3, מפסק יצוק Ik²·0.1s).",
        f"ΔU: ρ = 0.0225 Ω·ממ\"ר/מ' (אלומיניום 0.036), λ = 0.08 mΩ/מ' לפי cos φ; מצטבר = מהמונה. גבול {DU_LIMIT_LIGHTING_PCT:g}% תאורה, {DU_LIMIT_PCT:g}% אחר (G.52.1).",
        f"Ik1 min: לולאת תקלה בקצה המעגל, c = 0.95, ρ = 1.5 × ρ20; זרם קצר בחיבור: {ik}. Ia = סף מגנטי עליון (B 5In, C 10In, D 20In).",
    ]
    if design.pv:
        basis.append("DC: Voc ב-−3°C מול מתח DC מרבי, Vmp בקור ובתא חם 70°C מול תחום ה-MPPT; נתיך gPV כש-(Np−1)·1.25·Isc "
                     "גדול מזרם החזרה של הפאנל, 1.5·Isc ≤ In ≤ 2.4·Isc; כבל H1Z2Z2-K לפי EN 50618 (60°C); ΔU DC ב-Imp, 70°C.")
    basis.append("הטבלאות והגבולות הם ברירות מחדל הנדסיות לפי IEC, לא דרישת חוק; המהנדס המתכנן מאשר את שיטת ההתקנה והערכים.")
    ctx.text("הנחות החישוב", (x_right, y), 2.2, "notes", TA.TOP_RIGHT, bold=True)
    ctx.mtext(basis, (x_right, y - 3.5), 1.6, "notes", width=tw / 2 - 6.0)
    serious = [f for f in findings if f.level != "info"][:8]
    xm = x_right - tw / 2
    ctx.text("ממצאי בדיקה", (xm, y), 2.2, "notes", TA.TOP_RIGHT, bold=True)
    lines = [f"{'שגיאה' if f.level == 'error' else 'אזהרה'} · {f.where}: {f.message}" for f in serious] or \
        ["אין שגיאות ואין אזהרות."]
    ctx.mtext(lines, (xm, y - 3.5), 1.6, "notes", width=tw / 2 - 6.0)
    return []
