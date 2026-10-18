"""Project file (תיק פרויקט) — the office folder convention for every customer.

Mirror of the office archive ``L:\\האחסון שלי\\עבודה\\לקוחות חברות ומכרזים\\<לקוח>\\<פרויקט>\\``
(Google Drive "My Drive/עבודה/לקוחות חברות ומכרזים"). The engine writes the same tree locally;
the upload to Drive is done by the agent / the Windows worker from the manifest this module writes.

Barak receives PDFs. CAD files (DXF/DWG) and the design JSON are archived next to them so the
project can be regenerated, but nobody has to open them.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .model import Design

ROOT_DRIVE = "עבודה/לקוחות חברות ומכרזים"

# stage folders, in the order of the project lifecycle (S01–S12 of the master plan)
STAGES = {
    "intake": "01 קליטה והצעה",
    "survey": "02 סקר אתר",
    "quote": "03 הצעת מחיר",
    "licensing": "04 רישוי וחח\"י",
    "design": "05 תכנון",
    "execution": "06 ביצוע ורכש",
    "asmade": "07 AS-MADE",
    "handover": "08 תיק מסירה",
    "maintenance": "09 תחזוקה",
}


def safe_name(s: str) -> str:
    bad = '<>:"/\\|?*'
    out = "".join("-" if c in bad else c for c in s).strip().rstrip(".")
    return out or "ללא שם"


@dataclass
class ArchiveEntry:
    role: str              # pdf_set | pdf_sheet | dxf | design_json | png
    path: str              # relative to the project folder
    sha256: str
    bytes: int


@dataclass
class Manifest:
    client: str
    project: str
    stage: str
    revision: str
    date: str
    drive_root: str
    created_at: str
    entries: list[ArchiveEntry] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(
            {
                "client": self.client,
                "project": self.project,
                "stage": self.stage,
                "revision": self.revision,
                "date": self.date,
                "drive_root": self.drive_root,
                "created_at": self.created_at,
                "entries": [e.__dict__ for e in self.entries],
            },
            ensure_ascii=False,
            indent=2,
        )


def _sha(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def archive(design: Design, outputs: dict[str, Path], archive_root: Path, stage: str = "design",
            design_source: Path | None = None) -> tuple[Path, Manifest]:
    """Copy the rendered outputs into ``<archive_root>/<client>/<project>/<stage>/`` and write a manifest.

    ``outputs`` maps a role (pdf_set, dxf, pdf_sheet:<no>, png:<no>) to a file.
    Returns the project folder and the manifest.
    """
    tb = design.title
    client = safe_name(tb.client or tb.project)
    project = safe_name(tb.project)
    stage_name = STAGES.get(stage, stage)
    folder = archive_root / client / project / stage_name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "CAD").mkdir(exist_ok=True)
    man = Manifest(client=client, project=project, stage=stage_name, revision=tb.revision, date=tb.date,
                   drive_root=f"{ROOT_DRIVE}/{client}/{project}/{stage_name}",
                   created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    rev = f"_{tb.revision}" if tb.revision else ""
    for role, src in outputs.items():
        if not src or not Path(src).exists():
            continue
        src = Path(src)
        if role == "pdf_set":
            dst = folder / f"{project} — סט תוכניות{rev}.pdf"
        elif role.startswith("pdf_sheet:"):
            dst = folder / "גיליונות" / f"{role.split(':', 1)[1]}{rev}.pdf"
        elif role == "dxf":
            dst = folder / "CAD" / f"{project}{rev}.dxf"
        elif role == "design_json":
            dst = folder / "CAD" / f"{project}{rev}.design.json"
        elif role.startswith("png:"):
            dst = folder / "תצוגה" / f"{role.split(':', 1)[1]}{rev}.png"
        else:
            dst = folder / src.name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        man.entries.append(ArchiveEntry(role=role.split(":")[0], path=str(dst.relative_to(folder)),
                                        sha256=_sha(dst), bytes=dst.stat().st_size))
    if design_source and Path(design_source).exists() and "design_json" not in outputs:
        dst = folder / "CAD" / f"{project}{rev}.design.json"
        shutil.copy2(design_source, dst)
        man.entries.append(ArchiveEntry("design_json", str(dst.relative_to(folder)), _sha(dst), dst.stat().st_size))
    (folder / "manifest.json").write_text(man.to_json(), encoding="utf-8")
    return folder, man
