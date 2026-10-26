"""bee-cad studio — a local web screen over the engine: fill the job brief, see the sheets, the
calculation table and the findings update as you type, download DXF / PDF / BOM.

    bee-cad serve            # http://127.0.0.1:8765

Standard library only (http.server); the page is one HTML file in bee_cad/web.
"""
from __future__ import annotations

import base64
import hmac
import json
import os
import tempfile
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

import yaml

from .bom import bom, write_csv
from .il import labels, submission
from .tests_sheet import as_dicts as test_dicts, test_rows
from .cables import as_dicts as cable_dicts, cable_rows, write_cables_csv
from .checks import as_dicts, check, summary
from .model import Design
from .pv import dc_rows
from .render import A3_H, A3_W, _visual_copy, build, merge_pdfs, render_pdf, save_dxf
from .report import calc_rows
from .templates import TEMPLATES, BriefError, from_brief

EXAMPLE_BRIEF = Path(__file__).resolve().parents[1] / "examples" / "brief_house_pv.yaml"


def sheet_svgs(design: Design) -> dict[str, str]:
    """Every sheet of the set as SVG (text as outlines, Hebrew in visual order), keyed by sheet number."""
    from ezdxf.addons.drawing import Frontend, RenderContext, layout, svg
    from ezdxf.addons.drawing.config import Configuration, LineweightPolicy
    from ezdxf.addons.drawing.properties import LayoutProperties
    from ezdxf.math import BoundingBox

    result = build(design, ("sld", "panel", "calc", "earth", "schedule", "tests"))
    if not result:
        return {}
    doc = _visual_copy(next(iter(result.values()))[0])
    msp = doc.modelspace()
    props = LayoutProperties.from_layout(msp)
    props.set_colors("#FFFFFF")
    cfg = Configuration(lineweight_policy=LineweightPolicy.ABSOLUTE, min_lineweight=0.13)
    page = layout.Page(A3_W, A3_H, layout.Units.mm, margins=layout.Margins.all(0))
    out: dict[str, str] = {}
    for i, no in enumerate(result):
        backend = svg.SVGBackend()
        Frontend(RenderContext(doc), backend, config=cfg).draw_layout(msp, finalize=False, layout_properties=props)
        x0 = (A3_W + 30.0) * i
        out[no] = backend.get_string(page, settings=layout.Settings(fit_page=False, scale=1.0),
                                     render_box=BoundingBox([(x0, 0.0), (x0 + A3_W, A3_H)]))
    return out


def design_from_request(body: dict[str, Any]) -> Design:
    if "design" in body:
        return Design.model_validate(body["design"])
    return from_brief(body.get("brief") or {})


def analyse(body: dict[str, Any]) -> dict[str, Any]:
    design = design_from_request(body)
    findings = check(design)
    return {
        "summary": summary(findings),
        "findings": as_dicts(findings),
        "rows": [asdict(r) for r in calc_rows(design)],
        # one row per MPPT input: Voc at −3 °C, Vmp cold / hot (70 °C cell), current (bee_cad.pv)
        "dc": [asdict(r) for r in dc_rows(design.pv)] if design.pv else [],
        "bom": [asdict(r) for r in bom(design)],
        "cables": cable_dicts(cable_rows(design)),
        "labels": [asdict(x) for x in labels(design)],
        "submission": submission(),
        "tests": test_dicts(test_rows(design)),
        "sheets": sheet_svgs(design) if body.get("sheets", True) else {},
        "design": json.loads(design.model_dump_json(exclude_none=True)),
    }


def plans(body: dict[str, Any]) -> dict[str, Any]:
    """Everything the app files under a project in one call: checks, BOM rows and the PDF set, DXF and BOM CSV."""
    out = analyse({**body, "sheets": False})
    out.pop("rows")
    out["files"] = {}
    for fmt in ("pdf", "dxf", "csv", "cables"):
        data, ctype, name = export(body, fmt)
        out["files"][fmt] = {"name": name, "type": ctype, "base64": base64.b64encode(data).decode("ascii")}
    return out


