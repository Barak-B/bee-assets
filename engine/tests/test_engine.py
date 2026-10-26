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


def test_cable_calcs():
    from bee_cad.calc import ampacity, parse_cable, voltage_drop_pct
    from bee_cad.model import Cable

    s = parse_cable("3X2.5")
    assert (s.cores, s.csa_mm2, s.insulation) == (3, 2.5, "PVC")
    assert parse_cable("N2XY 4X10").insulation == "XLPE"
    assert parse_cable("3×(1×185/25) Al XLPE") is None
    assert ampacity(s, "B1", 2) == 24
    assert ampacity(parse_cable("5X16 Cu N2XY"), "C", 3) == 96
    du = voltage_drop_pct(Cable(designation="3X2.5", length_m=30), 16, False)
    assert abs(du - 100 * 2 * 16 * 0.0225 * 30 / 2.5 / 230) < 1e-9


def test_design_checks(design: Design):
    from bee_cad.checks import check
    from bee_cad.model import Circuit, Group

    assert not [f for f in check(design.model_copy(deep=True)) if f.level == "error"]

    bad = design.model_copy(deep=True)
    mdb = bad.board("MDB")
    mdb.groups[0].circuits[0].device.rating_a = 32                       # 32A on 3X2.5
    mdb.groups[0].circuits[1].tag = mdb.groups[0].circuits[2].tag        # duplicate tag
    mdb.feeders[0].to_node = "INV-X"                                     # dangling reference
    mdb.groups.append(Group(tag="RCD-Z", device=Device(tag="RCD-Z", kind="rcd", poles=4, rating_a=40, idn_ma=300),
                            circuits=[Circuit(tag="S1", device=Device(tag="S1", rating_a=16), phase="L1-3",
                                              load="שקעים — מחסן",
                                              cable={"designation": "3X1.5", "length_m": 80})]))
    codes = {f.code for f in check(bad)}
    assert {"CABLE_OVERLOAD", "DUP_TAG", "BAD_REF", "RCD_SOCKETS", "POLES_PHASE", "CABLE_OVERLOAD", "DU_HIGH"} <= codes
    s1 = bad.board("MDB").groups[-1].circuits[0]
    assert s1.cable.du_pct is not None                                   # computed value written back for the drawing
    over = next(f for f in check(bad) if f.code == "CABLE_OVERLOAD")
    assert "להקטין את המפסק" in over.fix


def test_bom(design: Design, tmp_path: Path):
    from bee_cad.bom import bom, write_csv

    rows = bom(design)
    c16 = next(r for r in rows if r.spec == "1P C16")
    assert c16.iec == "QA" and c16.qty == 20
    assert next(r for r in rows if r.item == "מפסק פחת").iec == "FB"
    write_csv(rows, tmp_path / "bom.csv")
    assert (tmp_path / "bom.csv").read_text(encoding="utf-8-sig").startswith("IEC 81346")


def test_hebrew_load_errors(tmp_path: Path):
    from bee_cad.cli import DesignFileError, load_design

    p = tmp_path / "bad.json"
    p.write_text(json.dumps({"boards": [{"title": "x", "groups": [{"tag": "G", "circuits": [
        {"tag": "M1", "device": {"tag": "M1", "kind": "breaker", "rating_a": "abc"}}]}]}]}), encoding="utf-8")
    with pytest.raises(DesignFileError) as e:
        load_design(p)
    msg = str(e.value)
    assert "שדה חובה חסר" in msg and "ערך לא מוכר" in msg and "צריך להיות מספר" in msg
    assert "boards > 0 > id" in msg


def test_cable_parsing_edge_cases():
    from bee_cad.calc import ambient_factor, ampacity, iec_class, parse_cable

    assert parse_cable("3x1,5").csa_mm2 == 1.5
    assert parse_cable("H07RN-F 3G2.5").csa_mm2 == 2.5
    al = parse_cable("NA2XY 4X50")
    assert al.material == "Al" and ampacity(al, "C", 3) == round(179 * 0.78, 1)
    assert parse_cable("5x16 al").material == "Al"
    assert ampacity(parse_cable("N2XY 4X300"), "C", 3) is None          # outside the table → not silently OK
    assert ambient_factor("PVC", 45) == 0.79 and ambient_factor("XLPE", 30) == 1.0
    assert ampacity(parse_cable("3X2.5"), "B1", 2, ambient_c=45) == round(24 * 0.79, 1)
    assert iec_class(Device(tag="F", kind="fuse")) == "FC" and iec_class(Device(tag="S", kind="spd")) == "FA"


