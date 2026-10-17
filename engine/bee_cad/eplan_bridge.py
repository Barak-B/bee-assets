"""eplan → bee-cad bridge.

Reads the office generator's project spec (YAML) and its calculation report
(``eplan pv design <spec> --json`` → ``{"summary": …, "report": CalcReport}``) and builds a
:class:`Design`: the customer's main board with the PV feeder (Q-INV + RCD-INV + SPD-AC + W-AC),
an optional backup board (Q-BACKUP, CO-1, W-BK), the inverter / battery / PV / production-meter
nodes, and the engine's "verify" items as sheet notes.

Every device rating comes from the calculation — nothing is typed by hand here. Existing house
circuits (M1…) are not part of eplan; merge them from a second design file with ``--merge``.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml

from .model import Board, Busbar, Cable, Circuit, Design, Device, Enclosure, Group, Node, Supply, TitleBlock

_RATING = re.compile(r"(\d+(?:\.\d+)?)\s*A")
_MA = re.compile(r"(\d+)\s*mA")
_POLES = re.compile(r"(\d)P")


def _rating_a(s: str) -> float | None:
    m = _RATING.search(s or "")
    return float(m.group(1)) if m else None


def _poles(s: str) -> int:
    s = s or ""
    if "3P+N" in s or "4P" in s:
        return 4
    m = _POLES.search(s)
    return int(m.group(1)) if m else 1


def _kind(kind: str) -> str:
    k = (kind or "").lower()
    if "rcd" in k:
        return "rcd"
    if "mccb" in k:
        return "mccb"
    if "mcb" in k:
        return "mcb"
    if "spd" in k:
        return "spd"
    if "isolator" in k or "switch" in k:
        return "switch"
    if "fuse" in k:
        return "fuse"
    if "meter" in k:
        return "meter"
    return "mcb"


def device_from_eplan(d: dict[str, Any]) -> Device:
    rating = d.get("rating", "")
    kind = _kind(d.get("kind", ""))
    dev = Device(tag=d["tag"], kind=kind, poles=_poles(d.get("poles", "")), rating_a=_rating_a(rating))
    if kind == "rcd":
        m = _MA.search(rating)
        if m:
            dev.idn_ma = int(m.group(1))
        note = d.get("note", "")
        if "type B" in note:
            dev.rcd_type = "B"
        elif "type A" in note:
            dev.rcd_type = "A"
    if kind == "spd":
        dev.note = rating          # "T2 275V"
    if kind == "mcb" and "curve C" in d.get("note", ""):
        dev.curve = "C"
    return dev


def cable_from_eplan(c: dict[str, Any]) -> Cable:
    return Cable(designation=c.get("designation") or f"{c.get('cores')}X{c.get('section_mm2'):g}mm² {c.get('material')}",
                 length_m=c.get("length_m"), du_pct=c.get("drop_pct"), method=c.get("method"))


def design_from_eplan(spec: dict[str, Any], report: dict[str, Any], *, sheet_no: str = "E-01") -> Design:
    site = spec.get("site", {})
    inv = spec.get("inverter", {})
    bat = spec.get("battery")
    devices = {d["tag"]: d for d in report.get("devices", [])}
    cables = {c["tag"]: c for c in report.get("cables", [])}
    strings = report.get("strings", [])
    notes: list[str] = []

    conn = site.get("connection_a")
    supply = Supply(kind="utility", label=site.get("supply_name") or "חח\"י",
                    meter=f"3X{conn:g}A" if conn and site.get("grid_phases", 3) == 3 else (f"{conn:g}A" if conn else None),
                    voltage=f"{site.get('grid_v_v', 400):g}/230V" if site.get("grid_phases", 3) == 3 else "230V",
                    earthing=site.get("earthing_system", "TT") if site.get("earthing_system") in ("TN-C-S", "TN-S", "TT", "IT") else "")

    main = Board(id="MDB", title=site.get("board_name") or "לוח ראשי של הלקוח (קיים)", supply=supply,
                 busbar=Busbar(rating_a=conn))
    if "Q-MAIN" in devices:
        main.incomer = device_from_eplan(devices["Q-MAIN"])
        main.incomer.lock = True
    if "SPD-AC" in devices:
        main.spd = device_from_eplan(devices["SPD-AC"])
    # the house RCD as found (eplan: site.house_rcd_a / house_rcd_ma) with a placeholder group
    if site.get("house_rcd_a"):
        rcd = Device(tag="RCD-H", kind="rcd", poles=4, rating_a=site["house_rcd_a"], idn_ma=int(site.get("house_rcd_ma", 30)), rcd_type="A")
        main.groups.append(Group(tag="RCD-H", device=rcd, title="מעגלי הבית — קיים",
                                 circuits=[Circuit(tag="M…", device=Device(tag="M…", kind="mcb", poles=1), load="צרכני הבית (קיים)")]))
    if "Q-INV" in devices:
        f = Circuit(tag="Q-INV", kind="feeder", device=device_from_eplan(devices["Q-INV"]), to_node="INV")
        f.device.lock = True
        f.device.note = "מפסק ראשי PV"
        if "RCD-INV" in devices:
            f.rcd = device_from_eplan(devices["RCD-INV"])
        if "W-AC" in cables:
            f.cable = cable_from_eplan(cables["W-AC"])
        main.feeders.append(f)

    boards = [main]
    if "Q-BACKUP" in devices:
        bk = Board(id="BUB", title="לוח גיבוי (צרכנים חיוניים)",
                   supply=Supply(kind="inverter", label="מיציאת BACK-UP של הממיר",
                                 cable=cable_from_eplan(cables["W-BK"]) if "W-BK" in cables else None, earthing=""),
                   incomer=device_from_eplan(devices["Q-BACKUP"]),
                   busbar=Busbar(rating_a=_rating_a(devices["Q-BACKUP"].get("rating", ""))),
                   groups=[Group(tag="BUB", circuits=[Circuit(tag="B…", device=Device(tag="B…", kind="mcb", poles=1), load="צרכנים חיוניים")])])
        if "CO-1" in devices:
            bk.notes.append(f"CO-1 מחלף I-0-II {devices['CO-1'].get('rating', '')} — {devices['CO-1'].get('note', '')}")
            notes.append(f"לוח הגיבוי: מחלף CO-1 ({devices['CO-1'].get('rating', '')}) בין יציאת BACK-UP של הממיר לבין הזנה ישירה מהרשת לצורך תחזוקה.")
        boards.append(bk)

    nodes: list[Node] = []
    mppts = inv.get("mppts", [])
    nodes.append(Node(id="INV", kind="inverter", label="ממיר " + ("היברידי" if inv.get("kind") == "hybrid" else "רשת"),
                      sublabel=f"{inv.get('model', '')} — {len(mppts)} MPPT" if mppts else inv.get("model", ""),
                      rating=f"{report.get('p_ac_kw', inv.get('p_ac_nom_w', 0) / 1000):g} kW · {inv.get('v_ac_v', 400):g}V",
                      device=device_from_eplan(devices["QS-AC"]) if "QS-AC" in devices else None))
    if bat:
        branches = bat.get("branches", 1)
        kwh = bat.get("capacity_kwh", 0) * branches
        nodes.append(Node(id="BAT", kind="battery", label="מערכת אגירה",
                          sublabel=f"{bat.get('model', '')} — {branches} ענפים", rating=f"{kwh:g} kWh · {bat.get('v_nom_v', 0):g}V"))
    n_mod = spec.get("module_count", sum(s.get("modules", 0) for s in strings))
    p_w = spec.get("module", {}).get("p_max_w", 0)
    nodes.append(Node(id="PV", kind="pv", label="מערך PV",
                      sublabel=f"{n_mod} × {p_w:g}W — {len(strings)} מחרוזות",
                      rating=f"{report.get('p_dc_kwp', n_mod * p_w / 1000):g} kWp"))
    if "M-PV" in devices:
        nodes.append(Node(id="MPV", kind="meter", label="מונה ייצור",
                          sublabel=f"{devices.get('QS-M1', {}).get('tag', 'QS-M1')} · M-PV · {devices.get('QS-M2', {}).get('tag', 'QS-M2')}",
                          rating=devices["M-PV"].get("rating", "")))

    # notes: string summary + the engine's verify list
    if strings:
        notes.insert(0, "מחרוזות: " + ", ".join(f"{s['tag']} {s['modules']}×{p_w:g}W על {s['mppt']}" for s in strings) + ".")
    for v in report.get("verify", [])[:5]:
        notes.append(f"לאימות: {v}")

    tb = TitleBlock(project=spec.get("project", ""), site=site.get("address", ""), sheet_no=sheet_no,
                    sheet_title="חד-קווי — חיבור PV ואגירה ללוח הלקוח", revision=spec.get("revision", "A"),
                    date=str(spec.get("date", "")), designer=spec.get("designer", "ברק הנדסת חשמל"))
    return Design(title=tb, boards=boards, nodes=nodes, notes=notes)


def merge_existing(design: Design, existing: Design) -> Design:
    """Replace the placeholder house group with the real circuits from an existing-board design."""
    try:
        ex = existing.board("MDB")
    except KeyError:
        return design
    main = design.board("MDB")
    main.groups = [g for g in main.groups if g.tag != "RCD-H"] + ex.groups
    if ex.enclosure:
        main.enclosure = ex.enclosure
    if ex.incomer and not main.incomer:
        main.incomer = ex.incomer
    if ex.ct:
        main.ct = ex.ct
    return design


def load_from_files(spec_path: Path, calc_path: Path, merge_path: Path | None = None) -> Design:
    spec = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
    calc = json.loads(calc_path.read_text(encoding="utf-8"))
    report = calc.get("report", calc)
    design = design_from_eplan(spec, report)
    if merge_path:
        existing = Design.model_validate(json.loads(merge_path.read_text(encoding="utf-8")))
        design = merge_existing(design, existing)
    return design
