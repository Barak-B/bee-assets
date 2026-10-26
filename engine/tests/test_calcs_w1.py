"""Wave 1 calculations: installation methods, grouping, overload, thermal withstand, PE, IEC 62548 strings."""
import pytest

from bee_cad.calc import (ampacity, grouping_factor, ik3_max_ka, let_through_i2t, overload_ok, parse_cable,
                          pe_min_mm2, source_impedance, voltage_drop_pct, withstand_i2t)
from bee_cad.checks import check
from bee_cad.model import (Board, Busbar, Cable, Circuit, Design, Device, Group, PvArray, PvInverterSpec, PvModule,
                           PvString, Supply)
from bee_cad.pv import dc_drop_pct, dc_rows, fuse_rating, fuses_needed, string_cable_required_a


def test_methods_and_grouping():
    s = parse_cable("N2XY 5X16")
    assert ampacity(s, "E", 3) == 100 and ampacity(s, "D1", 3) == 75
    assert ampacity(parse_cable("4X240"), "C", 3) == 403
    assert grouping_factor("B1", 1) == 1.0 and grouping_factor("B1", 3) == 0.70
    assert grouping_factor("B1", 10) == 0.50 and grouping_factor("C", 30) == 0.70   # between / past the entries
    assert ampacity(parse_cable("3X2.5"), "B1", 2, grouped=3) == round(24 * 0.70, 1)
    # ground temperature: reference 20 °C for D1, 30 °C in air
    assert ampacity(s, "D1", 3, ambient_c=25) == round(75 * 0.96, 1)
    assert ampacity(s, "C", 3, ambient_c=25) == 96


def test_aluminium_and_power_factor_drop():
    cu = voltage_drop_pct(Cable(designation="4X50", length_m=100), 100, True)
    al = voltage_drop_pct(Cable(designation="NA2XY 4X50", length_m=100), 100, True)
    assert al == pytest.approx(cu * 0.036 / 0.0225)
    lagging = voltage_drop_pct(Cable(designation="4X50", length_m=100), 100, True, cos_phi=0.8)
    assert lagging < cu       # resistive part ×0.8 outweighs the small reactive part on a 50 mm² cable
    zs = source_impedance(10)
    assert ik3_max_ka(zs, [Cable(designation="NA2XY 4X50", length_m=50)]) < ik3_max_ka(zs, [Cable(designation="4X50", length_m=50)])


def test_overload_and_pe():
    assert overload_ok(14, 16, 24) and not overload_ok(18, 16, 24) and not overload_ok(10, 32, 24)
    assert not overload_ok(10, 16, 17, kind="fuse") and overload_ok(10, 16, 18, kind="fuse")
    assert overload_ok(10, 16, None) is None
    assert (pe_min_mm2(10), pe_min_mm2(25), pe_min_mm2(95)) == (10, 16, 47.5)


def test_thermal_withstand():
    mcb16 = Device(tag="M1", kind="mcb", poles=1, rating_a=16, curve="C")
    assert let_through_i2t(mcb16, 6) == 40_000
    assert let_through_i2t(mcb16, 5.25) == pytest.approx(28_000 + 12_000 * 0.75 / 1.5)
    assert let_through_i2t(Device(tag="X", kind="mcb", rating_a=63), 6) is None      # no class-3 figure above 32A
    assert withstand_i2t(parse_cable("3X1.5")) == pytest.approx((115 * 1.5) ** 2)
    assert withstand_i2t(parse_cable("N2XY 5X10")) == pytest.approx((143 * 10) ** 2)
    assert withstand_i2t(parse_cable("NA2XY 4X50")) == pytest.approx((94 * 50) ** 2)


def _board(circuits, ik=6.0):
    return Design(boards=[Board(id="MDB", title="t", supply=Supply(ik_ka=ik),
                                incomer=Device(tag="Q0", kind="mcb", poles=4, rating_a=40, curve="C", icu_ka=10),
                                busbar=Busbar(rating_a=63),
                                groups=[Group(tag="RCD-A", device=Device(tag="RCD-A", kind="rcd", poles=4, rating_a=40,
                                                                        idn_ma=30, rcd_type="A"), circuits=circuits)])])


