"""Self-check (בדיקה עצמית) of a design and of the sheets drawn from it.

Two layers:

* **Model checks** — electrical and editorial rules on the ``Design`` itself: every board has an
  incomer, every final circuit a cable, breaker ≤ cable ampacity (IEC 60364-5-52 table B.52.4,
  PVC/XLPE copper, reference method C — a *screening* value, not the project calculation), sockets
  behind a 30 mA RCD, phase balance, unique tags, feeder targets exist, title block filled, notes
  carry a source, assumptions carry a "לאימות" item.
* **Sheet checks** — on the built document: text overlap audit 0/0/0, no text below 1.4 mm, the set
  matches ``plan_sheets``.

Findings carry a severity: ``error`` blocks a "לביצוע" issue, ``warn`` is shown on the QA report,
``info`` is bookkeeping. The report is written as JSON and Markdown next to the outputs and is
included in the Hive job record.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from ezdxf.document import Drawing

from .model import Board, Circuit, Design

MIN_TEXT_H = 1.2

# IEC 60364-5-52 (ed. 3.0, 2009) current-carrying capacities, reference method C (clipped direct / on a wall),
# ambient 30 °C, in amperes. Two-loaded-conductor tables B.52.2 (PVC 70 °C) / B.52.3 (XLPE 90 °C) for 1P circuits,
# three-loaded-conductor tables B.52.4 (PVC) / B.52.5 (XLPE) for 3P circuits. Screening values only — the project
# calculation (eplan CalcReport) with the real method, grouping and temperature factors wins when present.
AMPACITY = {
    ("cu", "pvc", 1): {1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 112, 35: 138, 50: 168, 70: 213, 95: 258, 120: 299,
                       150: 344, 185: 392, 240: 461, 300: 530},
    ("cu", "pvc", 3): {1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 96, 35: 119, 50: 144, 70: 184, 95: 223, 120: 259,
                       150: 299, 185: 341, 240: 403, 300: 464},
    ("cu", "xlpe", 1): {1.5: 24, 2.5: 33, 4: 45, 6: 58, 10: 80, 16: 107, 25: 138, 35: 171, 50: 209, 70: 269, 95: 328, 120: 382,
                        150: 441, 185: 506, 240: 599, 300: 693},
    ("cu", "xlpe", 3): {1.5: 23, 2.5: 30, 4: 40, 6: 52, 10: 71, 16: 96, 25: 119, 35: 147, 50: 179, 70: 229, 95: 278, 120: 322,
                        150: 371, 185: 424, 240: 500, 300: 576},
    # aluminium, XLPE, method C (B.52.3 / B.52.5 Al columns) — VERIFY against the standard before relying on them
    ("al", "xlpe", 1): {16: 84, 25: 107, 35: 133, 50: 161, 70: 207, 95: 251, 120: 293, 150: 338, 185: 386, 240: 456, 300: 527},
    ("al", "xlpe", 3): {16: 73, 25: 93, 35: 115, 50: 140, 70: 179, 95: 217, 120: 251, 150: 290, 185: 332, 240: 393, 300: 455},
    ("al", "pvc", 3): {16: 59, 25: 73, 35: 90, 50: 110, 70: 140, 95: 170, 120: 197, 150: 227, 185: 259, 240: 305, 300: 351},
    ("al", "pvc", 1): {16: 66, 25: 83, 35: 103, 50: 125, 70: 160, 95: 195, 120: 226, 150: 261, 185: 298, 240: 352, 300: 406},
}

SOURCE_WORDS = ("לפי", "מדף", "G0", "E-", "תקן", "IEC", "SI ", "ת\"י", "חוק החשמל", "Roche", "eplan", "יצרן", "ETA", "Hilti")
ASSUMPTION_WORDS = ("הנחה", "הנחת", "משוער", "לאימות")


@dataclass
class Finding:
    severity: str          # error | warn | info
    code: str              # e.g. CABLE_UNDERSIZED
    where: str             # board/circuit/sheet
    message: str


@dataclass
class QAReport:
    design_title: str
    findings: list[Finding] = field(default_factory=list)
    sheet_audit: dict[str, dict[str, int]] = field(default_factory=dict)
    stats: dict[str, float | int | str] = field(default_factory=dict)

    def add(self, severity: str, code: str, where: str, message: str) -> None:
        self.findings.append(Finding(severity, code, where, message))

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "error"]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "warn"]

    @property
    def clean(self) -> bool:
        return not self.errors and all(sum(v.values()) == 0 for v in self.sheet_audit.values())

    @property
    def score(self) -> int:
        """0–100: 100 with no findings; each error −15, each warning −3, each audit collision −5."""
        s = 100 - 15 * len(self.errors) - 3 * len(self.warnings) - 5 * sum(sum(v.values()) for v in self.sheet_audit.values())
        return max(0, s)

    def to_json(self) -> str:
        return json.dumps({"design": self.design_title, "score": self.score, "clean": self.clean,
                           "errors": len(self.errors), "warnings": len(self.warnings),
                           "findings": [asdict(f) for f in self.findings], "sheet_audit": self.sheet_audit, "stats": self.stats},
                          ensure_ascii=False, indent=2)

    def to_markdown(self) -> str:
        lines = [f"# דוח בדיקה עצמית — {self.design_title}", "",
                 f"**ציון:** {self.score}/100 · **שגיאות:** {len(self.errors)} · **אזהרות:** {len(self.warnings)} · "
                 f"**נקי לביצוע:** {'כן' if self.clean else 'לא'}", ""]
        if self.stats:
            lines += ["## נתונים", ""] + [f"- {k}: {v}" for k, v in self.stats.items()] + [""]
        if self.sheet_audit:
            lines += ["## אודיט גיליונות (טקסט/טקסט · טקסט/קו · מחוץ למסגרת)", ""]
            lines += [f"- {no}: {a['text_text']}/{a['text_line']}/{a['outside']}" for no, a in self.sheet_audit.items()] + [""]
        for sev, title in (("error", "שגיאות"), ("warn", "אזהרות"), ("info", "מידע")):
            fs = [f for f in self.findings if f.severity == sev]
            if fs:
                lines += [f"## {title}", ""] + [f"- `{f.code}` **{f.where}** — {f.message}" for f in fs] + [""]
        return "\n".join(lines)


# ----------------------------------------------------------------------------- helpers
_SIZE_RE = re.compile(r"(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)")
_PAR_RE = re.compile(r"^\s*(\d+)\s*[xX×]\s*\(")


def cable_size(designation: str) -> Optional[tuple[int, float]]:
    """'N2XY 4X10' / '5X6mm² Cu N2XY' / '3X2.5' / '2x(4x150)NA2XY' → (cores, mm²) of one cable."""
    inner = designation.split("(", 1)[1] if "(" in designation else designation
    m = _SIZE_RE.search(inner)
    if not m:
        return None
    return int(m.group(1)), float(m.group(2))


def parallel_count(designation: str) -> int:
    """'2x(4x150)NA2XY' → 2 cables in parallel; otherwise 1."""
    m = _PAR_RE.match(designation)
    return int(m.group(1)) if m else 1


def cable_ampacity(designation: str, poles: int) -> Optional[float]:
    sz = cable_size(designation)
    if not sz:
        return None
    cores, mm2 = sz
    d = designation.upper()
    al = "NA2X" in d or " AL" in d or "NAYY" in d
    xlpe = "2X" in d or "XLPE" in d or "N2X" in d
    loaded = 3 if (poles >= 3 or cores >= 4) else 1
    table = AMPACITY.get(("al" if al else "cu", "xlpe" if xlpe else "pvc", loaded), {})
    base = table.get(mm2)
    if base is None:
        return None
    return base * parallel_count(designation)


def is_socket(c: Circuit) -> bool:
    text = f"{c.load} {c.tag}".lower()
    return any(w in text for w in ("שקע", "socket", "שקעים"))


# ----------------------------------------------------------------------------- model checks
def check_board(rep: QAReport, b: Board, design: Design) -> None:
    where = f"לוח {b.id}"
    if b.incomer is None:
        rep.add("error", "NO_INCOMER", where, "אין מפסק ראשי ללוח")
    if b.supply.kind == "utility" and b.supply.meter is None:
        rep.add("warn", "NO_METER", where, "הזנה מחח\"י ללא ציון מונה (3X40A וכד')")
    if b.spd is None and b.supply.kind in ("utility", "transformer", "generator"):
        rep.add("warn", "NO_SPD", where, "אין מגן ברקים (SPD) בלוח המוזן מהרשת / שנאי / גנרטור")
    phases: dict[str, int] = {}
    ratings_sum = 0.0
    for g in b.groups:
        if g.device and g.device.kind in ("rcd", "rcbo") and (g.device.idn_ma or 0) > 30:
            for c in g.circuits:
                if is_socket(c):
                    rep.add("error", "SOCKET_RCD_300", f"{where} / {c.tag}", f"מעגל שקעים מאחורי פחת {g.device.idn_ma} mA — נדרש 30 mA (תקנות החשמל)")
        for c in g.circuits:
            check_circuit(rep, b, c, where, protected=bool(g.device and g.device.kind in ("rcd", "rcbo") and (g.device.idn_ma or 999) <= 30))
            if c.phase in ("L1", "L2", "L3"):
                phases[c.phase] = phases.get(c.phase, 0) + 1
            ratings_sum += c.device.rating_a or 0
    for f in b.feeders:
        check_circuit(rep, b, f, where, protected=True, feeder=True)
        if f.to_board and f.to_board not in {x.id for x in design.boards}:
            rep.add("error", "FEEDER_TARGET", f"{where} / {f.tag}", f"הזנה ללוח שלא קיים במודל: {f.to_board}")
        if f.to_node and f.to_node not in {n.id for n in design.nodes}:
            rep.add("error", "FEEDER_TARGET", f"{where} / {f.tag}", f"הזנה לצומת שלא קיים במודל: {f.to_node}")
    if phases and len(phases) >= 2:
        hi, lo = max(phases.values()), min(phases.values())
        if hi - lo > 2:
            rep.add("warn", "PHASE_BALANCE", where, f"חלוקת מופעים לא מאוזנת: {phases}")
    if b.incomer and b.incomer.rating_a and ratings_sum:
        per_phase = ratings_sum / (3.0 if b.incomer.poles >= 3 else 1.0)   # single-phase circuits spread over the phases
        ratio = per_phase / b.incomer.rating_a
        rep.stats[f"{b.id}: סכום דירוגי מעגלים למופע / מפסק ראשי"] = f"{per_phase:g}A / {b.incomer.rating_a:g}A = ×{ratio:.1f}"
        if ratio > 6:
            rep.add("warn", "DIVERSITY", where, f"סכום דירוגי המעגלים גדול פי {ratio:.1f} מהמפסק הראשי — לבדוק מקדם בו-זמניות")
    tags = [c.tag for c in b.all_circuits()]
    dup = {t for t in tags if tags.count(t) > 1}
    if dup:
        rep.add("error", "DUP_TAG", where, f"תגים כפולים: {sorted(dup)}")
    if b.enclosure and b.incomer and b.incomer.rating_a and b.incomer.rating_a > 250 and b.enclosure.mounting != "floor":
        rep.add("warn", "ENCLOSURE", where, "מפסק ראשי מעל 250A בלוח שאינו רצפתי — לבדוק סוג המבנה")


def check_circuit(rep: QAReport, b: Board, c: Circuit, where: str, protected: bool, feeder: bool = False) -> None:
    w = f"{where} / {c.tag}"
    d = c.device
    spare = "שמור" in c.load or "spare" in c.load.lower() or c.tag.upper().startswith("SP")
    if c.cable is None:
        if not spare:
            rep.add("warn" if feeder else "error", "NO_CABLE", w, "אין כבל למעגל")
    else:
        amp = cable_ampacity(c.cable.designation, d.poles)
        if amp is None:
            rep.add("info", "CABLE_UNKNOWN", w, f"לא זוהה חתך/חומר בכבל '{c.cable.designation}' — לא נבדקה העמסה")
        elif d.rating_a and d.rating_a > amp:
            rep.add("error", "CABLE_UNDERSIZED", w,
                    f"מפסק {d.rating_a:g}A > העמסה מותרת {amp:.0f}A לכבל {c.cable.designation} (IEC 60364-5-52 B.52.4, שיטה C, סינון בלבד)")
        if c.cable.du_pct is not None and c.cable.du_pct > (3.0 if is_socket(c) or feeder else 4.0):
            rep.add("warn", "VOLTAGE_DROP", w, f"מפל מתח {c.cable.du_pct:.2f}% — מעל המקובל")
    if is_socket(c) and not protected and not (c.rcd and (c.rcd.idn_ma or 999) <= 30) and d.kind != "rcbo":
        rep.add("error", "SOCKET_NO_RCD", w, "מעגל שקעים ללא הגנת פחת 30 mA")
    if d.rating_a is None and d.kind not in ("switch", "terminal", "meter", "ct"):
        rep.add("warn", "NO_RATING", w, "אין דירוג זרם למפסק")
    if d.kind == "mcb" and d.rating_a and d.rating_a > 125:
        rep.add("error", "MCB_RATING", w, f"מפסק זעיר {d.rating_a:g}A — מעל 125A נדרש MCCB")


def check_design(design: Design) -> QAReport:
    rep = QAReport(design_title=design.title.project or "ללא שם")
    tb = design.title
    for fld in ("project", "client", "date"):
        if not getattr(tb, fld):
            rep.add("warn", "TITLE_BLOCK", "בלוק כותרת", f"שדה '{fld}' ריק")
    if tb.status == "לביצוע" and any(any(w in n for w in ASSUMPTION_WORDS) for n in design.notes):
        rep.add("error", "STATUS_ASSUMPTION", "בלוק כותרת", "סטטוס 'לביצוע' עם הערות המסומנות הנחה/לאימות")
    for b in design.boards:
        check_board(rep, b, design)
    ids = [b.id for b in design.boards] + [n.id for n in design.nodes] + [m.id for m in design.mv_boards]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        rep.add("error", "DUP_ID", "מודל", f"מזהים כפולים: {sorted(dup)}")
    unsourced = [n for n in design.notes if not any(w in n for w in SOURCE_WORDS)]
    if unsourced:
        rep.add("info", "NOTE_SOURCE", "הערות", f"{len(unsourced)} הערות ללא ציון מקור (לפי / תקן / גיליון)")
    if design.drill_template:
        from .template import DrillTemplate, TemplateChecks

        t = DrillTemplate.model_validate(design.drill_template)
        for p in TemplateChecks().run(t).problems:
            rep.add("error", "TEMPLATE", "שבלונת קידוח", p)
        if not t.verify:
            rep.add("warn", "NO_VERIFY", "שבלונת קידוח", "אין רשימת 'לאימות' — ערכי יצרן נלקחו כוודאיים")
        unsourced_t = [n for n in t.notes if not any(w in n for w in SOURCE_WORDS)]
        if unsourced_t:
            rep.add("info", "NOTE_SOURCE", "שבלונת קידוח", f"{len(unsourced_t)} הערות ללא ציון מקור")
    for mb in design.mv_boards:
        inc = [c for c in mb.cells if c.kind == "incomer"]
        if not inc:
            rep.add("error", "MV_NO_INCOMER", f"מסדר {mb.id}", "אין תא כניסה")
        for c in mb.cells:
            if c.kind in ("incomer", "feeder") and c.breaker is None:
                rep.add("error", "MV_NO_BREAKER", f"מסדר {mb.id} / {c.tag}", "תא הזנה ללא מפסק")
            if c.kind in ("incomer", "feeder") and not c.relay:
                rep.add("warn", "MV_NO_RELAY", f"מסדר {mb.id} / {c.tag}", "אין ממסר הגנה מצוין")
    rep.stats["לוחות"] = len(design.boards)
    rep.stats["מעגלים"] = sum(len(b.all_circuits()) for b in design.boards)
    rep.stats["צמתים"] = len(design.nodes)
    return rep


# ----------------------------------------------------------------------------- sheet checks
def check_sheets(rep: QAReport, doc: Drawing, result: dict[str, tuple[Drawing, list[str]]], expected: Iterable[str]) -> None:
    from .audit import audit_sheet

    expected = list(expected)
    if list(result) != expected:
        rep.add("error", "PLAN_MISMATCH", "סט", f"הגיליונות שצוירו {list(result)} ≠ התוכנית {expected}")
    for i, (no, (_, warnings)) in enumerate(result.items()):
        for w in warnings:
            rep.add("warn", "DRAW", no, w)
        a = audit_sheet(doc, i, no)
        rep.sheet_audit[no] = {"text_text": len(a.text_overlaps), "text_line": len(a.text_line_collisions), "outside": len(a.text_outside)}
        for c in (a.text_overlaps + a.text_line_collisions + a.text_outside)[:5]:
            rep.add("error", "AUDIT", no, f"{c.kind}: {c.a!r} / {c.b!r} @ ({c.at[0]:.0f},{c.at[1]:.0f})")
    heights = [e.dxf.height for e in doc.modelspace().query("TEXT")]
    tiny = [h for h in heights if h < MIN_TEXT_H - 1e-6]
    small = [h for h in heights if MIN_TEXT_H - 1e-6 <= h < 1.4 - 1e-6]
    if tiny:
        rep.add("warn", "TEXT_TINY", "סט", f"{len(tiny)} טקסטים מתחת ל-{MIN_TEXT_H} מ\"מ — לא קריאים בהדפסת A3")
    if small:
        rep.add("info", "TEXT_SMALL", "סט", f"{len(small)} טקסטים בגובה {MIN_TEXT_H}–1.4 מ\"מ (דירוגים בתוך מודולים / תאי מ\"ג)")
    missing_style = {e.dxf.style for e in doc.modelspace().query("TEXT") if e.dxf.style not in doc.styles}
    if missing_style:
        rep.add("error", "TEXT_STYLE", "סט", f"סגנונות טקסט חסרים: {sorted(missing_style)}")


def write_report(rep: QAReport, out_dir: Path, stem: str) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    pj, pm = out_dir / f"{stem}_qa.json", out_dir / f"{stem}_qa.md"
    pj.write_text(rep.to_json(), encoding="utf-8")
    pm.write_text(rep.to_markdown(), encoding="utf-8")
    return pj, pm
