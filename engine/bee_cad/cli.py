"""bee-cad command line.

    bee-cad render examples/house_karka.json --out out/house --png
    bee-cad render design.yaml --sheets sld --mode shx
    bee-cad validate design.json
    bee-cad check design.json [--json]
    bee-cad bom design.json --out bom.csv
    bee-cad new brief.yaml --out design.json [--render out/]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

from pydantic import ValidationError

from .archive import archive
from .audit import audit_sheet
from .bom import bom, write_csv
from .checks import as_dicts, check, summary
from .model import Design
from .render import SHEET_KINDS, build, merge_pdfs, render_pdf, render_png, save_dxf


EXIT_FILE = 3      # the input could not be read (argparse itself uses 2)
EXIT_DESIGN = 4    # the design has errors


class DesignFileError(Exception):
    """A design file that cannot be read; the message is Hebrew and names the field."""


_PYDANTIC_HE = {
    "missing": "שדה חובה חסר",
    "literal_error": "ערך לא מוכר",
    "float_parsing": "צריך להיות מספר",
    "int_parsing": "צריך להיות מספר שלם",
    "string_type": "צריך להיות טקסט",
    "list_type": "צריך להיות רשימה",
    "bool_parsing": "צריך להיות true או false",
}


def _where(loc: tuple) -> str:
    return " > ".join(str(p) for p in loc)


def load_design(path: Path) -> Design:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise DesignFileError(f"הקובץ לא נמצא: {path}") from None
    try:
        data = yaml.safe_load(text) if path.suffix.lower() in (".yaml", ".yml") else json.loads(text)
    except (json.JSONDecodeError, yaml.YAMLError) as e:
        raise DesignFileError(f"הקובץ {path.name} לא תקין: {e}") from None
    try:
        return Design.model_validate(data)
    except ValidationError as e:
        lines = [f"בקובץ {path.name} יש {e.error_count()} שגיאות:"]
        for err in e.errors():
            he = _PYDANTIC_HE.get(err["type"], err["msg"])
            extra = ""
            if err["type"] == "literal_error":
                extra = f" (אפשרויות: {err.get('ctx', {}).get('expected', '')})"
            lines.append(f"  • {_where(err['loc'])}: {he}{extra}")
        raise DesignFileError("\n".join(lines)) from None


def print_findings(design: Design) -> int:
    findings = check(design)
    for f in findings:
        print(f.line())
    print(summary(findings))
    return sum(f.level == "error" for f in findings)


def cmd_render(args: argparse.Namespace) -> int:
    design = load_design(Path(args.design))
    errors = print_findings(design)
    if errors and args.strict:
        print("לא משרטט: יש שגיאות תכנון (הסר --strict כדי לשרטט בכל זאת)", file=sys.stderr)
        return EXIT_DESIGN
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
        rep = audit_sheet(doc, i, no)
        print(rep.summary())
        for c in rep.text_overlaps + rep.text_line_collisions + rep.text_outside:
            print(f"      {c.kind}: {c.a!r} / {c.b!r} @ ({c.at[0]:.0f},{c.at[1]:.0f})")
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


def cmd_from_eplan(args: argparse.Namespace) -> int:
    from .eplan_bridge import load_from_files

    design = load_from_files(Path(args.spec), Path(args.calc), Path(args.merge) if args.merge else None)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(design.model_dump_json(indent=2, exclude_none=True), encoding="utf-8")
    print(f"DESIGN {out}  boards={len(design.boards)} nodes={len(design.nodes)}")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    design = load_design(Path(args.design))
    n_circ = sum(len(b.all_circuits()) for b in design.boards)
    print(f"OK  boards={len(design.boards)} circuits={n_circ} nodes={len(design.nodes)}")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    if args.json:
        try:
            design = load_design(Path(args.design))
        except DesignFileError as e:
            print(json.dumps({"file_error": str(e)}, ensure_ascii=False))
            return EXIT_FILE
        findings = check(design)
        print(json.dumps(as_dicts(findings), ensure_ascii=False, indent=2))
        return EXIT_DESIGN if any(f.level == "error" for f in findings) else 0
    return EXIT_DESIGN if print_findings(load_design(Path(args.design))) else 0


def cmd_new(args: argparse.Namespace) -> int:
    from .templates import BriefError, from_brief

    path = Path(args.brief)
    try:
        brief = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        design = from_brief(brief)
    except FileNotFoundError:
        raise DesignFileError(f"הקובץ לא נמצא: {path}") from None
    except (yaml.YAMLError, BriefError) as e:
        raise DesignFileError(f"תקציר {path.name}: {e}") from None
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(design.model_dump_json(indent=2, exclude_none=True), encoding="utf-8")
    n = sum(len(b.all_circuits()) for b in design.boards)
    print(f"DESIGN {out}  לוחות={len(design.boards)} מעגלים={n} רכיבים={len(design.nodes)}")
    if args.render:
        return cmd_render(argparse.Namespace(design=str(out), out=args.render, stem=None, sheets=None, mode="unicode",
                                             png=True, pdf=True, dpi=110, archive=None, stage="design", strict=False))
    return EXIT_DESIGN if print_findings(design) else 0


def cmd_bom(args: argparse.Namespace) -> int:
    rows = bom(load_design(Path(args.design)))
    write_csv(rows, Path(args.out))
    print(f"BOM   {args.out}  ({len(rows)} שורות, {sum(r.qty for r in rows)} פריטים)")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="bee-cad", description="B.E.E. CAD engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render", help="design → DXF (+PNG)")
    r.add_argument("design")
    r.add_argument("--out", default="out")
    r.add_argument("--stem")
    r.add_argument("--sheets", help="comma list of: mv,sld,panel")
    r.add_argument("--mode", choices=["unicode", "shx"], default="unicode")
    r.add_argument("--png", action="store_true")
    r.add_argument("--pdf", action="store_true", help="one PDF per sheet + merged <stem>_SET.pdf")
    r.add_argument("--dpi", type=int, default=110)
    r.add_argument("--archive", help="archive root (mirror of 'עבודה/לקוחות חברות ומכרזים'); copies PDF/DXF/JSON into <client>/<project>/<stage>")
    r.add_argument("--strict", action="store_true", help="stop when the design checks find errors")
    r.add_argument("--stage", default="design", help="intake|survey|quote|licensing|design|execution|asmade|handover|maintenance")
    r.set_defaults(func=cmd_render)
    e = sub.add_parser("from-eplan", help="eplan spec YAML + calc JSON (eplan pv design --json) → design JSON")
    e.add_argument("spec")
    e.add_argument("--calc", required=True)
    e.add_argument("--merge", help="existing-board design JSON whose MDB groups replace the placeholder")
    e.add_argument("--out", default="design.json")
    e.set_defaults(func=cmd_from_eplan)
    v = sub.add_parser("validate", help="validate a design file")
    v.add_argument("design")
    v.set_defaults(func=cmd_validate)
    c = sub.add_parser("check", help="design rule checks (Hebrew findings)")
    c.add_argument("design")
    c.add_argument("--json", action="store_true", help="findings as JSON for the app")
    c.set_defaults(func=cmd_check)
    n = sub.add_parser("new", help="job brief (YAML, a few lines) → full design JSON")
    n.add_argument("brief")
    n.add_argument("--out", default="design.json")
    n.add_argument("--render", help="also draw DXF + PNG + PDF set into this folder")
    n.set_defaults(func=cmd_new)
    m = sub.add_parser("bom", help="bill of materials → CSV")
    m.add_argument("design")
    m.add_argument("--out", default="bom.csv")
    m.set_defaults(func=cmd_bom)
    args = p.parse_args(argv)
    try:
        return args.func(args)
    except DesignFileError as e:
        print(str(e), file=sys.stderr)
        return EXIT_FILE


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