def test_checks_thermal_ib_and_grouping():
    light = Circuit(tag="M1", device=Device(tag="M1", poles=1, rating_a=16, curve="C"), phase="L1",
                    cable=Cable(designation="3X1.5", length_m=10), load="תאורה")
    oven = Circuit(tag="M2", device=Device(tag="M2", poles=1, rating_a=16, curve="C"), phase="L2",
                   cable=Cable(designation="3X2.5", length_m=10), load="תנור", load_kw=4.6)
    bunched = Circuit(tag="M3", device=Device(tag="M3", poles=1, rating_a=20, curve="C"), phase="L3",
                      cable=Cable(designation="3X2.5", length_m=10, grouped=4), load="מזגן")
    codes = {(f.code, f.where.split(" / ")[-1]) for f in check(_board([light, oven, bunched]))}
    assert ("THERMAL", "M1") in codes            # 40 000 A²s > (115·1.5)² ≈ 29 756
    assert ("THERMAL", "M2") not in codes
    assert ("IB_OVER_IN", "M2") in codes         # 4.6 kW / 230 V = 20 A on a 16 A breaker
    assert ("CABLE_OVERLOAD", "M3") in codes     # 24 A × 0.65 = 15.6 A < 20 A
    low = {f.code for f in check(_board([light], ik=3.0))}
    assert "THERMAL" not in low                   # 17 000 A²s at 3 kA


MOD = dict(wp=620, voc=49.5, vmp=41.6, isc=15.9, imp=14.9)


def test_iec62548_fuses_and_cables():
    m = PvModule(**MOD, fuse_max_a=30)
    assert not fuses_needed(m, 2)                 # 1 × 1.25 × 15.9 = 19.9 A ≤ 30 A
    assert fuses_needed(m, 3)                     # 2 × 19.9 = 39.75 A > 30 A
    assert fuse_rating(m) == 25                   # 23.85 ≤ In ≤ min(38.2, 30)
    assert fuse_rating(PvModule(**MOD, fuse_max_a=20)) is None
    assert not fuses_needed(PvModule(**MOD), 2) and fuses_needed(PvModule(**MOD), 3)    # unknown rating → from 3
    assert string_cable_required_a(m, 1) == pytest.approx(19.875)
    assert string_cable_required_a(m, 3) == 25
    s = PvString(mppt=1, count=1, modules=18, cable_mm2=4, cable_m=40)
    assert dc_drop_pct(m, s) == pytest.approx(100 * 2 * 40 * 0.0213 / 4 * 14.9 / (18 * 41.6))


def test_pv_checks_and_rows():
    inv = PvInverterSpec(kw=50, vdc_max=1100, mppt_min=200, mppt_max=1000, imppt_max=60, mppts=4, strings_per_mppt=4)
    pv = PvArray(module=PvModule(**MOD, fuse_max_a=30), inverter=inv, strings=[
        PvString(mppt=1, count=3, modules=18, cable_mm2=4, cable_m=30),
        PvString(mppt=2, count=1, modules=18, cable_mm2=1.5, cable_m=150)])
    f = {(x.code, x.where.split("MPPT")[-1][:1]): x for x in check(Design(pv=pv))}
    assert f[("PV_STRING_FUSE", "1")].level == "info" and "25A" in f[("PV_STRING_FUSE", "1")].message
    assert ("PV_CABLE", "1") not in f
    assert ("PV_CABLE", "2") not in f             # one string: 19.9 A on 1.5 mm² (30 A) is fine…
    assert f[("PV_DC_DU", "2")].level == "warn"   # …but 150 m of it drops 4.7 %
    rows = dc_rows(pv)
    assert rows[0].fuse_a == 25 and rows[1].fuse_a is None and rows[0].cable_iz == 55
    # three unfused strings (module takes 45 A back): the cable must carry 2 × 19.9 A
    pv.module.fuse_max_a = 45
    pv.strings[0].cable_mm2 = 1.5
    f = {(x.code, x.where.split("MPPT")[-1][:1]): x for x in check(Design(pv=pv))}
    assert f[("PV_CABLE", "1")].level == "error" and "2.5" in f[("PV_CABLE", "1")].fix


def test_template_sizes_string_cables():
    from pathlib import Path

    import yaml

    from bee_cad.bom import bom
    from bee_cad.templates import from_brief

    brief = yaml.safe_load((Path(__file__).resolve().parents[1] / "examples" / "brief_pv_commercial.yaml")
                           .read_text(encoding="utf-8"))
    d = from_brief(brief, today="2026-10-26")
    by_mppt = {s.mppt: s.cable_mm2 for s in d.pv.strings}
    assert by_mppt[1] == 4 and by_mppt[5] == 6          # 55 m north strings: 4 mm² drops 1.3 %, 6 mm² < 1 %
    brief["pv"]["strings"][4]["cable_mm2"] = 4          # an explicit size is kept
    assert from_brief(brief).pv.strings[4].cable_mm2 == 4
    solar = {r.spec: r.qty for r in bom(d) if r.item == "כבל סולארי"}
    assert solar == {"H1Z2Z2-K 1X4": 4 * 154, "H1Z2Z2-K 1X6": 4 * 121}   # ceil(2·2·35·1.1), 2·1·55·1.1 per MPPT
