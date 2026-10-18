import json
from pathlib import Path

import ezdxf
import pytest

from bee_cad.model import Board, Design, Device, Enclosure
from bee_cad.panel import device_width_mm, plan_panel
from bee_cad.render import build, render_png
from bee_cad.symbols import BUILDERS, device_block_name
from bee_cad.text import has_hebrew, split_bidi_safe, to_visual

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "house_karka.json"


@pytest.fixture(scope="module")
def design() -> Design:
    return Design.model_validate(json.loads(EXAMPLE.read_text(encoding="utf-8")))


def test_example_validates(design: Design):
    assert len(design.boards) == 2
    assert sum(len(b.all_circuits()) for b in design.boards) == 26
    assert design.board("MDB").incomer.lock


def test_device_labels():
    d = Device(tag="M1", kind="mcb", poles=1, rating_a=16, curve="C")
    assert d.label_lines()[0] == "1P C16"
    r = Device(tag="RCD-A", kind="rcd", poles=4, rating_a=40, idn_ma=30, rcd_type="A")
    assert r.label_lines() == ["4P 40A", "30mA", "Type A"]


def test_block_names_cover_all_kinds():
    for kind in ("mcb", "mccb", "acb", "rcd", "rcbo", "switch", "fuse", "spd", "meter", "ct", "contactor"):
        for poles in (1, 2, 3, 4):
            assert device_block_name(kind, poles) in BUILDERS


def test_hebrew_visual_order():
    s = "לוח ראשי MDB 40A"
    v = to_visual(s)
    assert has_hebrew(v) and v != s
    assert "MDB 40A" in v            # Latin run kept intact
    assert split_bidi_safe("RCD-A 4P 40A — מפסק פחת") == ["RCD-A 4P 40A", "מפסק פחת"]


def test_modular_widths():
    assert device_width_mm(Device(tag="x", kind="mcb", poles=1)) == 18
    assert device_width_mm(Device(tag="x", kind="rcd", poles=4)) == 72
    assert device_width_mm(Device(tag="x", kind="mccb", poles=4, rating_a=250)) == 140


def test_panel_plan_wraps_rows(design: Design):
    lay = plan_panel(design.board("MDB"))
    rows = {p.row for p in lay.placed}
    assert rows == {0, 1, 2} or rows == {0, 1, 2, 3}
    assert not lay.warnings
    assert lay.spare_modules > 0
    # overflow is reported, never silently dropped
    small = design.board("MDB").model_copy(update={"enclosure": Enclosure(rows=1, modules_per_row=18)})
    lay2 = plan_panel(small)
    assert lay2.warnings and len(lay2.placed) == len(lay.placed)


def test_build_dxf_audit_clean(design: Design, tmp_path: Path):
    result = build(design, ("sld", "panel"), mode="unicode")
    assert list(result) == ["E-05", "E-P02", "E-P03"]
    doc = next(iter(result.values()))[0]
    for _, warnings in result.values():
        assert warnings == []
    path = tmp_path / "house.dxf"
    doc.saveas(path)
    doc2 = ezdxf.readfile(path)
    assert doc2.dxfversion == "AC1032"
    assert doc2.header["$INSUNITS"] == 4
    auditor = doc2.audit()
    assert len(auditor.errors) == 0
    msp = doc2.modelspace()
    kinds = {e.dxftype() for e in msp}
    assert {"INSERT", "TEXT", "LWPOLYLINE", "DIMENSION", "MTEXT"} <= kinds
    inserts = [e.dxf.name for e in msp.query("INSERT")]
    assert inserts.count("BEE_MCB_1P") >= 24
    assert "BEE_RCD_4P" in inserts and "BEE_INVERTER" in inserts
    # Hebrew is stored in logical order with the TrueType Hebrew style
    heb = [e for e in msp.query("TEXT") if has_hebrew(e.dxf.text)]
    assert heb and all(e.dxf.style in ("BEE-HEB", "BEE-HEB-B") for e in heb)
    assert any(e.dxf.text.startswith("לוח ראשי") for e in heb)


def test_build_shx_mode_reverses_hebrew(design: Design):
    result = build(design, ("sld",), mode="shx")
    doc = next(iter(result.values()))[0]
    heb = [e for e in doc.modelspace().query("TEXT") if has_hebrew(e.dxf.text)]
    assert heb and all(e.dxf.style == "BEE-HEB-SHX" for e in heb)
    assert any(e.dxf.text.endswith("חול") for e in heb)   # "לוח ראשי" reversed → ends with the first word


