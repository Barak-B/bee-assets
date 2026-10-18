"""Hive job record for a render run — ``platform/schema/job.schema.json`` (BEE Hive Job).

The engine is a *collect/edit* worker in the office's Hive: every render is ledgered as a job of
loop ``edit.cad_render`` with the design, the sheets drawn, the audit result and the archive folder.
Nothing is sent anywhere (``outbound.channel = none``) — the Drive upload is a separate dispatch job.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def job_record(design_path: Path, sheets: list[str], outputs: dict[str, Path], audits: dict[str, dict[str, int]],
               warnings: dict[str, list[str]], archive_folder: Path | None, drive_root: str | None,
               started_at: str, error: str | None = None, qa: dict[str, Any] | None = None) -> dict[str, Any]:
    clean = all(sum(v.values()) == 0 for v in audits.values()) and not any(warnings.values())
    if qa is not None:
        clean = clean and bool(qa.get("clean", True))
    rec: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "kind": "edit",
        "loop": "edit.cad_render",
        "status": "failed" if error else "succeeded",
        "trustTier": "L0",
        "costTier": 1,
        "source": "git",
        "payload": {"design": str(design_path), "sheets": sheets},
        "result": None if error else {
            "sheets": list(audits),
            "outputs": {k: str(v) for k, v in outputs.items()},
            "audit": audits,
            "warnings": warnings,
            "clean": clean,
            "qa": qa,
            "archive_folder": str(archive_folder) if archive_folder else None,
            "drive_root": drive_root,
        },
        "error": error,
        "createdAt": started_at,
        "startedAt": started_at,
        "finishedAt": _now(),
        "outbound": {"channel": "none", "destinationClass": "other", "requiresHumanPick": False},
    }
    return rec


def write_job(rec: dict[str, Any], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