def test_short_circuit_checks(design: Design):
    from bee_cad.checks import check
    from bee_cad.model import Cable, Circuit, Group

    d = design.model_copy(deep=True)
    mdb = d.board("MDB")
    mdb.supply.ik_ka = 10
    mdb.incomer.icu_ka = 3
    # 80 m of 1.5 mm² on a C16 with no RCD in front: the magnetic trip never sees 160 A
    mdb.groups.append(Group(tag="PLAIN", circuits=[Circuit(tag="L9", device=Device(tag="L9", rating_a=16, curve="C"),
                                                           phase="L1", load="תאורה — חצר",
                                                           cable=Cable(designation="3X1.5", length_m=80))]))
    f = {x.code: x for x in check(d)}
    assert f["ICU_LOW"].level == "error" and "6kA" in f["ICU_LOW"].fix
    assert f["DISCONNECT"].level == "error" and f["DISCONNECT"].where == "MDB / L9"
    assert "IK_BOARD" in f and "בכבל ההזנה" in f["DU_HIGH"].message
    # the same circuit behind a 30 mA RCD is protected → info only
    d.board("MDB").groups[-1].device = Device(tag="RCD-P", kind="rcd", poles=2, rating_a=25, idn_ma=30)
    assert next(x for x in check(d) if x.code == "DISCONNECT").level == "info"


def test_sockets_need_30ma():
    from bee_cad.checks import check
    from bee_cad.model import Circuit, Group

    b = Board(id="DB", title="x", groups=[
        Group(tag="G1", circuits=[Circuit(tag="S1", device=Device(tag="S1", rating_a=16), phase="L1",
                                          load="בית תקע — מחסן", cable={"designation": "3X2.5"})]),
        Group(tag="G2", circuits=[Circuit(tag="S2", device=Device(tag="S2", kind="rcbo", rating_a=16, idn_ma=30),
                                          phase="L2", load="Sockets — office", cable={"designation": "3X2.5"})])])
    codes = [(x.code, x.where) for x in check(Design(boards=[b]))]
    assert ("RCD_SOCKETS", "DB / S1") in codes and ("RCD_SOCKETS", "DB / S2") not in codes


def test_brief_to_design():
    import yaml
    from bee_cad.checks import check
    from bee_cad.templates import BriefError, from_brief

    brief = yaml.safe_load((EXAMPLE.parent / "brief_house_pv.yaml").read_text(encoding="utf-8"))
    d = from_brief(brief, today="2026-10-18")
    mdb = d.board("MDB")
    assert mdb.incomer.rating_a == 40 and mdb.supply.cable.designation == "N2XY 4X10"
    q_inv = mdb.feeders[0]
    assert q_inv.device.rating_a == 32 and q_inv.cable.designation == "5X4 Cu N2XY"   # 15 kW → 21.7 A × 1.25
    ev = next(c for c in mdb.all_circuits() if "טעינה" in c.load)
    assert ev.phase == "L1-3" and ev.device.rating_a == 32
    assert next(g for g in mdb.groups if ev in g.circuits).device.rcd_type == "B"
    yard = next(c for c in mdb.all_circuits() if c.load == "תאורה — חוץ")
    assert yard.cable.designation == "3X4"                    # upsized for 35 m within the 3 % lighting limit
    phases = [c.phase for c in mdb.all_circuits() if c.device.poles == 1]
    assert max(phases.count(p) for p in ("L1", "L2", "L3")) - min(phases.count(p) for p in ("L1", "L2", "L3")) <= 1
    assert d.board("BUB").supply.kind == "inverter"
    assert not [x for x in check(d) if x.level in ("error", "warn")]
    with pytest.raises(BriefError):
        from_brief({"template": "house-pv", "supply": {"connection": "1X40A"}, "circuits": ["שקעים"]})


