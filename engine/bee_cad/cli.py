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
from .audit import audit_sheet
from .model import Design
from .qa import check_design, check_sheets, write_report
from .render import SHEET_KINDS, build, merge_pdfs, plan_sheets, render_pdf, render_png, save_dxf


def load_design(path: Path) -> Design:
    text = path.read_text(encoding="utf-8")
    data = yaml.safe_load(text) if path.suffix.lower() in (".yaml", ".yml") else json.loads(text)
    return Design.model_validate(data)


def cmd_render(args: argparse.Namespace) -> int:
    from datetime import datetime, timezone

    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
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
    audits: dict[str, dict[str, int]] = {}
    all_warnings: dict[str, list[str]] = {}
    for i, (no, (_, warnings)) in enumerate(result.items()):
        for w in warnings:
            print(f"WARN  {no}: {w}")
        all_warnings[no] = list(warnings)
        rep = audit_sheet(doc, i, no)
        audits[no] = {"text_text": len(rep.text_overlaps), "text_line": len(rep.text_line_collisions), "outside": len(rep.text_outside)}
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
    # self-check: model rules + sheet rules → <out>/<stem>_qa.{json,md}
    qa = check_design(design)
    check_sheets(qa, doc, result, [e.no for e in plan_sheets(design, sheets)])
    qj, qm = write_report(qa, out, stem)
    outputs["qa_json"], outputs["qa_md"] = qj, qm
    print(f"QA    score={qa.score} errors={len(qa.errors)} warnings={len(qa.warnings)} clean={qa.clean}  {qm}")
    for f in qa.errors[:8]:
        print(f"      ERR {f.code} {f.where}: {f.message}")
    folder = man = None
    if args.archive:
        folder, man = archive(design, outputs, Path(args.archive), stage=args.stage)
        print(f"ARCH  {folder}  ({len(man.entries)} files) → Drive: {man.drive_root}")
    if args.job:
        from .hive import job_record, write_job

        rec = job_record(Path(args.design), sheets, outputs, audits, all_warnings, folder, man.drive_root if man else None, started,
                         qa={"score": qa.score, "errors": len(qa.errors), "warnings": len(qa.warnings), "clean": qa.clean})
        job_path = write_job(rec, Path(args.job) if args.job != "auto" else out / f"{stem}_job.json")
        print(f"JOB   {job_path}  status={rec['status']} clean={rec['result']['clean']}")
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
    """Model + sheet self-check without writing DXF/PDF (sheets are built in memory)."""
    design = load_design(Path(args.design))
    qa = check_design(design)
    if not args.model_only:
        sheets = args.sheets.split(",") if args.sheets else list(SHEET_KINDS)
        result = build(design, sheets)
        if result:
            doc = next(iter(result.values()))[0]
            check_sheets(qa, doc, result, [e.no for e in plan_sheets(design, sheets)])
    if args.out:
        qj, qm = write_report(qa, Path(args.out), Path(args.design).stem)
        print(f"QA    {qm}")
    print(qa.to_markdown())
    return 0 if (qa.clean if args.strict else not qa.errors) else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="bee-cad", description="B.E.E. CAD engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render", help="design → DXF (+PNG)")
    r.add_argument("design")
    r.add_argument("--out", default="out")
    r.add_argument("--stem")
    r.add_argument("--sheets", help="comma list of: cover,site,mv,sld,earthing,panel,drill (default: all)")
    r.add_argument("--mode", choices=["unicode", "shx"], default="unicode")
    r.add_argument("--png", action="store_true")
    r.add_argument("--pdf", action="store_true", help="one PDF per sheet + merged <stem>_SET.pdf")
    r.add_argument("--dpi", type=int, default=110)
    r.add_argument("--archive", help="archive root (mirror of 'עבודה/לקוחות חברות ומכרזים'); copies PDF/DXF/JSON into <client>/<project>/<stage>")
    r.add_argument("--stage", default="design", help="intake|survey|quote|licensing|design|execution|asmade|handover|maintenance")
    r.add_argument("--job", help="write a Hive job record (platform/schema/job.schema.json); 'auto' = <out>/<stem>_job.json")
    r.set_defaults(func=cmd_render)
    e = sub.add_parser("from-eplan", help="eplan spec YAML + calc JSON (eplan pv design --json) → design JSON")
    e.add_argument("spec")
    e.add_argument("--calc", required=True)
    e.add_argument("--merge", help="existing-board design JSON whose MDB groups replace the placeholder")
    e.add_argument("--out", default="design.json")
    e.set_defaults(func=cmd_from_eplan)
    c = sub.add_parser("check", help="self-check: model rules + sheet audit → QA report (exit 1 on errors)")
    c.add_argument("design")
    c.add_argument("--sheets", help="comma list of sheet kinds to build for the sheet checks")
    c.add_argument("--model-only", action="store_true")
    c.add_argument("--strict", action="store_true", help="also fail on any text collision")
    c.add_argument("--out", help="write <stem>_qa.json / .md here")
    c.set_defaults(func=cmd_check)
    v = sub.add_parser("validate", help="validate a design file")
    v.add_argument("design")
    v.set_defaults(func=cmd_validate)
    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