def export(body: dict[str, Any], fmt: str) -> tuple[bytes, str, str]:
    design = design_from_request(body)
    check(design)
    stem = (design.title.project or "design").replace(" ", "_")[:40]
    if fmt == "json":
        return design.model_dump_json(indent=2, exclude_none=True).encode("utf-8"), "application/json", f"{stem}.json"
    if fmt == "csv":
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "bom.csv"
            write_csv(bom(design), p)
            return p.read_bytes(), "text/csv; charset=utf-8", f"{stem}_BOM.csv"
    if fmt == "cables":
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "cables.csv"
            write_cables_csv(cable_rows(design), p)
            return p.read_bytes(), "text/csv; charset=utf-8", f"{stem}_CABLES.csv"
    result = build(design)
    doc = next(iter(result.values()))[0]
    with tempfile.TemporaryDirectory() as tmp:
        if fmt == "dxf":
            p = Path(tmp) / f"{stem}.dxf"
            save_dxf(doc, p)
            return p.read_bytes(), "application/dxf", p.name
        pages = []
        vdoc = _visual_copy(doc)
        for i, _ in enumerate(result):
            pp = Path(tmp) / f"p{i}.pdf"
            render_pdf(vdoc, pp, sheet_index=i, already_visual=True)
            pages.append(pp)
        out = Path(tmp) / f"{stem}_SET.pdf"
        merge_pdfs(pages, out)
        return out.read_bytes(), "application/pdf", out.name
    raise ValueError(fmt)


class Handler(BaseHTTPRequestHandler):
    server_version = "bee-cad"

    def log_message(self, fmt: str, *args: Any) -> None:  # quiet
        pass

    def _send(self, code: int, data: bytes, ctype: str, filename: str | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if filename:
            # Hebrew project names: ASCII fallback plus the UTF-8 name (RFC 6266)
            ascii_name = filename.encode("ascii", "replace").decode().replace("?", "_")
            self.send_header("Content-Disposition",
                             f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}")
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code: int, obj: Any) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _authorized(self) -> bool:
        """With BEE_CAD_TOKEN set (a service on the app's network), every /api call needs that bearer token."""
        token = os.environ.get("BEE_CAD_TOKEN", "")
        if not token:
            return True
        got = self.headers.get("Authorization", "")
        return hmac.compare_digest(got.encode(), f"Bearer {token}".encode())

    def do_GET(self) -> None:
        url = urlparse(self.path)
        if url.path == "/api/health":
            self._json(200, {"ok": True, "templates": sorted(TEMPLATES)})
        elif url.path.startswith("/api/") and not self._authorized():
            self._json(401, {"error": "נדרש אסימון"})
        elif url.path in ("/", "/index.html"):
            html = resources.files("bee_cad").joinpath("web/index.html").read_bytes()
            self._send(200, html, "text/html; charset=utf-8")
        elif url.path == "/api/example":
            self._json(200, yaml.safe_load(EXAMPLE_BRIEF.read_text(encoding="utf-8")))
        else:
            self._json(404, {"error": "לא נמצא"})

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if not self._authorized():
            self._json(401, {"error": "נדרש אסימון"})
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            if url.path == "/api/design":
                self._json(200, analyse(body))
            elif url.path == "/api/plans":
                self._json(200, plans(body))
            elif url.path == "/api/export":
                fmt = parse_qs(url.query).get("fmt", ["pdf"])[0]
                data, ctype, name = export(body, fmt)
                self._send(200, data, ctype, name)
            else:
                self._json(404, {"error": "לא נמצא"})
        except BriefError as e:
            self._json(422, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 — the screen shows the message instead of a dead request
            self._json(500, {"error": f"{type(e).__name__}: {e}"})


def serve(host: str = "127.0.0.1", port: int = 8765) -> None:
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"bee-cad studio: http://{host}:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