def test_render_png(design: Design, tmp_path: Path):
    result = build(design, ("sld",))
    doc = next(iter(result.values()))[0]
    png = tmp_path / "e05.png"
    render_png(doc, png, dpi=40)
    assert png.exists() and png.stat().st_size > 10_000


def test_pdf_and_archive(design: Design, tmp_path: Path):
    from bee_cad.archive import STAGES, archive, safe_name
    from bee_cad.render import merge_pdfs, render_pdf

    result = build(design, ("sld", "panel"))
    doc = next(iter(result.values()))[0]
    pages = []
    for i, no in enumerate(result):
        p = tmp_path / f"{no}.pdf"
        render_pdf(doc, p, sheet_index=i)
        pages.append(p)
    set_pdf = tmp_path / "SET.pdf"
    merge_pdfs(pages, set_pdf)
    from pypdf import PdfReader

    r = PdfReader(str(set_pdf))
    assert len(r.pages) == 3
    w, h = float(r.pages[0].mediabox.width), float(r.pages[0].mediabox.height)
    assert abs(w / 72 * 25.4 - 420) < 2 and abs(h / 72 * 25.4 - 297) < 2   # A3 landscape

    folder, man = archive(design, {"pdf_set": set_pdf, "pdf_sheet:E-05": pages[0]}, tmp_path / "arch", stage="design")
    assert folder.name == STAGES["design"]
    assert folder.parent.name == safe_name(design.title.project)
    assert folder.parent.parent.name == safe_name(design.title.client)
    assert (folder / "manifest.json").exists()
    assert {e.role for e in man.entries} == {"pdf_set", "pdf_sheet"}
    assert safe_name('a/b:c?') == "a-b-c-"


def test_eplan_bridge(tmp_path: Path):
    from bee_cad.eplan_bridge import _poles, device_from_eplan, load_from_files

    d = device_from_eplan({"tag": "RCD-INV", "kind": "RCD", "rating": "32A 300mA", "poles": "4P", "note": "type B — …"})
    assert (d.kind, d.poles, d.rating_a, d.idn_ma, d.rcd_type) == ("rcd", 4, 32.0, 300, "B")
    spd = device_from_eplan({"tag": "SPD-AC", "kind": "SPD", "rating": "T2 275V", "poles": "3P+N"})
    assert (spd.kind, spd.poles) == ("spd", 4)
    assert [_poles(p) for p in ("1P+N", "3p + n", "4P", "2P", "", "3P")] == [2, 4, 4, 2, 1, 3]

    ex = Path(__file__).resolve().parents[1] / "examples" / "eplan"
    design = load_from_files(ex / "example.yaml", ex / "example_calc.json")
    mdb = design.board("MDB")
    assert mdb.incomer.tag == "Q-MAIN" and mdb.incomer.rating_a == 63
    f = mdb.feeders[0]
    assert f.tag == "Q-INV" and f.device.rating_a == 32 and f.rcd.tag == "RCD-INV" and f.to_node == "INV"
    assert f.cable.designation == "5X6mm² Cu N2XY" and f.cable.du_pct == 0.37
    assert design.board("BUB").incomer.tag == "Q-BACKUP"
    assert {n.id for n in design.nodes} == {"INV", "BAT", "PV", "MPV"}
    assert any(n.startswith("מחרוזות:") for n in design.notes)

    merged = load_from_files(ex / "example.yaml", ex / "example_calc.json", EXAMPLE)
    assert len(merged.board("MDB").all_circuits()) == 21     # 20 house circuits + Q-INV feeder
    result = build(merged, ("sld",))
    assert next(iter(result.values()))[1] == []


def test_audit_clean_on_examples(design: Design):
    from bee_cad.audit import audit_sheet
    from bee_cad.eplan_bridge import load_from_files

    ex = Path(__file__).resolve().parents[1] / "examples" / "eplan"
    for des in (design, load_from_files(ex / "example.yaml", ex / "example_calc.json", EXAMPLE)):
        result = build(des, ("sld", "panel"))
        doc = next(iter(result.values()))[0]
        for i, (no, (_, warnings)) in enumerate(result.items()):
            assert warnings == [], (no, warnings)
            rep = audit_sheet(doc, i, no)
            assert rep.clean, (no, rep.summary(), rep.text_overlaps[:3], rep.text_line_collisions[:3], rep.text_outside[:3])


