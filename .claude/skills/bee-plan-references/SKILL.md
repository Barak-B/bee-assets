---
name: bee-plan-references
description: Learn from a reference drawing Barak sends (PDF/DWG of a structural, electrical, civil, earthing, comm or signage sheet) and fold what it teaches into the bee-cad engine as rules, defaults, checks and tests. Use whenever Barak uploads an example plan "to learn from", "בדומה לזה", or to improve the engine's drawings.
---

# Learning from reference drawings (bee-cad)

Barak sends many example drawings over time. Each one should make the engine's plans more accurate.
The goal is to learn **engineering content and conventions**, never to copy another office's style,
wording, title block or branding. B.E.E sheets keep the B.E.E house style (frame, title block, draft
banner, signature box, notes in our own wording).

## Steps for every new example

1. **Read it fully.** Render each page to PNG (PyMuPDF, 200–300 dpi) and crop the details. Extract
   text with `page.get_text()` where it is vector. Note scale, units (cm vs mm) and any hand corrections.
2. **Separate content from style.** List: values (sizes, spacings, covers, grades, depths), details
   drawn (which sections, which scales), notes (as engineering requirements, rephrased), checks the
   drawing implies, and what is missing. Ignore fonts, layout, logos and the other firm's phrasing.
3. **Catalogue it** in `engine/references/catalog.json`: a new entry `REF-<DISC>-<nnn>` with
   `learned` (each item mapped to the engine rule that applies it), `gaps`, `rules`, `confidence`.
   Do not store third-party PDFs in the repo unless Barak asks; keep only the catalogue entry.
4. **Update rules, not drawings.** Each value lives in a rule table in its module (e.g. `STRUCT_RULES`
   in `bee_cad/foundation.py`) with a basis. When a new example agrees with an existing rule, raise its
   `confidence` (single → repeated). When it disagrees, do not overwrite silently: keep the default,
   add the alternative to the catalogue entry and to the design's `verify` list, and tell Barak.
5. **Add what was missing.** If the example shows a detail, check or table the engine lacks, implement
   it parametrically in the relevant module (`foundation`, `civil`, `template`, `earthing`, `sld`, …).
6. **Test.** Add or extend a test in `engine/tests/test_engine.py` that pins the learned behaviour.
   Run `python3 -m pytest -q tests` and re-render the affected examples: audit must stay 0/0/0.
7. **Report to Barak** in Hebrew: what was learned, which rules changed, what conflicts need his call,
   and the updated PDF.

## Principles

- Every default on a sheet shows its basis (rule id or source sheet) and is marked `**` when it is for
  the engineer to confirm. Structural, civil and anchoring values always need the structural engineer's
  signature; the sheet carries an empty signature box and the draft banner until then.
- Conflicts between project sources (e.g. two sheets with different slab sizes) go to the cover's open
  items via `verify`, never resolved by guessing.
- Prefer project data (the client's design sheets, the manufacturer manual) over reference examples.