def test_calc_sheet(design: Design):
    from bee_cad.report import calc_rows

    rows = calc_rows(design)
    assert len(rows) == sum(len(b.all_circuits()) for b in design.boards)
    q = next(r for r in rows if r.tag == "Q-INV")
    assert round(q.ib, 1) == 21.7 and q.method == "C" and q.ok           # inverter current, not the 63 A breaker
    result = build(design, ("sld", "panel", "calc"))
    assert list(result)[-1] == "E-C01"


def test_studio_api():
    import json
    import threading
    import urllib.request
    from http.server import ThreadingHTTPServer

    import yaml

    from bee_cad.server import EXAMPLE_BRIEF, Handler, analyse

    brief = yaml.safe_load(EXAMPLE_BRIEF.read_text(encoding="utf-8"))
    data = analyse({"brief": brief, "sheets": False})
    assert data["summary"].startswith("בדיקות: 0 שגיאות, 0 אזהרות")
    assert any(r["tag"] == "Q-INV" and r["method"] == "C" for r in data["rows"])
    assert data["bom"] and data["design"]["boards"]

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        assert "סטודיו" in urllib.request.urlopen(base + "/").read().decode("utf-8")
        req = urllib.request.Request(base + "/api/design", json.dumps({"brief": brief}).encode(), method="POST")
        out = json.loads(urllib.request.urlopen(req).read())
        assert list(out["sheets"]) == ["E-01", "E-P02", "E-P03", "E-C01", "E-G01", "E-S01", "E-T01", "E-T02"]
        assert all("<svg" in s[:200] for s in out["sheets"].values())
        req = urllib.request.Request(base + "/api/export?fmt=csv", json.dumps({"brief": brief}).encode(), method="POST")
        with urllib.request.urlopen(req) as res:
            assert "filename*=UTF-8''" in res.headers["Content-Disposition"]
            assert res.read().decode("utf-8-sig").startswith("IEC 81346")
        bad = urllib.request.Request(base + "/api/design", b'{"brief": {"template": "nope"}}', method="POST")
        try:
            urllib.request.urlopen(bad)
            raise AssertionError("expected 422")
        except urllib.error.HTTPError as e:
            assert e.code == 422 and "תבנית" in json.loads(e.read())["error"]
    finally:
        httpd.shutdown()


def test_pv_dc_checks_match_app_rules():
    from bee_cad.checks import check
    from bee_cad.model import Design, PvArray, PvInverterSpec, PvModule, PvString
    from bee_cad.pv import string_window

    module = PvModule(wp=620, voc=49.5, vmp=41.6, isc=15.9, imp=14.9)
    inv = PvInverterSpec(kw=50, count=2, vdc_max=1100, mppt_min=200, mppt_max=1000, imppt_max=32, mppts=4)
    pv = PvArray(module=module, inverter=inv, strings=[PvString(mppt=1, count=2, modules=18)])
    assert string_window(pv) == (6, 20)               # same window as quote-engine string-sizing.ts
    pv.strings = [PvString(mppt=1, count=3, modules=21), PvString(mppt=2, count=1, modules=5),
                  PvString(mppt=9, count=1, modules=10)]
    codes = {f.code: f for f in check(Design(pv=pv))}
    assert codes["PV_VOC_COLD"].level == "error" and "20" in codes["PV_VOC_COLD"].fix
    assert codes["PV_MPPT_CURRENT"].level == "error"
    assert codes["PV_VMP_LOW"].level == "warn"
    assert codes["PV_MPPT_COUNT"].level == "error"   # MPPT9 on 2 × 4 inputs