def test_mv_sheets_audit_clean():
    from bee_cad.audit import audit_sheet
    from bee_cad.mv import wrap

    assert wrap("50/51, 50N/51N, 67N, 27/59", 12, 3) == ["50/51", "50N/51N", "67N, 27/59"]
    mv = Path(__file__).resolve().parents[1] / "examples" / "mv_bess_site.json"
    des = Design.model_validate(json.loads(mv.read_text(encoding="utf-8")))
    result = build(des, ("mv",))
    assert list(result) == ["E-05", "E-05A"]
    doc = next(iter(result.values()))[0]
    inserts = [e.dxf.name for e in doc.modelspace().query("INSERT")]
    assert inserts.count("BEE_ACB_3P") >= 6 and "BEE_VT" in inserts and "BEE_CABLE_HEAD" in inserts
    for i, (no, (_, warnings)) in enumerate(result.items()):
        assert warnings == [], (no, warnings)
        rep = audit_sheet(doc, i, no)
        assert rep.clean, (no, rep.summary(), rep.text_overlaps[:3], rep.text_line_collisions[:3])


def test_drill_template():
    from bee_cad.audit import audit_sheet
    from bee_cad.template import DrillTemplate, TemplateChecks, Unit

    ex = Path(__file__).resolve().parents[1] / "examples" / "bess_drill_template.json"
    des = Design.model_validate(json.loads(ex.read_text(encoding="utf-8")))
    t = DrillTemplate.model_validate(des.drill_template)
    assert sum(len(t.anchor_points(u)) for u in t.units) == 32
    assert t.anchor_points(t.units[0])[0] == (120.0, 300.0)
    assert t.anchor_points(t.units[1])[0] == (1209.0, 500.0)
    assert t.anchor_points(t.units[0])[1] == (180.0, 400.0)
    assert TemplateChecks().run(t).problems == []
    bad = t.model_copy(update={"units": t.units + [Unit(tag="X", x_mm=5000, y_mm=50, width_mm=989, depth_mm=1465)]})
    probs = TemplateChecks().run(bad).problems
    assert any("חורג" in p for p in probs) and any("משפה" in p for p in probs)
    result = build(des, ("drill",))
    assert list(result) == ["E-20"]
    doc = next(iter(result.values()))[0]
    assert doc.modelspace().query("DIMENSION")
    rep = audit_sheet(doc, 0, "E-20")
    assert rep.clean, (rep.summary(), rep.text_overlaps[:3], rep.text_line_collisions[:3], rep.text_outside[:3])


def test_cover_and_plan():
    from bee_cad.render import plan_sheets

    des = Design.model_validate(json.loads(EXAMPLE.read_text(encoding="utf-8")))
    plan = plan_sheets(des, ("cover", "sld", "panel"))
    assert [e.no for e in plan] == ["E-00", "E-05", "E-P03", "E-P04"]
    assert plan[0].kind == "cover"
    result = build(des, ("cover", "sld"))
    assert list(result) == ["E-00", "E-05"]
    doc, warnings = result["E-00"]
    assert warnings == []
    texts = [e.dxf.text for e in doc.modelspace().query("TEXT")]
    assert "רשימת גיליונות" in texts and "E-05" in texts
    # a cover alone is not a set: no cover sheet when nothing else is drawn
    assert plan_sheets(des, ("cover",)) == []


