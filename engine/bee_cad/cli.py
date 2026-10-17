"""bee-cad command line.

    bee-cad render examples/house_karka.json --out out/house --png
    bee-cad render design.yaml --sheets sld --mode shx
    bee-cad validate design.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

from .archive import archive
from .model import Design
from .render import SHEET_KINDS, build, merge_pdfs, render_pdf, render_png, save_dxf


def load_design(path: Path) -> Design:
    text = path.read_text(encoding="utf-8")
    data = yaml.safe_load(text) if path.suffix.lower() in (".yaml", ".yml") else json.loads(text)
    return Design.model_validate(data)


def cmd_render(args: argparse.Namespace) -> int:
    design = load_design(Path(args.design))
    out = Path(args.out)
    stem = args.stem or Path(args.design).stem
    sheets = args.sheets.split(",") if args.sheets else list(SHEET_KINDS)
    result = build(design, sheets, mode=args.mode, one_file=True)
    if not result:
        print("nothing to draw", file=sys.stderr)
        return 1
    doc = next(iter(result.values()))[0]
    dxf_path = out / f"{stem}.dxf"
    save_dxf(doc, dxf_path)
    auditor = doc.audit()
    print(f"DXF   {dxf_path}  (audit errors: {len(auditor.errors)})")
    pdf_pages: list[Path] = []
    outputs: dict[str, Path] = {"dxf": dxf_path, "design_json": Path(args.design)}
    for i, (no, (_, warnings)) in enumerate(result.items()):
        for w in warnings:
            print(f"WARN  {no}: {w}")
        if args.png:
            png = out / f"{stem}_{no}.png"
            render_png(doc, png, dpi=args.dpi, sheet_index=i)
            outputs[f"png:{no}"] = png
            print(f"PNG   {png}")
        if args.pdf or args.archive:
            pdf = out / "sheets" / f"{stem}_{no}.pdf"
            pdf.parent.mkdir(parents=True, exist_ok=True)
            render_pdf(doc, pdf, sheet_index=i)
            pdf_pages.append(pdf)
            outputs[f"pdf_sheet:{no}"] = pdf
    if pdf_pages:
        set_pdf = out / f"{stem}_SET.pdf"
        merge_pdfs(pdf_pages, set_pdf)
        outputs["pdf_set"] = set_pdf
        print(f"PDF   {set_pdf}  ({len(pdf_pages)} pages)")
    if args.archive:
        folder, man = archive(design, outputs, Path(args.archive), stage=args.stage)
        print(f"ARCH  {folder}  ({len(man.entries)} files) → Drive: {man.drive_root}")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    design = load_design(Path(args.design))
    n_circ = sum(len(b.all_circuits()) for b in design.boards)
    print(f"OK  boards={len(design.boards)} circuits={n_circ} nodes={len(design.nodes)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="bee-cad", description="B.E.E. CAD engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render", help="design → DXF (+PNG)")
    r.add_argument("design")
    r.add_argument("--out", default="out")
    r.add_argument("--stem")
    r.add_argument("--sheets", help="comma list of: sld,panel")
    r.add_argument("--mode", choices=["unicode", "shx"], default="unicode")
    r.add_argument("--png", action="store_true")
    r.add_argument("--pdf", action="store_true", help="one PDF per sheet + merged <stem>_SET.pdf")
    r.add_argument("--dpi", type=int, default=110)
    r.add_argument("--archive", help="archive root (mirror of 'עבודה/לקוחות חברות ומכרזים'); copies PDF/DXF/JSON into <client>/<project>/<stage>")
    r.add_argument("--stage", default="design", help="intake|survey|quote|licensing|design|execution|asmade|handover|maintenance")
    r.set_defaults(func=cmd_render)
    v = sub.add_parser("validate", help="validate a design file")
    v.add_argument("design")
    v.set_defaults(func=cmd_validate)
    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
