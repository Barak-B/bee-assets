# AGENTS.md

## Cursor Cloud specific instructions

This repository (`bee-assets`) on `main` is a **static public-assets repo**, not an application. There is no package manager, build system, test suite, or lint config.

Tracked content:
- `README.md`
- `bee-signature-card-dark.gif`, `bee-signature-card-light.gif` — animated B.E.E email signature cards (1200×480).
- `reports/folder-inventory.html` — a self-contained Hebrew RTL inventory report.

### Running / previewing

- The only runnable artifact is `reports/folder-inventory.html`. It references the GIFs with repo-root-relative paths (`../bee-signature-card-*.gif`), so it **must be served from the repository root**, not from inside `reports/`, or the preview images will 404.
- Serve with the preinstalled Python: `python3 -m http.server 8000` (run from `/workspace`), then open `http://localhost:8000/reports/folder-inventory.html`.
- No dependency install step is needed; there are no dependencies. The update script is effectively a no-op.

### Lint / test / build

- There are none on `main`. Do not fabricate build/test tooling for this branch.