def test_bess1_18_units_and_job(tmp_path: Path):
    from bee_cad.audit import audit_sheet
    from bee_cad.hive import job_record, write_job
    from bee_cad.template import DrillTemplate, TemplateChecks, scale_text

    ex = Path(__file__).resolve().parents[1] / "examples" / "bess1_drill_template_18.json"
    des = Design.model_validate(json.loads(ex.read_text(encoding="utf-8")))
    t = DrillTemplate.model_validate(des.drill_template)
    assert len(t.units) == 18 and sum(len(t.anchor_points(u)) for u in t.units) == 144
    assert TemplateChecks().run(t).problems == []
    assert scale_text(t) == "1:100 / 1:15"
    result = build(des, ("drill",))
    doc, warnings = result["E-20"]
    assert warnings == []
    rep = audit_sheet(doc, 0, "E-20")
    assert rep.clean, (rep.summary(), rep.text_overlaps[:3], rep.text_line_collisions[:3])
    rec = job_record(ex, ["drill"], {"dxf": tmp_path / "x.dxf"}, {"E-20": {"text_text": 0, "text_line": 0, "outside": 0}},
                     {"E-20": []}, None, None, "2026-10-17T00:00:00+00:00")
    assert rec["status"] == "succeeded" and rec["result"]["clean"] and rec["loop"] == "edit.cad_render"
    p = write_job(rec, tmp_path / "job.json")
    schema = json.loads((Path(__file__).resolve().parents[2] / "platform" / "schema" / "job.schema.json").read_text(encoding="utf-8"))
    for k in schema["required"]:
        assert k in rec
    assert rec["kind"] in schema["properties"]["kind"]["enum"] and rec["status"] in schema["properties"]["status"]["enum"]
    assert p.exists()


def test_qa_checks(design: Design):
    from bee_cad.model import Cable, Circuit, Device, Group
    from bee_cad.qa import cable_ampacity, check_design, check_sheets

    assert cable_ampacity("3X2.5", 1) == 27 and cable_ampacity("N2XY 5X10", 3) == 71          # B.52.2 / B.52.5, method C
    assert cable_ampacity("2x(4x150)NA2XY", 3) == 290 * 2 and cable_ampacity("גמיש", 1) is None
    rep = check_design(design)
    assert not rep.errors and rep.score >= 95
    # break the model on purpose: socket without RCD on a 300 mA group, breaker above cable, feeder to nowhere
    bad = design.model_copy(deep=True)
    mdb = bad.board("MDB")
    mdb.groups.append(Group(tag="RCD-X", device=Device(tag="RCD-X", kind="rcd", poles=4, rating_a=40, idn_ma=300),
                            circuits=[Circuit(tag="MX", device=Device(tag="MX", kind="mcb", rating_a=32, curve="C"),
                                              cable=Cable(designation="3X2.5"), load="שקעים — מרפסת")]))
    mdb.feeders.append(Circuit(tag="QX", device=Device(tag="QX", kind="mccb", poles=4, rating_a=63), kind="feeder", to_board="NOPE"))
    rep2 = check_design(bad)
    codes = {f.code for f in rep2.errors}
    assert {"SOCKET_RCD_300", "CABLE_UNDERSIZED", "FEEDER_TARGET"} <= codes
    assert rep2.score < rep.score
    result = build(design, ("cover", "sld"))
    doc = next(iter(result.values()))[0]
    check_sheets(rep, doc, result, ["E-00", "E-05"])
    assert rep.sheet_audit == {"E-00": {"text_text": 0, "text_line": 0, "outside": 0}, "E-05": {"text_text": 0, "text_line": 0, "outside": 0}}
    check_sheets(rep, doc, result, ["E-00"])
    assert any(f.code == "PLAN_MISMATCH" for f in rep.errors)
    assert "# דוח בדיקה עצמית" in rep.to_markdown()


def test_site_sheet():
    from bee_cad.audit import audit_sheet
    from bee_cad.render import plan_sheets
    from bee_cad.site import SiteLayout, site_scale
    from bee_cad.template import DrillTemplate

    ex = Path(__file__).resolve().parents[1] / "examples" / "bess_drill_template.json"
    des = Design.model_validate(json.loads(ex.read_text(encoding="utf-8")))
    lay = SiteLayout.model_validate(des.site)
    assert site_scale(DrillTemplate.model_validate(des.drill_template), lay) == 40.0
    plan = plan_sheets(des, ("cover", "site", "drill"))
    assert [e.no for e in plan] == ["E-00", "E-02", "E-20"] and plan[1].scale == "1:40"
    result = build(des, ("site",))
    doc, warnings = result["E-02"]
    assert warnings == []
    rep = audit_sheet(doc, 0, "E-02")
    assert rep.clean, (rep.summary(), rep.text_overlaps[:3], rep.text_line_collisions[:3])
    assert doc.modelspace().query("HATCH") and len(doc.modelspace().query("DIMENSION")) >= 12