def test_pv_connection_template():
    import yaml

    from bee_cad.bom import bom
    from bee_cad.checks import check
    from bee_cad.templates import BriefError, from_brief

    brief = yaml.safe_load((EXAMPLE.parent / "brief_pv_commercial.yaml").read_text(encoding="utf-8"))
    d = from_brief(brief, today="2026-10-25")
    assert [b.id for b in d.boards] == ["MDB", "PVB"] and d.boards[0].existing
    assert d.board("MDB").feeders[0].device.rating_a == 200 and d.board("MDB").feeders[0].device.kind == "mccb"
    assert [c.tag for c in d.board("PVB").feeders] == ["Q-INV1", "Q-INV2"]
    assert d.node("INV1").device.rcd_type == "B"
    assert round(d.pv.kwp(), 2) == 128.96
    f = check(d)
    assert not [x for x in f if x.level != "info"], [x.line() for x in f]
    rows = {(r.kind, r.spec): r for r in bom(d)}
    assert rows[("pv_module", "620W Voc 49.5V Isc 15.9A")].qty == 208
    assert rows[("dc_switch", "2P 1000V DC")].qty == 8
    assert not any(r.kind == "mccb" and "250A" in r.spec for r in rows.values())   # existing Q0 is not bought
    assert any(r.kind == "cable" and r.unit == "מ'" for r in rows.values())

    one = {"template": "pv-connection", "supply": {"connection": "1X40A"},
           "pv": {"inverter": {"kw": 8}, "cable_length_m": 15}}
    d1 = from_brief(one)
    assert d1.board("MDB").incomer.poles == 2 and d1.board("MDB").feeders[0].device.rating_a == 50
    try:
        from_brief({**one, "pv": {"inverter": {"kw": 15}}})
        raise AssertionError("expected BriefError")
    except BriefError as e:
        assert "חד-פאזי" in str(e)


def test_plans_endpoint_and_token(monkeypatch):
    import base64
    import json
    import threading
    import urllib.request
    from http.server import ThreadingHTTPServer

    import yaml

    from bee_cad.server import Handler

    brief = yaml.safe_load((EXAMPLE.parent / "brief_pv_commercial.yaml").read_text(encoding="utf-8"))
    monkeypatch.setenv("BEE_CAD_TOKEN", "t0k")
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        assert json.loads(urllib.request.urlopen(base + "/api/health").read())["ok"]
        body = json.dumps({"brief": brief}).encode()
        try:
            urllib.request.urlopen(urllib.request.Request(base + "/api/plans", body, method="POST"))
            raise AssertionError("expected 401")
        except urllib.error.HTTPError as e:
            assert e.code == 401
        req = urllib.request.Request(base + "/api/plans", body, method="POST", headers={"Authorization": "Bearer t0k"})
        out = json.loads(urllib.request.urlopen(req).read())
        assert out["summary"].startswith("בדיקות: 0 שגיאות")
        assert base64.b64decode(out["files"]["pdf"]["base64"])[:4] == b"%PDF"
        assert out["files"]["dxf"]["name"].endswith(".dxf")
        assert any(r["kind"] == "dc_switch" for r in out["bom"])
        dc = {r["mppt"]: r for r in out["dc"]}
        assert dc[1]["inverter"] == 1 and dc[5]["inverter"] == 2
        assert round(dc[1]["voc_cold"]) == round(18 * 49.5 * (1 + 0.0025 * 28))   # 953 V at −3 °C
        cables = base64.b64decode(out["files"]["cables"]["base64"]).decode("utf-8-sig")
        assert cables.startswith("מזהה,תוואי") and "H1Z2Z2-K 1X6" in cables
        assert {r["kind"] for r in out["cables"]} == {"AC", "DC"}
    finally:
        httpd.shutdown()


def test_derating_methods_and_aluminium():
    from bee_cad.calc import ampacity, group_factor, parse_cable

    cu = parse_cable("N2XY 5X16")
    assert ampacity(cu, "C", 3) == 96
    assert ampacity(cu, "E", 3) == 100                      # free air / perforated tray
    assert ampacity(cu, "D1", 3) == 75                      # duct in the ground, 20 °C soil
    assert ampacity(cu, "D1", 3, ambient_c=30) == round(75 * 0.93, 1)
    assert ampacity(cu, "C", 3, grouped=3) == round(96 * 0.70, 1)
    assert group_factor("E", 3) == 0.82 and group_factor("C", 1) == 1.0
    assert ampacity(parse_cable("N2XY 4X240"), "C", 3) == 500
    assert ampacity(parse_cable("NA2XY 4X10"), "C", 3) is None   # aluminium below 16 mm² is not in the estimate


