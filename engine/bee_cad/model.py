"""Canonical design model — the single source of truth every drawing reads.

A *board* (לוח) is a tree: supply → incomer → busbar → groups (RCD / sub-bus) → circuits.
Feeders leave a board to another board or to a source/consumer node (inverter, battery,
generator, transformer, PV array). The same model drives the single-line sheet and the
panel front-view sheet, so ratings, tags and counts can never disagree between sheets.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

DeviceKind = Literal[
    "mcb",        # מפסק זעיר
    "mccb",       # מפסק יצוק (מא"ז)
    "acb",        # מפסק אוויר
    "rcd",        # מפסק פחת
    "rcbo",       # מפסק זעיר משולב פחת
    "switch",     # מנתק / מפסק עומס
    "fuse",       # נתיך
    "spd",        # מגן ברקים
    "meter",      # מונה
    "ct",         # משנה זרם
    "contactor",  # מגען
    "terminal",   # מהדק
]

Phase = Literal["L1", "L2", "L3", "L1-3", ""]


class Device(BaseModel):
    """A protective / switching device on a line."""

    tag: str
    kind: DeviceKind = "mcb"
    poles: int = 1
    rating_a: Optional[float] = None
    curve: Optional[str] = None          # B / C / D (MCB) or trip unit name (MCCB)
    idn_ma: Optional[int] = None         # RCD sensitivity
    rcd_type: Optional[str] = None       # A / AC / B / F
    icu_ka: Optional[float] = None       # breaking capacity
    lock: bool = False                   # נעילה במצב מופסק
    note: Optional[str] = None           # free text shown under the device
    manufacturer: Optional[str] = None
    catno: Optional[str] = None          # catalogue number (BOM)
    width_mm: Optional[float] = None     # override of the modular width on the panel view

    def label_lines(self) -> list[str]:
        """Rating text shown beside the symbol on the single-line."""
        out: list[str] = []
        if self.rating_a is not None:
            cur = self.curve or ""
            r = f"{self.rating_a:g}A"
            if self.kind in ("mcb", "rcbo") and cur:
                out.append(f"{self.poles}P {cur}{self.rating_a:g}")
            else:
                out.append(f"{self.poles}P {r}")
        else:
            out.append(f"{self.poles}P")
        if self.idn_ma is not None:
            out.append(f"{self.idn_ma}mA")
        if self.rcd_type:
            out.append(f"Type {self.rcd_type}")
        if self.icu_ka:
            out.append(f"{self.icu_ka:g}kA")
        if self.note:
            out.append(self.note)
        return out


class Cable(BaseModel):
    designation: str                     # e.g. "N2XY 4X10" / "3X2.5"
    length_m: Optional[float] = None
    du_pct: Optional[float] = None       # voltage drop, computed elsewhere
    method: Optional[str] = None         # installation method (IEC 60364-5-52): B1 / C / E / D1
    ambient_c: Optional[float] = None    # air along the route when above 30 °C (roof, outdoor); soil for D1
    grouped: Optional[int] = None        # circuits run together with this one (bunched, or on one tray for E)


class Circuit(BaseModel):
    """An outgoing final circuit from a group / busbar."""

    tag: str
    device: Device
    phase: Phase = ""
    cable: Optional[Cable] = None
    load: str = ""                        # Hebrew description of the consumer
    load_kw: Optional[float] = None
    kind: Literal["final", "feeder"] = "final"
    rcd: Optional[Device] = None          # second device in series (e.g. RCD-INV after Q-INV)
    to_board: Optional[str] = None        # feeder target board id
    to_node: Optional[str] = None         # feeder target node id (inverter, battery...)


class Group(BaseModel):
    """A sub-bus behind an RCD or a sub-main breaker."""

    tag: str
    device: Optional[Device] = None       # the RCD / sub-main; None = plain busbar section
    circuits: list[Circuit] = Field(default_factory=list)
    title: str = ""


class Supply(BaseModel):
    kind: Literal["utility", "board", "generator", "transformer", "inverter"] = "utility"
    label: str = "חח\"י"
    meter: Optional[str] = None           # "3X40A"
    voltage: str = "400/230V"
    frequency: str = "50Hz"
    cable: Optional[Cable] = None
    earthing: Literal["TN-C-S", "TN-S", "TT", "IT", ""] = "TN-C-S"
    from_board: Optional[str] = None
    ik_ka: Optional[float] = None         # prospective 3-phase short-circuit current at the origin (from IEC / the transformer)


class Busbar(BaseModel):
    label: str = "L1,L2,L3,N"
    rating_a: Optional[float] = None
    icw_ka: Optional[float] = None
    note: str = ""


class Board(BaseModel):
    id: str
    title: str                            # "לוח ראשי MDB"
    supply: Supply = Field(default_factory=Supply)
    incomer: Optional[Device] = None
    busbar: Busbar = Field(default_factory=Busbar)
    groups: list[Group] = Field(default_factory=list)
    feeders: list[Circuit] = Field(default_factory=list)
    spd: Optional[Device] = None
    ct: Optional[str] = None              # "3×CT" note on the incomer
    enclosure: Optional["Enclosure"] = None
    notes: list[str] = Field(default_factory=list)
    existing: bool = False                # board already installed: its incomer, enclosure and supply cable are not bought

    def all_circuits(self) -> list[Circuit]:
        out: list[Circuit] = []
        for g in self.groups:
            out.extend(g.circuits)
        out.extend(self.feeders)
        return out


class Node(BaseModel):
    """A non-board element on the single-line: inverter, battery, generator, PV, transformer."""

    id: str
    kind: Literal["inverter", "battery", "generator", "pv", "transformer", "load", "bess", "ups", "meter", "grid", "pcs", "rmu"]
    label: str
    sublabel: str = ""
    rating: str = ""                      # "15 kW" / "630 kVA 33/0.4kV"
    device: Optional[Device] = None       # isolator at the node, if any
    cable: Optional[Cable] = None


class MVCell(BaseModel):
    """One switchgear cell (תא) of an MV board, drawn top → bottom: busbar tap, breaker, CT, earthing switch, VPIS, cable."""

    tag: str                              # +H1
    device_tag: str                       # CB1 / VT / PM / Q1
    title: str = ""                       # "מפסק ראשי — תפעול משותף עם חח\"י"
    kind: Literal["incomer", "feeder", "vt", "metering", "coupler"] = "feeder"
    breaker: Optional[Device] = None      # VCB: kind "acb" draws a draw-out breaker
    ct: Optional[str] = None              # "3× 200/1A 5P20 10VA"
    vt: Optional[str] = None              # "33kV/√3 / 100V/√3 / 100V/3"
    relay: Optional[str] = None           # "50/51, 50N/51N, 67N, 27/59, 81U/O"
    earthing_switch: bool = True
    vpis: bool = True
    metering: Optional[str] = None        # "תא מניית ייצור דו-כיווני"
    cable: Optional[Cable] = None         # outgoing / incoming cable
    to: Optional[str] = None              # node id below the cell (transformer, PCS, grid)
    direction: Literal["down", "up"] = "down"   # incomer cable arrives from the top (grid) when "up"
    note: str = ""


class MVBoard(BaseModel):
    id: str
    title: str                            # "מסדר מ\"ג — חדר פרטי"
    voltage: str = "33kV"
    busbar: Busbar = Field(default_factory=lambda: Busbar(label="L1 L2 L3"))
    cells: list[MVCell] = Field(default_factory=list)
    aux: str = ""                         # "24VDC"
    notes: list[str] = Field(default_factory=list)


class Enclosure(BaseModel):
    """Panel enclosure geometry for the front view."""

    model: str = "generic"
    manufacturer: str = ""
    width_mm: float = 500
    height_mm: float = 650
    depth_mm: float = 160
    rows: int = 3
    modules_per_row: int = 18
    row_pitch_mm: float = 150
    mounting: Literal["flush", "surface", "floor"] = "surface"
    ip: str = "IP40"
    door: bool = True
    plinth_mm: float = 0
    bottom_gland_plate: bool = True


class TitleBlock(BaseModel):
    designer: str = "ברק הנדסת חשמל"
    project: str = ""
    site: str = ""
    client: str = ""
    sheet_no: str = "E-01"
    sheet_title: str = ""
    revision: str = "A"
    date: str = ""
    scale: str = "-"
    sheet_index: int = 1
    sheet_count: int = 1
    status: Literal["לעיון", "לאישור", "למכרז", "לביצוע", "AS-MADE"] = "לאישור"
    revisions: list[tuple[str, str, str]] = Field(default_factory=list)  # (rev, date, text)


class PvModule(BaseModel):
    """Datasheet values of one PV module (STC), as the app's string sizing passes them."""

    wp: float
    voc: float
    vmp: float
    isc: float
    imp: float
    beta_voc_pct: float = -0.25           # %/°C, Voc
    gamma_pmax_pct: float = -0.29         # %/°C, Pmax (stand-in for Vmp when hot)
    max_fuse_a: Optional[float] = None    # datasheet "maximum series fuse rating"


