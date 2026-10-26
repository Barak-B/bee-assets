"""Wave 2: connection capacity, export cap, licence, RCD types, island disconnection, DC surge protection."""
from bee_cad.bom import bom
from bee_cad.checks import check
from bee_cad.grid import connection_kva, licence_for, parse_connection
from bee_cad.model import (Board, Busbar, Cable, Circuit, Design, Device, Group, Node, PvArray, PvInverterSpec,
                           PvModule, PvString, Supply)

MOD = dict(wp=620, voc=49.5, vmp=41.6, isc=15.9, imp=14.9)


def test_connection_maths():
    assert parse_connection("3X63A") == (3, 63) and parse_connection("1X40A") == (1, 40)
    assert parse_connection("40A") == (1, 40) and parse_connection("") is None
    assert round(connection_kva(3, 40), 1) == 27.7 and round(connection_kva(1, 40), 1) == 9.2
    assert licence_for(40) == "חשמלאי מעשי" and licence_for(63) == "חשמלאי מוסמך"
    assert licence_for(250) == "חשמלאי ראשי" and licence_for(1000) == "מהנדס חשמל"


def _site(meter="3X40A", kw=30.0, count=1, export=None, spd_internal=False, lps=False):
    mdb = Board(id="MDB", title="t", supply=Supply(meter=meter, export_limit_kw=export), existing=True,
                incomer=Device(tag="Q0", kind="mcb", poles=4, rating_a=40))
    pv = PvArray(module=PvModule(**MOD), lps=lps,
                 inverter=PvInverterSpec(kw=kw, count=count, vdc_max=1100, mppts=2, dc_spd_internal=spd_internal),
                 strings=[PvString(mppt=1, modules=18), PvString(mppt=2, modules=16)])
    return Design(boards=[mdb], pv=pv)


def _codes(d):
    return {(f.code, f.level) for f in check(d)}


def test_connection_capacity_and_export_cap():
    assert ("CONNECTION", "error") in _codes(_site(kw=30))        # 30 kW > 27.7 kVA of 3X40A
    f = next(x for x in check(_site(kw=30)) if x.code == "CONNECTION")
    assert "3X63A" in f.fix
    assert ("CONNECTION", "info") in _codes(_site(kw=25))
    assert ("CONNECTION_MV", "warn") in _codes(_site(meter="3X1250A", kw=350, count=2))
    assert ("EXPORT_LIMIT", "info") in _codes(_site(kw=25, export=0))
    assert not [c for c in _codes(_site(kw=25, export=50)) if c[0] == "EXPORT_LIMIT"]
    rows = {r.kind for r in bom(_site(kw=25, export=0))}
    assert "export_limiter" in rows and "export_limiter" not in {r.kind for r in bom(_site(kw=25))}


def test_dc_spd():
    f = [x for x in check(_site(kw=25)) if x.code == "PV_DC_SPD"]
    assert f and "953" in f[0].message and "Type 2" in f[0].message
    assert "Type 1+2" in next(x for x in check(_site(kw=25, lps=True)) if x.code == "PV_DC_SPD").message
    assert not [x for x in check(_site(kw=25, spd_internal=True)) if x.code == "PV_DC_SPD"]
    spd = [r for r in bom(_site(kw=25)) if r.kind == "spd_dc"]
    assert sum(r.qty for r in spd) == 2 and spd[0].spec.startswith("T2 Ucpv 1000V")


def test_rcd_types_and_island():
    inv = Node(id="INV", kind="inverter", label="ממיר", rating="10 kW",
               device=Device(tag="RCD-INV", kind="rcd", poles=4, rating_a=40, idn_ma=300, rcd_type="AC"))
    ev = Circuit(tag="M1", device=Device(tag="M1", poles=3, rating_a=32, curve="C"), phase="L1-3",
                 cable=Cable(designation="5X6"), load="עמדת טעינה")
    mdb = Board(id="MDB", title="t", groups=[Group(tag="RCD-A", device=Device(tag="RCD-A", kind="rcd", poles=4,
                                                                             rating_a=40, idn_ma=30, rcd_type="AC"),
                                                  circuits=[ev])])
    fridge = Circuit(tag="B1", device=Device(tag="B1", poles=1, rating_a=16, curve="C"), phase="L1",
                     cable=Cable(designation="3X2.5"), load="מקרר")
    lights = Circuit(tag="B2", device=Device(tag="B2", poles=1, rating_a=10, curve="C"), phase="L2",
                     cable=Cable(designation="3X1.5"), load="תאורה")
    bub = Board(id="BUB", title="חיוני", supply=Supply(kind="inverter", earthing=""), busbar=Busbar(),
                groups=[Group(tag="G", circuits=[fridge]),
                        Group(tag="RCD-B", device=Device(tag="RCD-B", kind="rcd", poles=2, rating_a=40, idn_ma=30,
                                                         rcd_type="A"), circuits=[lights])])
    found = {(f.code, f.where) for f in check(Design(boards=[mdb, bub], nodes=[inv]))}
    assert ("RCD_TYPE", "INV") in found and ("RCD_TYPE", "MDB / M1") in found
    assert ("ISLAND_DISCONNECT", "BUB / B1") in found and ("ISLAND_DISCONNECT", "BUB / B2") not in found