def test_thermal_withstand_and_sub_board_fault_level():
    import yaml

    from bee_cad.calc import let_through_i2t, withstand_i2t, parse_cable
    from bee_cad.checks import check
    from bee_cad.model import Device
    from bee_cad.templates import from_brief

    mcb = Device(tag="M1", kind="mcb", poles=1, rating_a=16, curve="C")
    assert let_through_i2t(mcb, 3.0) == 15e3 and let_through_i2t(mcb, 10.0) == 70e3
    assert withstand_i2t(parse_cable("3X1.5")) < 35e3 < withstand_i2t(parse_cable("3X2.5"))

    brief = yaml.safe_load((EXAMPLE.parent / "brief_pv_commercial.yaml").read_text(encoding="utf-8"))
    brief["supply"]["ik_ka"] = 10
    findings = check(from_brief(brief, "2026-10-26"))
    ik = {f.where: f.message for f in findings if f.code == "IK_BOARD"}
    assert set(ik) == {"MDB", "PVB"}                              # the PV board inherits the fault level via its feeder
    assert float(ik["PVB"].split()[-1][:-2]) < float(ik["MDB"].split()[-1][:-2])


def test_pv_dc_cable_fuse_and_reverse_current():
    from bee_cad.checks import check
    from bee_cad.model import PvArray
    from bee_cad.pv import string_fuse_a

    def run(**over):
        pv = PvArray.model_validate({
            "module": {"wp": 620, "voc": 49.5, "vmp": 41.6, "isc": over.pop("isc", 15.9), "imp": 14.9,
                       "max_fuse_a": over.pop("max_fuse", 30)},
            "inverter": {"kw": 50, "count": 1, "vdc_max": 1100, "mppt_min": 200, "mppt_max": 1000, "imppt_max": 60, "mppts": 4},
            "strings": over.pop("strings"), **over})
        return {f.code: f for f in check(Design(pv=pv))}

    assert string_fuse_a(PvArray.model_validate({"module": {"wp": 620, "voc": 49.5, "vmp": 41.6, "isc": 15.9, "imp": 14.9},
                                                 "inverter": {"kw": 10}}).module) == 25
    f = run(strings=[{"mppt": 1, "count": 3, "modules": 18}], dc_cable_mm2=2.5)
    assert "25A" in f["PV_STRING_FUSE"].message and "PV_DC_CABLE" not in f      # 2.5 mm² carries 39 A ≥ the 25 A fuse
    f = run(strings=[{"mppt": 1, "count": 3, "modules": 18}], dc_cable_mm2=1.5, isc=22, max_fuse=40)
    assert f["PV_DC_CABLE"].level == "error"                      # 35 A fuse on a 30 A cable
    f = run(strings=[{"mppt": 1, "count": 3, "modules": 18}], max_fuse=20)
    assert f["PV_FUSE_RANGE"].level == "error"                    # 1.5 × Isc = 23.9 A > 20 A module limit
    f = run(strings=[{"mppt": 1, "count": 2, "modules": 18}], max_fuse=15)
    assert f["PV_REVERSE_CURRENT"].level == "error"
    f = run(strings=[{"mppt": 1, "count": 1, "modules": 10, "length_m": 80}], dc_cable_mm2=4)
    assert f["PV_DC_DROP"].level == "warn"