class PvInverterSpec(BaseModel):
    kw: float
    count: int = 1
    model: str = ""
    vdc_max: Optional[float] = None       # max DC input voltage
    mppt_min: Optional[float] = None
    mppt_max: Optional[float] = None
    imppt_max: Optional[float] = None     # max input current per MPPT
    mppts: Optional[int] = None           # MPPT inputs per unit
    strings_per_mppt: Optional[int] = None


class PvString(BaseModel):
    mppt: int                             # numbered 1..n across the whole site (inverter k has mppts·(k-1)+1 …)
    count: int = 1                        # parallel strings on this MPPT
    modules: int                          # modules in series per string
    face: str = ""
    length_m: Optional[float] = None      # one-way string cable run to the inverter, when it differs from the array's


class PvArray(BaseModel):
    """The DC side: modules, strings per MPPT and the inverter limits they are checked against."""

    module: PvModule
    inverter: PvInverterSpec
    strings: list[PvString] = Field(default_factory=list)
    modules_line: str = ""
    dc_cable_mm2: float = 6.0             # string cable (H1Z2Z2-K, EN 50618)
    dc_length_m: Optional[float] = None   # typical one-way string run, roof to inverter

    def modules_total(self) -> int:
        return sum(s.count * s.modules for s in self.strings)

    def kwp(self) -> float:
        return self.modules_total() * self.module.wp / 1000.0


class Design(BaseModel):
    """The whole project model."""

    title: TitleBlock = Field(default_factory=TitleBlock)
    boards: list[Board] = Field(default_factory=list)
    mv_boards: list["MVBoard"] = Field(default_factory=list)
    nodes: list[Node] = Field(default_factory=list)
    legend: bool = True
    notes: list[str] = Field(default_factory=list)
    pv: Optional[PvArray] = None          # DC side for the string checks (bee_cad.pv)

    def board(self, board_id: str) -> Board:
        for b in self.boards:
            if b.id == board_id:
                return b
        raise KeyError(board_id)

    def node(self, node_id: str) -> Node:
        for n in self.nodes:
            if n.id == node_id:
                return n
        raise KeyError(node_id)


Board.model_rebuild()