def test_kal_gader_sld_groups():
    from bee_cad.audit import audit_sheet
    from bee_cad.render import plan_sheets

    ex = Path(__file__).resolve().parents[1] / "examples" / "kal_gader_bess.json"
    des = Design.model_validate(json.loads(ex.read_text(encoding="utf-8")))
    plan = plan_sheets(des, ("cover", "site", "sld", "drill"))
    assert [e.no for e in plan] == ["E-00", "E-02", "E-03", "E-04", "E-05", "E-20"]
    result = build(des, ("sld",))
    assert list(result) == ["E-03", "E-04", "E-05"]
    doc = next(iter(result.values()))[0]
    for i, (no, (_, warnings)) in enumerate(result.items()):
        assert warnings == [], (no, warnings)
        rep = audit_sheet(doc, i, no)
        assert rep.clean, (no, rep.summary(), rep.text_overlaps[:3], rep.text_line_collisions[:3])
    texts = [e.dxf.text for e in doc.modelspace().query("TEXT")]
    assert "SATEC PM135 *1" in texts and any(t.startswith("2x(4x150)NA2XY  → BESSP") for t in texts)
    inserts = [e.dxf.name for e in doc.modelspace().query("INSERT")]
    assert inserts.count("BEE_METER_PM") == 3 and inserts.count("BEE_MCCB_3P") == 4


def test_earthing_sheet():
    from bee_cad.audit import audit_sheet
    from bee_cad.earthing import Earthing, ring_checks

    ex = Path(__file__).resolve().parents[1] / "examples" / "kal_gader_bess.json"
    des = Design.model_validate(json.loads(ex.read_text(encoding="utf-8")))
    e = Earthing.model_validate(des.earthing)
    rows = ring_checks(e, 5200, 2100)
    assert all(ok for *_, ok in rows) and any(r[0].startswith("היקף") and r[2] == "13.4" for r in rows)
    result = build(des, ("earthing",))
    doc, warnings = result["E-06"]
    assert warnings == []
    rep = audit_sheet(doc, 0, "E-06")
    assert rep.clean, (rep.summary(), rep.text_overlaps[:3], rep.text_line_collisions[:3])
    texts = [x.dxf.text for x in doc.modelspace().query("TEXT")]
    assert "35 Cu" in texts and any(t.startswith("1×70 Cu/PVC") for t in texts)


def test_comm_sheet():
    from bee_cad.audit import audit_sheet

    ex = Path(__file__).resolve().parents[1] / "examples" / "kal_gader_bess.json"
    des = Design.model_validate(json.loads(ex.read_text(encoding="utf-8")))
    result = build(des, ("comm",))
    doc, warnings = result["E-07"]
    assert warnings == []
    rep = audit_sheet(doc, 0, "E-07")
    assert rep.clean, (rep.summary(), rep.text_overlaps[:3], rep.text_line_collisions[:3])
    texts = [x.dxf.text for x in doc.modelspace().query("TEXT")]
    assert "Switch 8 ports" in texts and texts.count("Cat7 — EMS ↔ PCS") == 4


def test_schedules_notes_cover():
    from bee_cad.audit import audit_sheet
    from bee_cad.render import plan_sheets
    from bee_cad.schedules import STANDARD_NOTES, cable_rows, load_rows

    ex = Path(__file__).resolve().parents[1] / "examples" / "kal_gader_bess.json"
    des = Design.model_validate(json.loads(ex.read_text(encoding="utf-8")))
    rows = cable_rows(des)
    assert len(rows) == 24 and rows[0][0] == "W01" and rows[0][3] == "2x(4x120)NA2XY"
    lrows, summary = load_rows(des)
    assert len(lrows) == 22 and [s[0] for s in summary] == ["MCP", "INVP", "BESSP", "COMM"]
    assert any(r[6] == "125.0" for r in lrows)          # given load, not estimated
    assert len(STANDARD_NOTES) >= 8
    plan = plan_sheets(des, ("cover", "notes", "schedules"))
    assert [e.no for e in plan] == ["E-00", "E-01", "E-30", "E-31"]
    result = build(des, ("cover", "notes", "schedules"))
    doc = next(iter(result.values()))[0]
    for i, (no, (_, warnings)) in enumerate(result.items()):
        assert warnings == [], (no, warnings)
        rep = audit_sheet(doc, i, no)
        assert rep.clean, (no, rep.summary(), rep.text_overlaps[:2], rep.text_line_collisions[:2], rep.text_outside[:2])