def test_israeli_rules():
    from bee_cad.checks import check
    from bee_cad.il import connection_kva, labels, submission
    from bee_cad.model import GridConnection, Node, Device

    g = GridConnection(phases=3, amps=40, inverter_kw=25)
    assert round(connection_kva(g), 1) == 27.6
    codes = {f.code: f for f in check(Design(grid=g))}
    assert codes["IL_CONNECTION_SHARE"].level == "warn" and "3X63A" in codes["IL_CONNECTION_SHARE"].fix
    assert codes["IL_EXPORT_LIMIT"].level == "warn"
    ok = {f.code for f in check(Design(grid=GridConnection(phases=3, amps=63, inverter_kw=25, export_limit_kw=15)))}
    assert "IL_CONNECTION_SHARE" not in ok and "IL_EXPORT_LIMIT" not in ok
    assert "IL_TRACK" in {f.code for f in check(Design(grid=GridConnection(amps=40, inverter_kw=10)))}
    bat = {f.code: f for f in check(Design(grid=GridConnection(phases=1, amps=40, inverter_kw=5, battery_kw=6)))}
    assert bat["IL_STORAGE_1P"].level == "error"
    inv = Node(id="INV", kind="inverter", label="ממיר", device=Device(tag="RCD", kind="rcd", poles=4, rcd_type="A"))
    assert "IL_RCD_TYPE" in {f.code for f in check(Design(grid=g, nodes=[inv]))}
    assert labels(Design(grid=g)) and any(not s["produced"] for s in submission())
    assert next(s for s in submission(Design(grid=g)) if s["id"] == "earthing")["produced"]


def test_earthing_and_schedule_sheets():
    import yaml

    from bee_cad.render import build
    from bee_cad.sheets_il import _bonding_items, pe_size
    from bee_cad.templates import from_brief

    assert pe_size("N2XY 4X95") == "PE 50 ממ\"ר Cu" and pe_size("5X25") == "PE 16 ממ\"ר Cu"
    brief = yaml.safe_load((EXAMPLE.parent / "brief_pv_commercial.yaml").read_text(encoding="utf-8"))
    d = from_brief(brief, "2026-10-26")
    items = {w: c for w, c, _ in _bonding_items(d)}
    assert items["מבנה נושא הפאנלים ומסגרות"] == "16 ממ\"ר Cu"            # 128.96 kWp > 15 kWp
    assert any(w.startswith("גוף ממיר") for w in items)
    sheets = build(d)
    assert {"E-G01", "E-S01"} <= set(sheets)
    house = Design.model_validate(json.loads(EXAMPLE.read_text(encoding="utf-8")))
    assert not any(k.endswith("G01") for k in build(house))                # no PV, no earthing plan sheet


def test_demand_and_commissioning_sheet():
    import yaml

    from bee_cad.checks import check
    from bee_cad.load import board_demand
    from bee_cad.render import build
    from bee_cad.templates import from_brief
    from bee_cad.tests_sheet import test_rows

    house = from_brief(yaml.safe_load((EXAMPLE.parent / "brief_house_pv.yaml").read_text(encoding="utf-8")), "2026-10-26")
    dm = board_demand(house.boards[0])
    assert dm.demand_kw < dm.installed_kw and dm.suggested
    assert any(f.code == "LOAD_DEMAND" and "קרוב לגבול" in f.message for f in check(house))
    pv = from_brief(yaml.safe_load((EXAMPLE.parent / "brief_pv_commercial.yaml").read_text(encoding="utf-8")), "2026-10-26")
    rows = test_rows(pv)
    assert sum(r.group == "DC" and r.test.startswith("קוטביות") for r in rows) == 8
    assert any(r.group == "RCD" and "Type B" in r.test for r in rows)
    assert "E-T01" in build(pv)


def test_site_layout_sheet():
    import yaml

    from bee_cad.checks import check
    from bee_cad.render import build
    from bee_cad.site import pick_scale
    from bee_cad.templates import BriefError, from_brief

    assert pick_scale(42, 21, 300, 200) == 200 and pick_scale(4, 3, 300, 200) == 50
    brief = yaml.safe_load((EXAMPLE.parent / "brief_pv_commercial.yaml").read_text(encoding="utf-8"))
    brief["site_layout"] = json.loads((EXAMPLE.parent / "site_layout_barn.json").read_text(encoding="utf-8"))
    d = from_brief(brief, "2026-10-26")
    assert len(d.site.roofs) == 2 and len(d.site.roofs[0].panels) == 144
    sheets = build(d)
    assert list(sheets)[0] == "E-A01"
    assert any(f.code == "SITE_PANELS" for f in check(d))          # 272 on the roofs, 208 in the strings
    brief["site_layout"] = {"roofs": [{"outline": "x"}]}
    with pytest.raises(BriefError):
        from_brief(brief)
