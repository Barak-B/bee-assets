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
