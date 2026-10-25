"""Upload an archived project folder to Google Drive (עבודה/לקוחות חברות ומכרזים/…).

Runs on the office computer or the server, where Google credentials exist. Not needed when
Google Drive for Desktop already syncs ``L:\\האחסון שלי`` — then ``bee-cad render --archive L:\\...``
writes straight into the synced tree and this script is unnecessary.

    pip install google-api-python-client google-auth-oauthlib
    python tools/drive_upload.py "<archive root>/<client>/<project>/<stage>" --credentials client_secret.json

Status: written without credentials in the cloud session — NOT yet run against a real account.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def _service(credentials: Path, token: Path):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    creds = None
    if token.exists():
        creds = Credentials.from_authorized_user_file(str(token), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            creds = InstalledAppFlow.from_client_secrets_file(str(credentials), SCOPES).run_local_server(port=0)
        token.write_text(creds.to_json(), encoding="utf-8")
    return build("drive", "v3", credentials=creds)


def _find_or_create_folder(svc, name: str, parent: str) -> str:
    q = f"name = '{name}' and '{parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    res = svc.files().list(q=q, fields="files(id, name)", pageSize=5).execute().get("files", [])
    if res:
        return res[0]["id"]
    meta = {"name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [parent]}
    return svc.files().create(body=meta, fields="id").execute()["id"]


def upload_folder(svc, local: Path, drive_path: list[str], root_id: str = "root") -> int:
    from googleapiclient.http import MediaFileUpload

    parent = root_id
    for part in drive_path:
        parent = _find_or_create_folder(svc, part, parent)
    n = 0
    for f in sorted(local.rglob("*")):
        if f.is_dir():
            continue
        rel = f.relative_to(local)
        folder = parent
        for part in rel.parts[:-1]:
            folder = _find_or_create_folder(svc, part, folder)
        mime = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        media = MediaFileUpload(str(f), mimetype=mime, resumable=f.stat().st_size > 5_000_000)
        existing = svc.files().list(q=f"name = '{f.name}' and '{folder}' in parents and trashed = false",
                                    fields="files(id)", pageSize=1).execute().get("files", [])
        if existing:
            svc.files().update(fileId=existing[0]["id"], media_body=media).execute()
        else:
            svc.files().create(body={"name": f.name, "parents": [folder]}, media_body=media, fields="id").execute()
        n += 1
        print(f"  ↑ {rel}")
    return n


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="upload an archived project stage folder to Google Drive")
    p.add_argument("folder", help="local <archive root>/<client>/<project>/<stage> folder (with manifest.json)")
    p.add_argument("--credentials", default="client_secret.json")
    p.add_argument("--token", default="token.json")
    args = p.parse_args(argv)
    local = Path(args.folder)
    man = json.loads((local / "manifest.json").read_text(encoding="utf-8"))
    drive_path = man["drive_root"].split("/")
    svc = _service(Path(args.credentials), Path(args.token))
    n = upload_folder(svc, local, drive_path)
    print(f"uploaded {n} files → {man['drive_root']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
