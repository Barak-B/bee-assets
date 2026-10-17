# 14 — שירות התכנון וה-CAD (`services/cad`) — מפרט

| | |
|---|---|
| גרסה | 0.1 — טיוטת מפרט (2026-10-10) |
| שייך ל | תוכנית אב §4 (ארכיטקטורה), §4.1 שורות CAD/תפוקה/פריסת גג, §8 (eplan כשירות), אבן דרך **M4** |
| מקורות | `docs/plan/research/07-cad-dxf.md` (כל הדוח), `research/03-pv-design-tools.md` (§2, §3, §4, §9), חבילת `eplan` (`docs/GENERATOR.md`, `domain/electrical/pv/models.py`, `cli.py`, `strings.py`, `drawings/sheet.py`, `drawings/render.py`, `quantities.py`), הסקיל `electrical-drawing-sets` (`project-spec.md`, `sheets.md`, `drawing-standard.md`, `setup.md`, `boards-bee-style.md`, `office-rules.md`), HANDOFF של ספריית הבלוקים, `apps/bee-solar-survey/src/{types,schema}.ts`, `platform/schema/job.schema.json`, סט NESPAH-543-05 |
| סכמת job | `docs/plan/templates/design-job.schema.json` |
| סימון | **לאימות** = טענה/יכולת שלא אומתה במחקר או בקוד; `# VERIFY` = שדה ב-spec שמקורו לא מאושר (מוסכמת eplan) |

---

## 0. תקציר

`services/cad` הוא קונטיינר Python יחיד שמקבל job מה-Core (Fastify + pg-boss), מייצר ממנו **ProjectSpec** של eplan, מריץ פריסה/מחרוזות/תפוקה (S03 — "תכנון מהיר") או את מחולל התוכניות המלא (S06 — "תכנון מפורט"), מרנדר PDF/PNG/SVG, מחשב BOM ומחזיר **artifacts + CalcReport + verify + checks**. DWG R2018 עם בלוקים דינמיים לא נוצר בקונטיינר (ezdxf לא כותב DWG ולא יוצר בלוקים דינמיים — דוח 07 §1) אלא ב-**worker Windows** עם GstarCAD במשרד שמושך משימות מהתור דרך HTTPS.

עקרונות שנשמרים מ-eplan ומהסקיל: ידע מחוץ לקוד (`rules`), המודל מציע והקוד אוכף, כל מספר עם מקור, `BLOCKED` במקום ניחוש, גיאומטריה אחת לכל הגיליונות, שלושת שערי האיכות (audit 0/0/0, מבט על כל PNG, בדיקות ירוקות).

---

## 1. גבולות השירות (a)

### 1.1 אחריות `services/cad`

| אחריות | מודול | קלט | פלט |
|---|---|---|---|
| **spec generation** | `cad/specgen/` | Project, Site, Survey, Catalog, החלטות ברק, `rules` | `ProjectSpec` YAML (+ רשימת `# VERIFY`) |
| **geometry** | `cad/geometry/` | DXF/DWG→DXF, PDF, רסטר, ציור ידני | `RoofGeometry` JSON (§3) → `roof` + `layout` ב-spec |
| **layout + stringing (S03)** | `cad/layout/` | RoofGeometry, מודול, ממיר, rules | `layout[]`, `strings[]`, בדיקות Voc/Vmp/ΣImp/ΣIsc |
| **yield** | `cad/yieldsim/` | lat/lon, tilt/azimuth לפאה, מודול/ממיר, horizon | חודשי/שנתי kWh, kWh/kWp, PR, 8760 אופציונלי |
| **eplan run (S06)** | `eplan` כחבילה מותקנת | ProjectSpec YAML, rules DB | CalcReport, DXF E-00…E-08, PDF/PNG, BOM CSV, `_calc.txt` |
| **rendering** | `cad/render/` | DXF | PDF (PyMuPDF backend), PNG, SVG לכל שכבה |
| **BOM** | `eplan.quantities` + `cad/bom/` | spec + CalcReport | BOM CSV + BOM JSON ממופה ל-Catalog |
| **DWG bind (מחוץ לקונטיינר)** | `workers/cad-windows/` | DXF עם placeholders | DWG 2018 + PDF רשמי (CTB) |

**לא באחריות השירות:** תמחור (מודול `pricing`), יצירת QuoteVersion (מודול `quotes`), שליחה ללקוח (שער האמון), מכונת המצבים של הפרויקט (מודול `projects`). השירות מחזיר נתונים; ה-Core מחליט על מעברי שלב.

### 1.2 חוזה HTTP (בתוך הרשת הפנימית של Docker)

השירות חושף HTTP פנימי (FastAPI + uvicorn — **החלטה פתוחה**, כל שרת ASGI מתאים) על `http://cad:3041` (`CAD_SERVICE_URL`, מפרט 17). pg-boss הוא ספריית Node ולכן **המנהל של מחזור החיים הוא ה-Core**: handler של pg-boss קורא ל-`services/cad`, ממתין, ורושם תוצאות. השירות עצמו stateless למעט תיקיית עבודה.

| method | path | תיאור | סינכרוני? |
|---|---|---|---|
| `POST` | `/jobs` | קבלת `DesignJobRequest` (סכמה: `design-job.schema.json`). מחזיר `202 {job_id}` | לא |
| `GET` | `/jobs/{job_id}` | `DesignJobResponse` (status, progress, artifacts, report…) | — |
| `POST` | `/jobs/{job_id}/cancel` | ביטול | — |
| `POST` | `/geometry/extract` | חילוץ גיאומטריה מקובץ (DXF/PDF/תמונה) — מחזיר RoofGeometry + confidence | כן (≤ 60 s) |
| `POST` | `/geometry/validate` | ולידציה של RoofGeometry שצויר ב-UI | כן |
| `POST` | `/strings/allocate` | `eplan pv allocate` כ-API (אפשרויות חלוקה למחרוזות) | כן |
| `POST` | `/yield` | תפוקה בלבד (ל-ROI מהיר בהצעה) | כן (cache) / לא (קריאה ל-PVGIS) |
| `GET` | `/rules/snapshot` | ה-rules שהשירות טען (לצורך `generated_from.rules_snapshot`) | כן |
| `GET` | `/healthz` | בריאות: גרסאות ezdxf/pvlib/eplan, גופנים נמצאו, SHX cache | כן |

`kind` של job: `design.quick` (S03) · `design.full` (S06) · `render` · `bom` · `yield` · `geometry.extract` · `dwg.bind` (נוצר ע"י השירות בסוף `design.full`, מבוצע ע"י ה-worker — §7).

### 1.3 מחזור חיים דרך pg-boss (ב-Core)

```
projects / quotes module ──enqueue('cad.design.quick' | 'cad.design.full' | …, payload, {singletonKey: design_rev})──▶ pg-boss
pg-boss handler (Node) ──POST /jobs──▶ services/cad ──(poll GET /jobs/{id} או webhook)──▶ handler
handler: artifacts → R2 (presigned PUT שניתנו ב-payload) · Document records · project_events(design.*) · Task לברק אם blocked
dwg.bind ──▶ טבלת cad_worker_jobs (pull ע"י Windows worker, §7.2)
```

- **שם תור** = `cad.<kind>`; `singletonKey` = `design_rev` כדי שלא ירוצו שני jobs על אותה גרסה.
- **retry**: `render`/`bom`/`yield` — 3 ניסיונות; `design.*` — 0 ניסיונות אוטומטיים (כישלון = מידע לברק, לא לולאה). DLQ לפי pg-boss.
- **timeouts**: quick ≤ 2 דק', full ≤ 15 דק' (סט עם K-xx ו-PNG), yield ≤ 1 דק' (עם cache) / 5 דק' (PVGIS).
- **לדג'ר הכוורת**: כל job מקבל גם רשומה לפי `platform/schema/job.schema.json` — `kind: edit`, `loop: edit.design_quick` / `edit.design_full` / `edit.render` / `edit.dwg_bind`, `trustTier: L1` (אין outbound; `outbound.channel: none`). תוצרים אינם נשלחים ללקוח ע"י השירות לעולם.
- **אירועים** ל-`project_events`: `design.requested`, `design.blocked{blockers}`, `design.done{design_rev, checks_failed}`, `design.provisional`, `dwg.bound`, `design.owner_accepted{check}`.

### 1.4 מה חוזר מכל job

| שדה | תוכן |
|---|---|
| `status` | `queued · running · done · provisional · blocked · failed · cancelled` |
| `artifacts[]` | `{role, sheet?, path, r2_key?, sha256, bytes, mime}`; roles: `dxf`, `pdf_sheet`, `pdf_set`, `png`, `svg_layer`, `bom_csv`, `bom_json`, `calc_txt`, `calc_json`, `spec_yaml`, `geometry_json`, `yield_json`, `dwg`, `pdf_official`, `log` |
| `calc_report` | `CalcReport` של eplan (project, p_dc_kwp, p_ac_kw, strings[], mppts[], cables[], devices[], earthing[], system_checks[], verify[]) |
| `checks[]` | כל `Check` (name, ok, value, limit, unit, margin_pct, rule, accepted) משוטח מכל הרמות |
| `verify[]` | רשימת "לאימות" (מה-spec + מה-CalcReport) |
| `blockers[]` | כש-`blocked`: `{code: NEED_INFO|CONFLICTING_RULES|VALIDATION_FAILED|BUDGET_EXHAUSTED|GEOMETRY_INVALID, key?, message}` |
| `eplan` | `{task_id, stop_reason, mode, candidates_used: bool}` |
| `rules_snapshot` | `{sha256, count, rows[]}` של ה-rules שבהם השתמש (נשמר ב-`Document.generated_from`) |
| `audit` | `{sheets: {E-01: {text_overlaps:0, text_line_collisions:0, text_extra_collisions:0, ezdxf_audit_errors:0}}, png_diff?: {...}}` |
| `timings` | שלב→שניות |

ה-sha256 מחושב בשירות על הקובץ הסופי; ה-Core מאמת אחרי ההעלאה ל-R2.

---

## 2. יצירת ה-spec — טבלת מיפוי (b)

כללים: (1) כל ערך שמקורו **לא** מרשומה מאומתת (Catalog עם `datasheet_src`, Survey עם `completeness.ready`, Rule `validated`/`office`) נכתב עם `# VERIFY` ומצטרף ל-`verify[]`. (2) השירות אינו ממציא ערכים: שדה חובה ללא מקור → `blocked{NEED_INFO}`, לא ברירת מחדל שקטה. (3) ברירות המחדל של pydantic ב-`models.py` מותרות רק כשהן מסומנות בטבלה כ"ברירת מחדל eplan".

### 2.1 כותרת וסטטוס

| שדה spec | מקור במנוע | הערות / כלל VERIFY |
|---|---|---|
| `project` | `Project.name` + `Customer.name` ("<פרויקט> — <לקוח>") | `_draw()` גוזר stem מהחלק שלפני "—" |
| `drawing_set` | קבוע `"E"` | |
| `revision` | `Design.rev` (A, B, …) | רוויזיה חדשה לכל שינוי spec |
| `date` | תאריך יצירת ה-job (Asia/Jerusalem) | |
| `designer` | קבוע "ברק הנדסת חשמל" (SKILL.md) | |
| `status` | `Design.status` → `review` (S06 ראשוני) · `approval` · `tender` · `construction` (אחרי אישור ברק) | `as_made` נדרש ל-S10/S11 (תוכנית אב §7) ו**אינו** ב-enum של eplan — **פער** (§12) |
| `references[]` | Document records מסוג `construction_pdf`, `datasheet` | |

### 2.2 `site`

| שדה | מקור | VERIFY |
|---|---|---|
| `name`, `address` | `Site.name`, `Site.address` (← `Survey.addressLine`) | — |
| `t_min_c` | טבלת `climate_zones` (עתידית) לפי `Site.lat/lon` → תחנה קרובה (pv-design-rules §2: שפלה −2 °C, הרים −5) | `# VERIFY` תמיד עד שברק מאשר ערך לאזור |
| `t_max_cell_c` | Rule `eplan.t_max_cell_c` (ברירת מחדל 70) | מקור: סקיל §2; VERIFY אם rule לא `validated` |
| `t_ambient_cables_c` | ברירת מחדל eplan 35 | — |
| `grid_v_v`, `grid_phases` | `Survey.electricalIntake.mainBreaker` + `GridConnection`/חשבון חשמל: 1Φ → 230/1, 3Φ → 400/3 | סוג חיבור מופיע בחשבון החשמל (S01) |
| `connection_a` | `Survey.electricalIntake.mainBreaker` ("63A" → 63) | `connection_verified: true` רק אם אומת מול חשבון/אישור גודל חיבור |
| `production_meter` | פרופיל אסדרה: `R8` (>15 kW → מונה ייצור) או החלטת ברק | VERIFY כששורש הכלל `unverified` |
| `production_meter_at_inverter` | החלטת ברק (Design decisions) | — |
| `array_spd`, `array_spd_box` | חישוב: מרחק מחרוזת > 10 m (CLC/TS 50539-12 — בתיעוד `models.py`) + החלטת ברק | VERIFY |
| `house_rcd_a`, `house_rcd_ma` | `Survey` (תמונת לוח → Claude vision → אישור) | VERIFY עד אישור |
| `earthing_system` | Survey (`busbars` photo / שאלה לסוקר) — TT ברירת מחדל eplan | VERIFY |
| `board_name`, `supply_name`, `met_name` | `Survey.electricalIntake.meterLocation`/`panelSpaceForSolar` + שמות שברק נותן | — |
| `jurisdiction` | קבוע `IL` | |

### 2.3 `module` / `inverter` / `optimizer` / `battery` — מהקטלוג

כל השדות מ-`Product.tech` (JSON) של ה-SKU שנבחר ב-QuoteVersion/Design, עם `Product.datasheet_src {file, page}`:

| מקטע spec | שדות `Product.tech` נדרשים | VERIFY |
|---|---|---|
| `module` | `p_max_w, voc_v, vmp_v, isc_a, imp_a, beta_voc_pct_per_c, gamma_pmax_pct_per_c, alpha_isc_pct_per_c, length_mm, width_mm, max_system_voltage_v, max_series_fuse_a, bifacial_gain` | VERIFY אם `Product.verification != validated` או אין `datasheet_src`; `bifacial_gain: 0` על רעפים (project-spec.md) |
| `module_count` | `Design.module_count` (← S03 layout, או מספר ברק) | חייב להיות שווה לסכום ה-layout (ולידטור pydantic) |
| `inverter` | `kind, v_dc_max_v, v_start_v, mppts[]{tag,v_min_v,v_max_v,i_max_a,isc_max_a,inputs}, p_ac_nom_w, s_ac_max_va, i_ac_max_a, p_dc_max_w, phases, v_ac_v, backup_i_max_a, battery_*, pv_oversize_ratio_max, dc_switch_integrated, spd_*_integrated/type, rcm_integrated, communication` | VERIFY לכל שדה חסר ב-tech; `communication` מ-Survey (`inverterLocation`/ראוטר) |
| `optimizer` | `p_max_w, isc_max_a, imp_max_a, v_max_v, v_mp_min_v, monitoring` | רק אם ב-Design יש אופטימייזרים (R19 — לאימות V9) |
| `battery` | `v_nom_v, v_min_v, v_max_v, capacity_kwh, i_max_a, branches` | רק אם `Survey.preferences.includeBattery` / Design |

חסר שדה חובה (למשל `beta_voc_pct_per_c`) → `blocked{NEED_INFO, key: catalog.<sku>.beta_voc_pct_per_c}` + Task "להשלים דף נתונים".

### 2.4 `strings`, `ac_run`, `backup_run`, `battery_runs`

| שדה | מקור |
|---|---|
| `strings[].tag/mppt/modules/optimizers` | S03: `cad/layout` (§4); S06: ה-layout המאושר |
| `strings[].length_m` | **מחושב מהגיאומטריה** (`quantities.geometry()` / `facade_geometry()`), לעולם לא מוקלד (project-spec.md); ב-S03 ללא תוואי — אומדן מהמרחק מודול↔ריזר ×1.2, `# VERIFY` |
| `strings[].method/insulation/grouping` | Rule `eplan.dc_install_method` (B1/XLPE ברירת מחדל eplan) + החלטת ברק |
| `strings[].via`, `mc4_lead_m` | החלטת ברק (קופסאות מעבר) |
| `ac_run.length_m` | `Survey.electricalIntake.acCableLengthM` (`# VERIFY`) → S06: מהגיאומטריה (ריזר→לוח) |
| `backup_run`, `battery_runs` | רק hybrid; אורכים מגיאומטריית הקיר (E-05) או VERIFY |

### 2.5 `roof` + `layout` — מהגיאומטריה (§3)

| שדה spec | מקור ב-RoofGeometry |
|---|---|
| `roof.width_m / depth_m` | bbox של המסגרת המקומית |
| `roof.outline`, `roof.lines[]` | `faces[].polygon` (מאוחד) ו-`lines[]` (ridge/hip/valley/eave) |
| `roof.azimuth_deg`, `tilt_deg` | הפאה הראשית; לכל שורה `layout[].azimuth_deg`/`face` |
| `roof.north_from_up_deg`, `north_verified` | `georef.north_from_up_deg`; `north_verified` = `georef.source in (dxf_geodata, control_points_verified)` אחרת false → "לאימות" על E-03 |
| `roof.obstacles[]` | `exclusions[]` מסוג `obstacle` (x,y,w,d,height,shades) |
| `roof.background` | `background {path, px_per_m, origin_px, alpha}` — אורתופוטו רשום |
| `roof.trays`, `ac_trays`, `riser_*`, `inverter_*`, `boxes[]`, `earth_bar_*`, `wall` | `equipment` ב-RoofGeometry (S06 בלבד; ב-S03 אין) |
| `layout[]` | `modules[]` מקובצים לשורות (y, x, orientation, gap, string tags, face, azimuth, block/field) |
| `eave_h_m` | Survey (גובה מרזב) `# VERIFY` |

### 2.6 החלטות, אפשרויות, מתגים

| שדה | מקור |
|---|---|
| `owner_accepted[]` | טבלת `design_decisions` (check, reason בעברית, date) — §6.3 |
| `alternatives[]`, `alternatives_sheet` | טבלת `design_alternatives` — §6.4 |
| `fixing_details` | החלטת ברק (ברירת מחדל `true` ב-eplan; office-rules #22 אומר "לא אלא אם ביקשו" — **פער**, §12) |
| `module_bonding`, `clamps`, `tray_bonding`, `main_earth_mm2`, `cabling` | Catalog (קלמפים עם `bonding_verified`) + החלטת ברק |
| `cover_photo` | `Survey.photos[field in (roof, siteOverview)]` הראשון, אחרת אורתופוטו |
| `construction_pdf`, `construction_titles` | Document מסוג `constructor_set` + כותרות עמודים (PyMuPDF `get_text` של כל עמוד → הצעה → אישור) |
| `notes[]` | תבנית לפי פרופיל (≤ 7, עברית בלבד — drawing-standard §4) |
| `verify[]` | איחוד כל ה-`# VERIFY` + פריטי Survey `missingRecommended` רלוונטיים |

### 2.7 מיפוי Survey → spec (מ-`schema.ts` `toDesignSuitePayload`)

| Survey (`DesignSuiteSitePayload` / `electricalIntake`) | spec / RoofGeometry |
|---|---|
| `addressLine, lat, lon` | `site.address`; `georef.lat/lon` (תפוקה, t_min) |
| `roofType` (flat/tile/metal-standing-seam/metal-trapezoidal/ground/other) | `faces[].roof_type` → ערכת הקונסטרוקציה, `bifacial_gain`, אוצר מילים ("שדות" ברעפים, office-rules #8) |
| `usableAreaM2` | ולידציה: שטח פאות ± 30 % |
| `azimuthDeg` (ברירת מחדל 180), `tiltDeg` | `faces[0].azimuth_deg/tilt_deg` כשאין גיאומטריה מדויקת (`# VERIFY`) |
| `annualConsumptionKwh` | ל-ROI בלבד (לא ל-spec) |
| `target.sizeKwp` / `budgetCents` | יעד הפריסה (§4.1 שלב 0) |
| `preferences.inverterBrand` (SolarEdge/KStar/ABB/Deye) | סינון Catalog |
| `mainBreaker`, `solarMainBreaker` | `site.connection_a`; מפסק PV ב-E-01 |
| `meterType` (ישיר/ארון מניה), `meterNumber`, `meterLocation` | `site.production_meter*`, `board_name`; `GridConnection.meterSerial` |
| `acCableLengthM`, `cableRouteNotes` | `ac_run.length_m # VERIFY`; הערה לתוואי |
| `inverterWallLocation` | `roof.inverter_note`, `wall` (S06) |
| `photos[]` (sha256, field) | `cover_photo`; תמונת לוח → `house_rcd_*` (vision, אישור) |

הערה: המיפוי `'פנל מבודד' → 'metal-standing-seam'` ב-`schema.ts` מערבב פנל מבודד (סנדוויץ') עם גג עומד-תפר — ראו §12.

---

## 3. קליטת גיאומטריית גג (c)

### 3.1 חוזה `RoofGeometry` (JSON, משותף ל-UI, לשירות ול-spec)

מערכת צירים: **מסגרת גג מקומית במטרים**, מקור (0,0) בפינה השמאלית-תחתונה של ה-bbox, x ימינה, y למעלה — זהה ל-`RoofArea` של eplan (`x_m` מהקצה השמאלי, `y_m` מהקצה התחתון). `north_from_up_deg` = סיבוב צפון מ"למעלה" בכיוון השעון (כמו `roof.north_from_up_deg`). ההגדרה המלאה ב-`design-job.schema.json#/$defs/RoofGeometry`; תמצית:

```jsonc
{
  "version": "1",
  "units": "m",
  "frame": { "width_m": 14.0, "depth_m": 8.0 },
  "georef": {
    "lat": 31.77, "lon": 35.21,
    "crs": "EPSG:2039",                     // ITM; null כשאין
    "affine_local_to_crs": [a, b, c, d, e, f],   // x' = a·x + b·y + c ; y' = d·x + e·y + f
    "north_from_up_deg": 45,
    "source": "manual | dxf_geodata | control_points | control_points_verified | survey_compass",
    "control_points": [{ "local": [x, y], "world": [E, N] | "px": [u, v] }]
  },
  "faces": [ { "id": "F1", "name": "דרום", "polygon": [[x,y],…], "azimuth_deg": 180, "tilt_deg": 12,
               "roof_type": "tile", "block": "A" } ],
  "exclusions": [ { "id": "X1", "kind": "obstacle | setback | path | skylight | hvac", "name": "ארובה",
                    "polygon": [[x,y],…], "height_m": 1.2, "shades": true } ],
  "lines": [ { "kind": "ridge | hip | valley | eave", "pts": [[x,y],[x,y]] } ],
  "modules": [ { "id": "S1.1", "face": "F1", "x": 1.4, "y": 0.3, "w": 1.134, "h": 2.278,
                 "rot_deg": 0, "orientation": "portrait", "string": "S1", "optimizer": false } ],
  "equipment": { "riser": [x, y], "inverter": [x, y], "earth_bar": [x, y],
                 "trays_dc": [[[x,y],…]], "trays_ac": [[[x,y],…]], "boxes": [ … RoofBox ] },
  "background": { "path": "ortho.png", "px_per_m": 20, "origin_px": [120, 980], "alpha": 0.55, "source": "govmap|maptiler|constructor_pdf|photo" },
  "source": { "kind": "dwg | dxf | pdf_vector | raster_vision | manual", "document_sha256": "…",
              "layer_map": { "PV-MODULES": "modules", "ROOF": "faces" }, "confidence": 0.0–1.0, "notes": [] },
  "validation": { "ok": true, "issues": [] }
}
```

`modules[]` הוא הפלט של הפריסה (S03) **או** הקלט מהקונסטרוקטור (S06). המרה ל-`layout[]` של eplan: קיבוץ לפי `(face, y ± 1 cm, orientation)` → שורה; `modules` = רשימת תגיות המחרוזת לפי סדר x, עם `*` לאופטימייזר (`LayoutRow.modules`).

### 3.2 ארבעה מסלולי קלט

**(א) DWG/DXF של הקונסטרוקטור (NESPAH-543-05 "תנוחה ורומים", GstarCAD 2027, eTransmit)**
1. DWG → DXF: ב-worker Windows (`DXFOUT` / SaveAs DXF 2018, §7) — זה גם המסלול לקבצים "זרים" שהקבלנים שולחים. לבקש מהקבלן ב-eTransmit לצרף גם DXF. **לא** ODA File Converter בקו הייצור (רישיון לא-מסחרי, דוח 07 §2). LibreDWG `dwg2dxf` רק כגיבוי ידני (דיווחי DXF שבור, issue #1069).
2. ezdxf (`ezdxf.readfile` / `ezdxf.recover.readfile` לקבצים בעייתיים): סריקת שכבות (`doc.layers`), xref (`ezdxf.xref`, שכבות `xrefname|layer` — eTransmit); `msp.query('INSERT[layer=="…"]')` → לכל INSERT: `dxf.insert`, `xscale/yscale`, `rotation`, `block()`; `virtual_entities()` לקואורדינטות עולם; `ezdxf.bbox.extents()` למלבן המודול. `LWPOLYLINE` → `get_points()` לקווי מתאר/רכסים.
3. מודולים שצוירו כמלבנים (לא בלוקים): סינון LWPOLYLINE סגורים עם 4 קודקודים ויחס צלעות ≈ רוחב/אורך המודול מהקטלוג (±5 %), קיבוץ לפי שכבה/צבע (דוח 07 §4.1).
4. **מיפוי שכבות** אינטראקטיבי: השירות מחזיר `layer_candidates` (שם שכבה, סוג ישויות, ספירה, גודל טיפוסי) וה-UI/ברק מאשרים `layer_map`. המיפוי נשמר לכל קונסטרוקטור (`constructor_layer_presets`) כדי שהפעם הבאה תהיה אוטומטית.
5. **יחידות**: `$INSUNITS` (4 = mm, 5 = cm, 6 = m, 0 = ללא) + היוריסטיקת גודל מודול: מלבן ≈ 2278×1134 → mm; ≈ 227.8×113.4 → cm; ≈ 2.278×1.134 → m. משרדי קונסטרוקטורים בישראל מציירים תנוחות גג **בס"מ ללא יחידה** (boards-bee-style §4: "roof sheets in cm without unit (TK)") וחזיתות ב-mm. היחידות בפועל של NESPAH-543-05 — **לאימות** (הקובץ DWG, נפתח רק ב-worker). אי-התאמה בין `$INSUNITS` להיוריסטיקה → `validation.issues[units_mismatch]`, אישור ידני.
6. גיאו-רפרנס: אם ב-DXF יש `GeoData` (ITM EPSG:2039) → `affine_local_to_crs` ישירות; אחרת 2–3 נקודות בקרה (פינות גג) מול האורתופוטו → `skimage.transform.estimate_transform('similarity'|'affine')` (דוח 07 §4.3, מבוסס ידע כללי — **לאימות**). ezdxf `addons.geo` מממש רק EPSG:3395 — המרות ל-ITM דרך pyproj.

**(ב) PDF וקטורי** (תנוחה מודפסת מ-GstarCAD)
- PyMuPDF `page.get_drawings()` → paths עם `items` (`'re'` מלבנים, `'l'` קווים), `color`, `width`, `rect`; מגבלות מתועדות: מתעלם מ-clipping ולא משקף שכבות OCG (discussion #2296). חלופה/השלמה: pdfplumber `page.rects/lines/curves` ("works best on machine-generated PDFs").
- קנה מידה: מסרגל/מידה ידועה בשרטוט (טקסט `get_text("dict")` ליד קו מידה) או מרוחב המודול הידוע → `px_per_m`. טקסט לשיוך מחרוזות/תגיות.
- הפלט: `modules[]` + `faces[]` משוערים, `confidence` לפי מספר המלבנים שתאמו את מידות המודול.

**(ג) רסטר** (סריקה, צילום מסך, תמונת רחפן)
- Claude vision (document/image blocks, JSON מובנה דרך `output_config.format`): רשימת מחרוזות/מספרי מודולים/תגיות/שורות; מתאים לטבלאות ו-labels, **לא** לקואורדינטות מדויקות (דוח 07 §4.2).
- קואורדינטות: המשתמש מסמן 2–3 נקודות בקרה על התמונה ועל האורתופוטו/הגג → טרנספורמציה דומה/אפינית → `modules[]` משוערים לפי השורות שזוהו. תמיד `confidence ≤ 0.6` ו-`north_verified: false`; חובה אישור ידני ב-UI (מסלול ד').
- וקטוריזציה (potrace) לא מומלצת לשרטוטים (דוח 07).

**(ד) ציור ידני על אורתופוטו ב-web UI**
- רקע: govmap XYZ (רישוי לשימוש מסחרי — **לאימות**, דוח 03 §2.8) / MapTiler / Mapbox; ציור פוליגונים (Leaflet/MapLibre + turf בדפדפן) → `faces[]`, `exclusions[]`, `lines[]` ב-WGS84 → השירות ממיר ל-ITM (pyproj) ולמסגרת מקומית (shapely: `affinity.rotate/translate`), מחשב `frame`, `north_from_up_deg`, ומוריד את אריח הרקע ל-`background` (px_per_m, origin_px) לשימוש ב-E-00/E-03 — בכפוף לתנאי הספק (Google Map Tiles אוסר שימוש בדימות מחוץ למפה — דוח 03).
- `POST /geometry/validate` מחזיר `issues[]` תוך כדי ציור.

### 3.3 ולידציה (כל המסלולים)

| בדיקה | כלי | תוצאה |
|---|---|---|
| פוליגונים תקינים, ללא חיתוך עצמי | shapely `is_valid`, `make_valid` | `error` |
| exclusions בתוך פאה | `face.contains(excl)` / חיתוך | `warning` (נחתך) |
| שטח פאות מול `Survey.usableAreaM2` | ±30 % | `warning` |
| מודולים בתוך פאה ולא בתוך exclusion | `contains` (לא `intersects`) | `error` |
| מודולים לא חופפים | STRtree על מלבנים מסובבים | `error` |
| מחרוזת על פאה אחת בלבד | קיבוץ | `error` (office-rules #5/#6) |
| מידות מודול = קטלוג ± 2 % | — | `warning` → `units_mismatch`? |
| `module_count` = מספר מודולים | — | `error` (ולידטור pydantic ייפול אחרת) |
| צפון | `georef.source` | `north_verified` |
| confidence < 0.8 | — | דורש אישור ידני לפני S06 |

---

## 4. תכנון מהיר S03 — פריסה ומחרוזות (d)

מטרה: תוך דקות, מהסקר בלבד, להגיע ל-`module_count`, מחרוזות תקינות, kWp/kW AC ותפוקה — להצעת המחיר. **לא** מייצר גיליונות (אלא preview E-03 אופציונלי). מקור האלגוריתם: דוח 03 §3.1 ותוכנית אב §8.2; רפרנסים לקריאה בלבד (לא תלות): Solar-Lead `panel_packing.py`, rooftop-pv-placement, zonzelf `pv-string.ts`.

### 4.1 קלט
`RoofGeometry` (לפחות `faces[]`; ללא פאות → פאה מלבנית אחת מ-`usableAreaM2` עם `azimuthDeg/tiltDeg` של הסקר, `# VERIFY`), `module` ו-`inverter` מהקטלוג (או רשימת מועמדים לפי `preferences.inverterBrand`), `target {sizeKwp | budgetCents}`, `rules` (setbacks, pitch, מרווחים), `t_min_c`, `t_max_cell_c`.

### 4.2 שלבים
0. **יעד**: `n_target = ceil(target.sizeKwp·1000 / p_max_w)` אם ניתן; אחרת "מקסימום שנכנס" (ומסוננים אח"כ לפי חיבור: R7 `P/0.9 > connection` → אזהרה "הגדלת חיבור").
1. **לכל פאה** (`face`): סיבוב הפוליגון וה-exclusions כך שכיוון השורות = ציר x (`shapely.affinity.rotate(face, -azimuth_rel)`); setbacks: `face.buffer(-setback_m)` לפי Rule `layout.setback_edge_m` (ערך **לאימות** — תלוי R19/הוראות כבאות, V9), exclusions `.buffer(clearance_m)`.
2. **רשת**: pitch עמודה = רוחב מודול (לפי orientation) + `gap_m` (0.02 ברירת מחדל eplan); pitch שורה בגג **שטוח עם הטיה** = `L·cos(tilt) + L·sin(tilt)/tan(α_winter)` כאשר `α_winter` = גובה השמש ב-21.12 בשעה 9:00/15:00 שמש מקומי לקו הרוחב (pvlib `solarposition.get_solarposition`), או Rule `layout.row_pitch_m` כשברק קובע; בגג **רעפים/איסכורית בשיפוע הגג** = אורך המודול + `gap_m` (שורות צמודות). שבילי תחזוקה כל N שורות — Rule `layout.path_every_rows` (**לאימות**).
3. **מועמדים**: לכל תא ברשת מלבן; שמירה רק אם `face_inner.contains(rect)` **ו**-`not any(excl.intersects(rect))` (`contains`, לא `intersects` — דוח 03).
4. **וריאציות**: portrait/landscape × אזימוט שורות ∈ {0°, ±5°, ±10°, "מקביל לקצה הארוך"} ביחס לאזימוט הפאה (ברעפים: רק מקביל לרכס). בחירה לפי: (1) מספר מודולים ≥ יעד, (2) תפוקה (pvlib, §5) כשיש שוויון, (3) פחות שורות שבורות.
5. **חיתוך ליעד**: אם יש יותר מ-`n_target` — מסירים מהשורות הקצרות/הכי מוצלות קודם, שומרים שורות שלמות.
6. **מחרוזות (eplan)**: לכל פאה בנפרד (office-rules #5: אוריינטציה אחת למחרוזת; #6: מקבילות באותו MPPT שוות אורך). `eplan.strings.allocate(module_count_face, module, inverter, t_min_c, t_max_cell_c, rules)` מחזיר `Allocation(per_mppt, margin_pct)` ממוין (יותר MPPT, פחות פיזור, מרווח Voc גדול); רב-פאות: חיפוש ממצה על חלוקת MPPT לפאות (pv-design-rules §2 "search all splits"), עד `inputs` מחרוזות ל-MPPT. בדיקות: `evaluate_string` (Voc_cold ≤ Vdc max·safety, Voc ≤ MPPT max, Vmp_hot ≥ MPPT min, ≥ start voltage, חתך, מפל) ו-`evaluate_mppts` (strings ≤ inputs, ΣImp ≤ I max, ΣIsc·factor ≤ Isc max, אורכים שווים, נתיכים). ה-rules הנדרשים: `v_dc_max_safety, dc_cable_min_mm2, dc_drop_max_pct, dc_current_factor, string_fuse_above_strings` (מתוך 18 ה-`LIMIT_SPECS`).
7. **DC/AC**: `p_dc_kwp / p_ac_nom ≤ inverter.pv_oversize_ratio_max`; מעל → check נכשל → מוצג לברק (לא נחסם ב-S03).
8. **תיוג**: מודולים `S<k>.<i>` לפי סדר חיווט (נחש: מתחיל ברזר/`string_start: low`), `layout[]` לפי §3.1.
9. **פלט**: `RoofGeometry.modules[]`, `strings[]` (אורך משוער `# VERIFY`), `checks[]`, `allocations[]` (3 האפשרויות הטובות — להצגה בהצעה/ל-E-04A בהמשך), PNG preview (E-03 מופשט דרך `draw_roof` או matplotlib), `summary {modules, p_dc_kwp, p_ac_kw, dc_ac_ratio, per_face[]}`.

### 4.3 מגבלות S03
- ללא הצללה מבניינים/עצים (רק מרווח שורות); exclusions עם `shades: true` מגדילים clearance בלבד. הצללה אמיתית — §5 (horizon) או Google Solar dataLayers (**לאימות** כיסוי, V15).
- ללא תוואי כבלים/תעלות → אורכים משוערים; מפלי מתח ב-S03 הם אינדיקציה בלבד.
- מצב ידע: S03 רץ עם `include_candidates=True` (כמו `--allow-candidates`) → תוצאה `provisional` מסומנת בהצעה "תכנון ראשוני — לאימות בתכנון מפורט". S06 לעולם לא.
- אם `faces[]` חסר וגם `usableAreaM2` חסר → `blocked{GEOMETRY_INVALID}` (תואם `assessCompleteness`: שטח **או** יעד kWp חובה).

---

## 5. תפוקה — pvlib + PVGIS (e)

### 5.1 צינור
1. **מזג אוויר**: `pvlib.iotools.get_pvgis_tmy(lat, lon, outputformat='json', raddatabase='PVGIS-SARAH3')` (PVGIS 5.3; כיסוי ישראל ב-SARAH3 — **לאימות** בקריאה אחת, דוח 03 §8.2) + `get_pvgis_horizon(lat, lon)` לאופק. חלופה לפרויקטים מסחריים: `get_meteonorm_tmy` (CHF 320/שנה) או Solcast (הצעת מחיר). **לא** להשתמש ב-`PVcalc` של PVGIS כתוצאה — רק כנתוני קלט (דוח 03 §2.2).
2. **מודל**: `pvlib.modelchain.ModelChain` עם `Location`, `PVSystem` לכל פאה (`Array` עם `surface_tilt/azimuth`, `module_parameters`, `temperature_model_parameters` SAPM "open_rack_glass_glass" / "insulated_back_glass_polymer" לפי `roof_type`), אובדני DC (`pvlib.pvsystem.pvwatts_losses` כברירת מחדל: לכלוך, מיסמץ', חיווט — ערכים כ-Rule `yield.losses.*`), AC דרך Sandia/CEC inverter או `pvwatts_ac` כשאין פרמטרים. הצללת שורות: `pvlib.shading.shaded_fraction1d` + `direct_martinez` לגגות שטוחים עם שורות. אופק: מסכת אופק מ-PVGIS מוחלת על DNI (sun elevation < horizon → 0).
3. **פרמטרי ציוד** (סדר עדיפות): (א) `Product.tech.cec` (CEC single-diode מ-`pvsystem.retrieve_sam('CECMod')` לפי SKU, או ממירים `CECInverter` — ממירי 3Φ ישראליים עשויים להיעדר, **לאימות** לפי SKU); (ב) PAN/OND מהיצרן דרך `pvlib.iotools.read_panond` (`utf-8-sig`); (ג) `pvlib.ivtools.sdm.fit_cec_sam` מערכי דף הנתונים (Pmax, Voc, Isc, Vmp, Imp, α, β, γ, NOCT) שכבר בקטלוג ל-eplan. מקור הפרמטרים נרשם ב-`yield.params_source`.
4. **פלט** (`yield_json`): `annual_kwh`, `monthly_kwh[12]`, `specific_yield_kwh_per_kwp`, `pr` (= E_AC / (H_POA/1000 · P_dc)), `per_face[]`, `assumptions {weather_db, tmy_years, losses, temperature_model, shading_model, params_source, degradation_pct_per_year: 0.4–0.55 (Rule), pr_target}`, 8760 כקובץ CSV אופציונלי (`artifact role: yield_8760`). ל-ROI (מודול `quotes`): `monthly_kwh`, `specific_yield`, הנחת PR, degradation — ה-ROI עצמו (NPV/IRR, תעריפים R1–R6) אינו בשירות.
5. **הנחת PR**: הצעה מציגה PR מחושב; אם אין נתוני הצללה → `pr_note: "ללא הצללה מבנים"`. ערך סביר בישראל ~1,550–1,750 kWh/kWp (דוח 03 — ⚠️ תלוי אתר) משמש כ-**sanity check** בלבד: חריגה ±20 % → warning.

### 5.2 cache
- טבלה `yield_cache` (Postgres, או קבצים ב-`CAD_DATA_DIR/cache/pvgis`): מפתח TMY = `(round(lat,3), round(lon,3), raddatabase)` (≈ 100 m) ו-horizon באותו מפתח; TTL שנה. מפתח תוצאה = sha256 של `(tmy_key, tilt, azimuth, module_params_hash, inverter_params_hash, losses_hash, shading_hash)`.
- PVGIS: ≤ 30 קריאות/שנייה ל-IP, 429/529 → retry מעריכי (3 ניסיונות); ייחוס JRC בהצעה (**לאימות** נוסח).
- **Google Solar API** (אופציונלי): `buildingInsights` (10k/חודש חינם) ו-`dataLayers` (1k/חודש חינם; hourlyShade GeoTIFF) — רק כשכיסוי ישראל מאומת (V15, החלטה פתוחה #10). שימוש: אימות הצללה/DSM ו-sanity של `annual_kwh` מול `solarPotential`, לא כמקור ראשי.
- SolarEdge Designer / Huawei SmartDesign: אימות ידני, ייצוא DXF של קווי המתאר אליהם (דוח 03 §1).

---

## 6. תכנון מפורט S06 — הרצת eplan (f)

### 6.1 פקודות
השירות מריץ את eplan כספרייה (ייבוא `domain.electrical.pv.design.design`, `cli._draw`) ולא כתת-תהליך, כדי לקבל אובייקטים; הפקודות השקולות ב-CLI (לדיבוג במשרד):

```
eplan --db $EPLAN_DB pv rules                                   # מה ניתן לפתור מהזיכרון + GAPs
eplan --db $EPLAN_DB pv design <spec.yaml> --out <dir> --stem <stem> --pdf --png --dpi 150 --json
eplan --db $EPLAN_DB pv status <task_id>
eplan --db $EPLAN_DB pv correct <task_id> edited.json --class ENGINEERING_JUDGMENT --reason "…"
eplan --db $EPLAN_DB pv allocate <spec.yaml> --limit 5
```
`design` מסיים ב-exit 2 ומדפיס `summary` (עם `stop_reason`) כשהמשימה לא `DONE`; `--json` מחזיר `{summary, report}`. `--allow-candidates` ו-`--rule k=v` **אסורים** ב-S06 (override נרשם כהנחה ולא כידע; S06 דורש ידע VALIDATED).

### 6.2 מסד הכללים — מ-`eplan.db` (SQLite) ל-`rules` ב-Postgres
מצב קיים: `orchestrator.System.open(db)` פותח SQLite מקומי (`EPLAN_DB`, ברירת מחדל `data/eplan.db`); `eplan pv seed` יוצר CANDIDATE/LEVEL_0 ל-18 ה-`LIMIT_SPECS` ולפרוצדורות; `--approve --reviewer` מקדם ל-VALIDATED/LEVEL_2 עם שם הבודק.

אסטרטגיה (שלבים):
1. **M0**: טבלת `rules` ב-Postgres (תוכנית אב §5) מקבלת שורה לכל `LIMIT_SPECS` key עם `key = 'eplan.<key>'`, `scope = 'pv_design_limit'`, `threshold` (ערך+יחידה), `source`/`section` מ-`rules.seed_items()`, `verification = office` (B.E.E. amendments) או `summary` (IEC שלא אומת מהטקסט), `verified_by = null`. ברק מאשר ב-UI → `validated`, `verified_by`, `verified_at`.
2. **M4 (שלב א', ללא שינוי ב-eplan)**: בתחילת כל job השירות מבקש `GET /api/rules?scope=pv_design_limit` מה-Core, כותב קובץ seed JSON, ומריץ `seed_from_rows()` — מתאם קטן (קוד חדש ב-`services/cad`) שממפה `verification` → רמת eplan: `unverified|summary` → CANDIDATE/LEVEL_0; `office` → VALIDATED/LEVEL_2 (`reviewer = verified_by or 'B.E.E. office rules'`); `validated` → VALIDATED/LEVEL_2 (`reviewer = verified_by`). ה-SQLite הוא **cache נגזר** בתוך הקונטיינר, נבנה מחדש כשה-`rules_snapshot.sha256` משתנה; הוא נשמר כ-artifact (`eplan_db`) לשחזור. supersession ב-eplan משתקפת כגרסה חדשה של השורה ב-`rules` (`valid_from`).
3. **M4 (שלב ב', אופציונלי)**: מימוש `orchestrator/db.py` מול Postgres (ממשק ה-DB של האורקסטרטור לא נבדק במפרט זה — **לאימות** היקף העבודה), כדי שגם PROJECT/ROUTING/FAILURE memory יהיו במסד המרכזי.
- **candidate מול validated**: `design.full` רץ עם `include_candidates=False` בלבד. כלל חסר/לא מאושר → `BLOCKED` לפני PLAN (`HUMAN_INPUT_REQUIRED`). `design.quick` רץ עם candidates → `provisional`.
- כללי המשרד (22) וכללי R1–R24 אינם `LIMIT_SPECS`; הם משפיעים על **spec generation** (§2) ועל שורות ההצעה, לא על `DesignRules`. כלל חדש שברק רוצה שהמנוע יאכוף → מתווסף ל-`LIMIT_SPECS` + ולידטור (שינוי קוד ב-eplan).

### 6.3 טיפול ב-BLOCKED / HUMAN_INPUT_REQUIRED / VALIDATION_FAILED
| מצב ב-eplan (GENERATOR.md "What blocks") | תגובת השירות | תגובת ה-Core |
|---|---|---|
| `NEED_INFO missing validated rule: <key>` | `blocked{NEED_INFO, key}` | Task לברק "אישור כלל `<key>`" עם הערך המוצע והמקור; `Project.status = waiting_engineer` |
| `CONFLICTING_RULES` | `blocked{CONFLICTING_RULES, key, values[]}` | Task: לבחור/להחליף (supersede) |
| `VALIDATION_FAILED → MAX_RETRIES_REACHED` | `blocked{VALIDATION_FAILED, checks_failed[]}` | מסך "חריגות": לכל check — value/limit/unit/rule; אפשרויות: לשנות spec (ציוד/מחרוזות) **או** `owner_accepted` |
| `BUDGET_EXHAUSTED` (FAST) | לא רלוונטי — S06 רץ `STANDARD` | — |
| spec לא תקין (pydantic) | `failed{SPEC_INVALID, errors[]}` | תיקון ב-specgen / גיאומטריה |

**סבב `owner_accepted`** (office-rules #2; GENERATOR.md "Owner decisions"): ברק מאשר חריגה ב-UI → רשומה ב-`design_decisions {design_id, check (substring של שם ה-check), reason (עברית בלבד), date, decided_by}` → spec rev חדש עם `owner_accepted[]` → job `design.full` חדש → ה-check מסומן `accepted = reason` ומוצג ב-E-04 כ"בעלים" (לא OK, לא כישלון); הולידטורים מכבדים את אותן החלטות (DC/AC). ההחלטה נשמרת גם ב-`project_events(design.owner_accepted)`. מחיקת החלטה = rev חדש בלי השורה.

**סבב STATUS/RESULT/NEXT** (SKILL.md §9): אחרי כל ריצה הסוכן "Design assistant" (תוכנית אב §14) מייצר הודעה מה-response: STATUS (done/provisional/blocked), RESULT לכל גיליון (audit, הערות), NEXT = רק החלטות ברק/בדיקות באתר (`verify[]`, `blockers[]`). ההודעה נשלחת לברק בלבד (self-chat), לא ללקוח.

### 6.4 מחזור חיי גיליון האפשרויות (E-04A)
1. `design_alternatives {design_id, key ('א','ב'…), title, kind (variant|inverter|design), changes JSON (module/remove_rows/rows/string_start/strings/needs), status (proposed|calculated|chosen|rejected)}` — מקור: S03 `allocations[]`, הצעות הסוכן, או ברק.
2. ב-spec: `alternatives[]` + `alternatives_sheet: true` כל עוד יש `proposed/calculated`; eplan מחשב כל אפשרות עם ה-rules של הריצה (`alternatives.evaluate`) ומצייר E-04A עם תוכניות גג מוקטנות.
3. ברק בוחר → `chosen`: ה-`changes` מוחלים על ה-spec (rev חדש), `alternatives_sheet: false`, השאר `rejected`. office-rules #3/#18: הגיליון נעלם מהסט אחרי ההחלטה.
4. `kind: inverter` → מייצר "דרישות מממיר חלופי" (מספרי התכנון) → מזין חיפוש בקטלוג.

### 6.5 תוצרים → Document records
לכל job `done`/`provisional`:

| artifact | Document.kind | הערות |
|---|---|---|
| `<stem>_E-00…E-08.dxf` | `drawing_dxf` (per sheet) | מקור האמת של הגיליון; `generated_from {design_rev, rules_snapshot, eplan_version, template_rev: sheet.py sha}` |
| `<stem>_E-xx.pdf/.png` | `drawing_pdf_preview`, `drawing_png` | preview (PyMuPDF); לא "רשמי" |
| `<stem>_SET.pdf` | `drawing_set_preview` | E-00…E-07 + K-xx + E-08 אחרון (`_draw`) |
| `<stem>_BOM.csv` | `bom_csv` | עמודות: קטגוריה,פריט,מפרט,יחידה,כמות,בסיס; קבוצות: ציוד ראשי · DC · AC · הארקה · תעלות · עיגון ושילוט · קונסטרוקציה * |
| `bom.json` | `bom_json` | ה-CSV + `catalog_match` (§6.6) |
| `<stem>_calc.txt`, `calc_report.json` | `calc_text`, `calc_report` | CalcReport מלא |
| `spec.yaml` | `design_spec` | ה-spec בדיוק כפי שרץ (immutable לפי rev) |
| `geometry.json` | `design_geometry` | RoofGeometry |
| (אחרי worker) `<stem>_E-xx.dwg`, `<stem>_SET_official.pdf` | `drawing_dwg`, `drawing_set_official` | ממלא `supersedes` של ה-preview; זה מה שמוגש לחח"י/לבודק |

`Document` לעולם לא נמחק; rev חדש = רשומות חדשות עם `supersedes`.

### 6.6 BOM → QuoteVersion (diff רוויזיה)
1. `bom.json` → לכל שורה: `{group, item, spec, unit, qty, basis}` + `catalog_match {product_id|null, confidence, how: exact_spec|regex|assembly|manual}` דרך טבלת מיפוי `bom_item_map` (ביטוי על `item`/`spec`, למשל `H1Z2Z2-K 1X6mm²` → SKU כבל DC 6 mm²). שורות ללא התאמה → `unmatched[]` לברק (מיפוי שנשמר לפעם הבאה).
2. מודול `quotes` יוצר `QuoteVersion` טיוטה חדשה מה-BOM (כמויות מדויקות מהגיאומטריה, "no reserves, no round-ups" — sheets.md E-08), שומר על שורות העבודה/שירותים/אגרות מה-QuoteVersion הקודם, ומציג **diff** לברק: שורה, כמות ישנה (ערכה S03) → חדשה (BOM S06), Δ מחיר, מקור (`basis`). ברק מאשר → גרסה; שליחה → נעילה (trigger). השירות אינו נוגע במחירים.
3. `Document(bom_csv).generated_from.design_rev` ↔ `QuoteVersion.generated_from.bom_document_id` — שרשרת מקור מלאה.

---

## 7. צינור DWG (g)

### 7.1 מוסכמות DXF ל-placeholders (בצד eplan/ezdxf)
- גרסת DXF: **R2018** (`ezdxf.new("R2018")`) — נדרש ע"י CAD worker ו-dynblock; eplan כיום יוצר `R2010` (`sheet.py`) — **שינוי נדרש** (§12).
- `$INSUNITS = 4` (mm), `$DWGCODEPAGE` UTF-8, שכבות מרשימה סגורה (`LAYERS` ב-`sheet.py` + `BEE_DYN`), סגנונות טקסט `ARIAL`/`ARIAL-B` (ל-worker: ראו §8.3 גופנים).
- **בלוקים רגילים (186)**: INSERT ישיר של הגדרת הבלוק מה-DXF שבספרייה (`ezdxf.xref.load_modelspace`/`write_block` או העתקת BLOCK) + ATTRIB לכל ATTDEF (`add_auto_attribs`), כולל `CATNO` (מק"ט — ריק בספרייה, מתמלא מ-`Product.sku`).
- **בלוקים דינמיים (152)**: INSERT של **placeholder** — בלוק סטטי `BEE_PH_<name>` (מלבן bbox + טקסט שם, בשכבה `BEE_DYN`, צבע 6) עם:
  - XDATA app id `BEE_DYN`: `[(1000, "name=<dyn block name>"), (1000, "state=<visibility state>"), (1000, "props=<k1=v1;k2=v2>"), (1000, "attrs=<TAG1=val;TAG2=val>"), (1000, "lib=<library dwg relative path>"), (1000, "sha=<sha256 of library dwg>")]` (XDATA נתמך ב-ezdxf — `entity.set_xdata`; **לאימות** מול גרסה 1.4.4 רק ברמת ה-API).
  - אותם ערכים גם כ-ATTRIB על ה-placeholder (`BEE_NAME`, `BEE_STATE`, `BEE_PROPS`) — כך שגם צופה ללא worker רואה מה אמור להיות שם.
  - ה-DXF **מרונדר נכון גם בלי worker**: ה-placeholder כולל את הסמל של מצב ברירת המחדל כקווים (העתק מהווריאנט הסטטי `NAME__STATE`, אם קיים — אסטרטגיית flatten §7.4).
- ה-preview (PDF/PNG/SVG) מציג placeholders; ה-DWG/PDF הרשמיים מציגים את הבלוקים הדינמיים.

### 7.2 פרוטוקול ה-worker (Windows, GstarCAD)
תור משיכה (pull) דרך HTTPS מה-Core (Tailscale/Cloudflare Access; token ייעודי `BEE_WORKER_TOKEN` עם תפקיד `cad_worker`), כי ה-worker מחוץ ל-Docker:

```
GET  /api/cad-jobs/next?kinds=dwg.bind,dxf.export                → claim (lease 15 דק', heartbeat)   [מודול modules/cad-jobs, מפרט 16/17]
GET  /api/cad-jobs/{id}/inputs                                   → presigned GET ל-DXF, ל-SOURCES, ל-library index
POST /api/cad-jobs/{id}/heartbeat
POST /api/cad-jobs/{id}/result   {status, artifacts[{role, sha256, bytes}], log, cad: {product, version, python|dotnet|pyrx}}
POST /api/cad-jobs/{id}/fail     {error, attempt}                → retry עד 3 → DLQ + התראה
PUT  <presigned R2 URLs>                                          → DWG, PDF רשמי, log
```
חשיפה: route ב-Caddy ל-Tailscale בלבד (כמו `/status/*`), לא דרך Cloudflare; token מ-`CAD_WORKER_TOKENS` בשרת.
Job JSON (`design-job.schema.json#/$defs/DwgBindJob`): `design_rev`, `sheets[]{sheet, dxf_url, stem}`, `library {dwg_index_url, version, sha256}`, `plot {ctb: 'SARA.ctb'|<office ctb>, pc3: 'DWG To PDF.pc3', paper: 'A3', scale: '1:1'}`, `save_as: 'AC1032' (DWG 2018)`, `audit: true`, `purge: true`, `shx_fonts: ['heb.shx', 'simplex.shx', …]`.

**צעדי הסקריפט** (GstarCAD Python API — מאז 2025, ~790 ממשקים, Python 3.11.8, Win10+; או .NET `GStarCad.Net` 20.26.1; או **cad-pyrx** 3.1.13 LGPL — GstarCAD 2024–2026 נתמך, **2027 לא אומת**; דוח 07 §2):
1. `OPEN <sheet>.dxf` (ב-UI-less: `/b script.scr` או API; ל-GstarCAD אין `accoreconsole` מתועד — **לאימות**).
2. סריקת INSERT בשכבה `BEE_DYN` / עם XDATA `BEE_DYN` → לכל אחד: ודא שהגדרת הבלוק הדינמי קיימת במסמך (אם לא: `Database.Insert`/`wblockClone` מה-library DWG שמופיע ב-`lib`), `INSERT` במיקום/סיבוב/סקאלה של ה-placeholder, קבע `DynamicBlockReferenceProperty` (`Visibility` = state, lookup/distance מ-`props`), העתק ATTRIB (`attrs` + `CATNO`), מחק את ה-placeholder. ספירה: `replaced`, `missing_block[]`, `bad_state[]`.
3. `AUDIT` (Y), `-PURGE` (all, N), פתיחה חוזרת לאימות; השוואת ספירת ישויות מול ה-DXF (±placeholders).
4. `SAVEAS` DWG 2018 (`AC1032`) `<stem>_E-xx.dwg`.
5. `PLOT` עם `DWG To PDF.pc3` + `SARA.ctb` (או CTB משרדי) → `<stem>_E-xx_official.pdf`; מיזוג לסט ב-Core (pypdf) או ב-worker; השוואת PNG מול ה-preview (§10).
6. העלאה + `result`. כישלון בצעד 2 עם `missing_block` → `failed{BLOCK_MISSING}` → Task "להוסיף בלוק לספרייה".
- **קלט מקבלנים** (`dxf.export`): `OPEN <constructor>.dwg` → `DXFOUT` 2018 → העלאה; זה המסלול של §3.2(א).
- Idempotency: `job_id` ב-XDATA של ה-DWG (`BEE_JOB`) + sha256 של ה-DXF; ריצה כפולה מחזירה את אותו פלט.
- פריסה במשרד: שירות Windows/משימה מתוזמנת שמריץ `worker.py` כל 60 ש'; לוגים ל-`%LOCALAPPDATA%\bee-cad-worker\`. הרישיון: GstarCAD במשרד (החלטה פתוחה #3 — מי מחזיק; V19).

### 7.3 חלופות ללא worker
- **APS Design Automation (AutoCAD בענן)**: DWG מלא כולל בלוקים דינמיים, Flex tokens — מחיר **לא אומת**.
- **Aspose.CAD** (~799$): DXF→DWG, בלוקים דינמיים **לא אומת**.
- **ODA File Converter**: רק עם חברות ODA ($3,000 שנה ראשונה); ללא חברות — שימוש לא-מסחרי בלבד; ה-DWG שבספרייה (`blocks\*.dwg` ו-33 קבצי הבדיקה) נוצרו ב-ODA ומציגים "Foreign DWG" (HANDOFF §3) — **לייצר מחדש מ-GstarCAD** לפני הפצה ללקוחות.
- **LibreDWG**: לא כותב R2010–R2018 באופן אמין (CRC) — לא.
- **ezdxf-fork `dynblock`** (pucejuice): ניסיוני, דורש seed מ-CAD לכל בלוק/מצב, לא אומת ב-CAD — לא לייצור.

### 7.4 fallback: שיטוח בלוקים דינמיים לווריאנטים סטטיים
סקריפט חד-פעמי ב-GstarCAD (LISP/Python) על 152 הבלוקים: לכל מצב נראות → `WBLOCK` של בלוק סטטי `NAME__STATE` (DWG + DXF דרך `DXFOUT`), עדכון `index.json` (`variants[]` — כבר יש 155 variants בספרייה לפי HANDOFF; לבדוק אם אלו אותם מצבים — **לאימות**). eplan משתמש בווריאנט ישירות (INSERT רגיל). חסרון: משתמש AutoCAD מאבד את "הגריפ"; יתרון: DXF/PDF נכונים בכל כלי, אפילו ב-Linux. שתי האסטרטגיות משתלבות: הווריאנט הסטטי הוא גוף ה-placeholder (§7.1).

---

## 8. רינדור ותצוגה מקדימה (h)

### 8.1 Backends
- **PDF**: `ezdxf.addons.drawing.pymupdf.PyMuPdfBackend` → `get_pdf_bytes()` (וקטורי, קל) במקום matplotlib `savefig` הנוכחי (`render.py`); `draw_layout()` על פריסת נייר A3 כשנעבור לפריסות (היום הכל ב-modelspace במ"מ A3 — `sheet.py`). בדיקת גודל: 1190.55×841.89 pt.
- **PNG**: `get_pixmap_bytes(fmt="png", dpi=150)` (קבוע ל-baseline) + 110 dpi למבט אנושי (drawing-standard §6).
- **SVG לכל שכבה**: `SVGBackend` עם filter לפי שכבה → `<stem>_E-xx.<layer>.svg`; ב-web: `<g data-layer>` + checkbox (אותו רינדור כמו ה-PDF — עקביות). לקבצי DXF חיצוניים (קונסטרוקטור) — `dxf-viewer` 1.0.49 (MPL-2.0; מתעלם מסגנונות/גופני DXF, אין layouts) כחלופה.
- **IMAGE (אורתופוטו/איורי datasheet)**: היום `render.py` מוחק IMAGE ומצייר רסטרים ב-matplotlib (`Sheet.rasters`). עם PyMuPDF: מדיניות image ב-`Configuration` — רמת התמיכה **לא אומתה**; אם חסר, לצייר את הרסטר ב-PyMuPDF (`page.insert_image`) מתחת לווקטור.
- **PDF רשמי**: רק מה-worker (CTB, lineweights, SHX עברי) — §7.2.

### 8.2 עברית ו-bidi
- ב-DXF: **סדר לוגי** (CAD מבצע bidi בעצמו); ברינדור: `python-bidi` (`get_display(s, base_dir="R")`) על עותק (`_visual_copy`), היום ל-`TEXT` בלבד — להרחיב ל-`ATTRIB` (בלוקים עם טקסט עברי) ול-`MTEXT` אם ייכנס. drawing-standard §4: לא לערבב עברית/לטינית/מספרים במחרוזת אחת שעלולה להתהפך — specgen מייצר טקסטים לפי הכלל (יחידות בעמודה נפרדת).
- מה ש-GstarCAD/AutoCAD עושים עם מחרוזת לוגית + TTF עברי לעומת heb.shx — **לא אומת** (דוח 07 §1); בדיקת קבלה ב-GstarCAD 2027 על גיליון E-01 בשני המסלולים לפני M4.

### 8.3 גופנים
- קונטיינר: **Rubik** TTF (הגופן הממותג של bee-build/ההצעות) ל-`ARIAL`/`ARIAL-B`? — היום `FONT`/`FONT_BOLD` ב-`sheet.py` (Arial/Liberation); החלטה: סגנון `BEE` = Rubik Regular/Bold ב-DXF (`style.font = 'Rubik-Regular.ttf'`), עם fallback DejaVuSans ברינדור. SHX עבריים (`heb.shx`, `HEBTXT.shx`, `simplex.shx`, `mirym.shx` — הרשימה מ-eTransmit של NESPAH) ב-`CAD_FONT_DIRS` + `ezdxf.fonts.build_system_font_cache()` כדי לרנדר DXF של קונסטרוקטורים; ה-SHX עצמם לא מופצים (רישיון) — מועתקים ממחשב המשרד.
- worker: הגופנים מותקנים ב-GstarCAD (`Fonts\`), `gcad.fmp` למיפוי.

### 8.4 בלוק הכותרת (ISO 7200 + סגנון המשרד)
כיום `TitleInfo` (sheet.py): מתכנן, פרויקט, כתובת, שם התוכנית, מס' תוכנית, מהדורה, תאריך, קנ"מ, גיליון n/N, טבלת מהדורות. סגנון המשרד (boards-bee-style §4) וה-ISO דורשים יותר. הגדרת השדות (ל-`TitleInfo` מורחב + ATTRIB בבלוק `lm_frame2` של הספרייה כשנעבור אליו):

| שדה (ATTRIB TAG) | ISO 7200 | מקור | חובה |
|---|---|---|---|
| `OWNER` (מתכנן/בעל המסמך) | legal owner | "ברק הנדסת חשמל" | ✓ |
| `CLIENT` (שם המזמין) | — | Customer.name | ✓ |
| `PLANT` (שם המתקן) | title | Site.name/כתובת | ✓ |
| `TITLE` (תוכנית / שם הגיליון) | title | sheet title | ✓ |
| `DRAWING_NO` (מס' תוכנית) | identification number | `<Project.code>-E-xx` | ✓ |
| `SHEET` n/N | sheet number | `_draw` | ✓ |
| `REV`, `DATE` | revision index, date of issue | Design.rev, job date | ✓ |
| `SCALE`, `UNITS` (mm) | scale, units | per sheet | ✓ |
| `DRAWN_BY` (שרטט) | created by | "B.E.E Engine / eplan <ver>" או שם | ✓ |
| `APPROVED_BY` (**מהנדס מאשר**) + מס' רישיון | approved by | ברק (Project.engineer) | ✓ (ללא חתימה/חותמת — office-rules #12) |
| `DOC_TYPE` | document type | "תוכנית חשמל" | ✓ |
| `STATUS` boxes: Preliminary / לאישור / Construction / **As-Made** | document status | `Design.status` (`review`→Preliminary, `approval`, `construction`, `as_made`) — תיבה מלאה = סטטוס נוכחי | ✓ |
| `INVERTER`, `MODULES`, `OPTIMIZERS`, `SIZE_KWP` | — | spec (סגנון המשרד) | על E-00/E-01 |
| `IEC_FILE_NO` (מס' תיק חח"י) | — | Submission.externalRef | אופציונלי |
| `GUSH_HELKA` | — | Site | אופציונלי |
| `LEGAL` | legal notice | "התוכנית תקפה רק עם חתימת המהנדס" — **לאימות** מול הנוהל המשרדי | אופציונלי |

ISO 5457 (A3: שוליים 20 mm שמאל/10 mm, רשת ייחוס) — פרטי התקן **לא אומתו** מהטקסט (דוח 07 §6); eplan כבר מצייר רשת 1–12/A–H.

---

## 9. שילוב ספריית הבלוקים (i)

- מיקום: `CAD_BLOCK_LIBRARY_DIR` (עותק של `bee-block-library/` מהסקיל, מתויג גרסה + sha256 של כל קובץ; ב-R2 כ-`library/<version>/…`). ה-worker מקבל את אותה גרסה (`library.version` ב-job).
- **`index.json`** (HANDOFF §"מה ב-zip"): מפתח לכל בלוק → `{file_dxf, file_dwg, png, category (sld_symbols|cabinets|frames|…), dynamic: bool, states[], variants[], attributes[{tag, prompt, default}], manufacturer, family}` — **המבנה המדויק לאימות** מול הקובץ (לא היה זמין במפרט זה). השירות טוען אותו פעם אחת ובונה `BlockCatalog` (lookup לפי שם/קטגוריה/יצרן).
- **שמות**: שם הבלוק בספרייה (כולל שמות בעברית כמו `ABB מאז`) נשמר כ-`name`; placeholder `BEE_PH_<slug>`; וריאנט סטטי `NAME__STATE`. שמות בעברית ב-BLOCK name — AutoCAD/GstarCAD תומכים ב-Unicode, ezdxf כותב UTF-8 ב-R2007+; **לאימות** ב-GstarCAD 2027 בשמות מעורבים.
- **מיפוי אטריביוטים**: `CATNO` ← `Product.sku` (ריק בספרייה אחרי הניקוי מ-ELMORNO/NSRNO); `RATING`/`IN`/`POLES` ← `Device.rating/poles` של CalcReport; `TAG` ← `Device.tag` (Q-INV, Q-MAIN, RCD…); `NAME14/NAME15` נמחקו — לא להשתמש. תגיות שלא קיימות ב-ATTDEF של הבלוק → warning (לא שגיאה).
- **חד-קו מהבלוקים** (דוח 07 §5.1): E-01 של eplan מצויר היום בסמלים שלו (`symbols.py`); המעבר לבלוקי הספרייה (ABB/Schneider) הוא אופציה ל"חד-קו לוח" (לוח איסוף, T4P) — פריסה דטרמיניסטית בעמודות (או elkjs ב-Node) → INSERT. לא חלק מ-M4 הכרחי.
- **33 הבלוקים הממתינים** (`dynamic\_test_in_autocad\`): בדיקת קבלה במשרד ב-AutoCAD/GstarCAD מלא: INSERT `03_sld_symbols\ABB מאז.dwg` → יש גריפ visibility? כן → `index.json` מעדכן `verified_in: 'AutoCAD 2025'|'GstarCAD 2027'` ו-33 הקבצים עוברים למקום הקבוע; לא → `BEE_CLEANLIB.lsp` (AutoCAD 2021+, לא נבדק) על עותק → החלפה. עד אז 33 אלה **מסומנים `dynamic: pending`** ו-specgen משתמש בווריאנט סטטי/placeholder בלבד.
- **משפחת ארונות חדשה** (HANDOFF §5): קטלוג יצרן → תיקייה `cabinets/<manufacturer>/`, בלוק לכל יחידה (DXF+DWG+PNG), כללי הרכבה (`README`: תאים, רוחבים 800/600/300, פלינט, גגון), `index.json` entries עם `family`, `dims_mm`, `modules_18mm` (DIN 43880) — ו-`Product` תואם בקטלוג (kind `cabinet`) כדי שהתמחור והשרטוט יצביעו על אותו SKU. חזית לוח (E-05 ארון) = מודל JSON (רוחב/גובה/מסילות DIN/רכיבים ברוחב 18 mm) → ezdxf (דוח 07 §5.3).

---

## 10. שערי איכות (j)

| שער | כלי | סף | מתי |
|---|---|---|---|
| **Overlap audit** | `sheet.text_overlaps`, `text_line_collisions`, `text_extra_collisions` (eplan) | **0/0/0** לכל גיליון | כל job; כישלון → `provisional` עם `audit.failed_sheets[]` (לא `done`) |
| **DXF lint** | `doc.audit()` → `Auditor.errors` = 0; lint משרדי: שכבות מותרות בלבד, סגנון טקסט + גופן קיים, כל ATTRIB מלא, אין בלוק לא-מוגדר, `$INSUNITS=4`, גרסה R2018 | 0 שגיאות | כל job |
| **PNG visual regression** | PNG ב-150 dpi מ-PyMuPDF; `pixelmatch` (threshold 0.1, `includeAA`) או `odiff` (מהיר יותר, ignore regions); מסכה על תאריך/מהדורה/sha | `maxDiffPixelRatio ≤ 0.002` מול baseline של אותו design rev-1 **כשהשינוי היה אמור להיות מקומי**; אחרת — דו"ח diff לברק | job עם `baseline_design_rev` |
| **PDF checks** | PyMuPDF: מספר עמודים = index, גודל A3, טקסט עברי ניתן לחיפוש (TTF) | — | כל job |
| **Claude-vision bidi** | OCR חוזר של ה-PNG (Claude, JSON) והשוואה למחרוזות המקור בסדר לוגי (רשימת כל `TEXT` מה-DXF); תופס היפוכי bidi/מספרים בתוך עברית | 0 אי-התאמות (סף דמיון ≥ 0.9 אחרי נרמול) | `design.full`; עלות ~1 קריאה לגיליון |
| **DWG ↔ DXF** (worker) | AUDIT + reopen; ספירת ישויות; PNG של ה-PDF הרשמי ↔ PNG preview (odiff, סף רופף 2 % בגלל SHX/lineweights) | — | `dwg.bind` |
| **בדיקות** | `python -m pytest -q` של eplan (test_method, schemas, physics, drawings…) + בדיקות `services/cad` (specgen snapshot, layout על 5 גגות דוגמה, geometry extract על NESPAH-DXF, yield מול TMY מוקלט) | ירוק | CI לכל שינוי קוד; `healthz` מדווח גרסה שנבדקה |
| **מבט אנושי** | PNG ב-110 dpi + zoom; כלל #13 "האודיט לבדו לא מספיק" | — | לפני `Design.status = approval` |

**הגדרת "גמור" לגיליון**: (1) audit 0/0/0; (2) ezdxf audit 0; (3) כל הטקסטים עברו בדיקת bidi; (4) אין `VERIFY` פתוח שמשפיע על הגיליון (רשימת `verify[]` ממופה לגיליונות: צפון → E-03, דפי נתונים → E-01/E-04/E-06, אורכים → E-02/E-03/E-08); (5) כל check שנכשל מכוסה ב-`owner_accepted`; (6) ברק סימן "נבדק" ב-UI (`sheet_reviews`); (7) ל-DWG רשמי: `dwg.bind` done עם `missing_block = []`. סט "מאושר" = כל הגיליונות גמורים + `verify[]` ריק (תנאי היציאה של S06 בתוכנית אב §3).

---

## 11. פיתוח מקומי (k)

### 11.1 מחשב המשרד (Windows, ללא Docker)
```
py -3.11 -m venv .venv && .venv\Scripts\activate
pip install -e "eplan[dev]" pillow pymupdf shapely pvlib pyproj fastapi uvicorn httpx pdfplumber scikit-image
pip install -e services/cad
eplan --db data/eplan.db pv seed --approve --reviewer "ברק"      # או: bee-cad rules-sync (מושך מה-Core)
python -m pytest -q
bee-cad serve --port 8090 --data ./data/cad                     # HTTP מקומי
bee-cad run design.full examples/example-job.json --out out/    # job מקובץ, ללא Core
bee-cad geometry extract "NESPAH-543-05-תנוחה ורומים.dxf" --layers auto
```
(`bee-cad` = CLI דק של `services/cad`; נתיבים בעברית — להעביר דרך Python/ENV ולא דרך Git Bash, לקח מה-handoff.)

ה-worker: `workers/cad-windows/poller.py` עם `E:\bee-cad\worker.env` (מפרט 17 §B.6: `CAD_API_BASE`, `CAD_WORKER_TOKEN`, `GSTARCAD_EXE`, `GSTARCAD_API=python|dotnet|pyrx`, `BEE_BLOCK_LIBRARY_DIR`, `CAD_CTB_PATH`, `CAD_WORK_DIR=E:\bee-cad`, `UPTIME_KUMA_PUSH_URL_cad`), משתמש Windows ייעודי `bee-cad` עם desktop session (GstarCAD אינו headless), poller כל 30 ש'.

### 11.2 Docker (בקו החי / staging `bee-lab`)
- `services/cad/Dockerfile`: `python:3.11-slim`, `apt: fonts-dejavu libgl1` (ezdxf drawing), `pip install eplan + services/cad`; volume `/data/cad` (jobs, cache, library, fonts); user לא-root; `HEALTHCHECK /healthz`.
- `docker-compose`: שירות `cad` ברשת הפנימית, בלי פורט ציבורי; ה-Core מגיע ב-`http://cad:8090`. גבולות: `mem_limit 2g`, `cpus 2` (רינדור סט מלא ≈ 1–2 דק').
- Env (שמות לפי מפרט 17 היכן שקיימים): `CAD_DATA_DIR=/data/cad` · `EPLAN_DB=/data/cad/eplan.db` · `CORE_API_URL` + `CAD_API_KEY` (קריאות ל-Core: rules, presigned) · presigned URLs בלבד ל-R2 (בלי סודות R2 בקונטיינר) · `CAD_FONT_DIRS=/data/cad/fonts/ttf:/data/cad/fonts/shx` · `BEE_BLOCK_LIBRARY_DIR=/data/cad/library/<ver>` · `PVGIS_BASE=https://re.jrc.ec.europa.eu/api/v5_3/` · `PVGIS_CACHE_DIR=/data/cad/cache/pvgis` · `ANTHROPIC_API_KEY` (vision/bidi gate; אופציונלי — בלעדיו השערים מדולגים ומסומנים) · `GOOGLE_SOLAR_API_KEY` (אופציונלי) · `CAD_MAX_PARALLEL_JOBS=2` · `PORT=3041` · `LOG_LEVEL`. בצד ה-Core: `CAD_SERVICE_URL=http://cad:3041`, `CAD_WORKER_TOKENS`, דגל `BEE_FEATURES` כולל `design,cad`.
- תיקיות: `/data/cad/jobs/<job_id>/{in,spec.yaml,geometry.json,out/,log.txt}` (נמחק אחרי העלאה + 7 ימים), `/data/cad/cache/{pvgis,yield}`, `/data/cad/library/`, `/data/cad/fonts/`, `/data/cad/baselines/<design_id>/` (PNG ל-regression).
- CI: `pytest` + job דוגמה `design.full` על `example.yaml` חייב להסתיים `ALL CHECKS PASS` ו-audit 0/0/0.

---

## 12. אי-התאמות ופערים שנמצאו

1. **גרסת DXF**: eplan יוצר `R2010` (`sheet.py`), המחקר וה-worker דורשים R2018 — לשנות ל-`ezdxf.new("R2018")`.
2. **רינדור**: eplan מרנדר ב-matplotlib (`render.py`), התוכנית קובעת PyMuPDF backend — נדרש מעבר; תמיכת IMAGE ב-PyMuPDF backend לא אומתה.
3. **bidi**: `_visual_copy` מטפל ב-`TEXT` בלבד — ATTRIB/MTEXT (בלוקים עם עברית) לא יתהפכו ברינדור.
4. **`status`**: enum של eplan (`review/approval/tender/construction`) חסר `as_made` שנדרש ל-S10/S11 ולתיבות הסטטוס של המשרד.
5. **בלוק הכותרת**: `TitleInfo` ללא "מהנדס מאשר", מס' רישיון, שם מזמין, תיבות סטטוס — נדרשת הרחבה (§8.4).
6. **`fixing_details`**: ברירת מחדל `true` ב-`models.py`, אך office-rules #22 אומר "לא אלא אם ביקשו" — להפוך ל-`false` ב-specgen.
7. **Survey → roofType**: `'פנל מבודד' → 'metal-standing-seam'` ב-`schema.ts` שגוי סמנטית (פנל מבודד ≠ standing seam); משפיע על ערכת הקונסטרוקציה וה-temperature model.
8. **pg-boss הוא Node**: השירות ב-Python לא יכול להיות worker של pg-boss ישירות — המודל שנבחר: handler ב-Core קורא HTTP; ה-Windows worker מושך דרך API ייעודי.
9. **ODA**: קבצי ה-DWG בספריית הבלוקים נוצרו ב-ODA converter (שימוש לא-מסחרי) — לייצר מחדש ב-GstarCAD לפני שימוש מסחרי.
10. **NESPAH**: יחידות ה-DWG (ס"מ/מ"מ) וגופני ה-SHX לא נבדקו (אין ezdxf/DWG בסביבה זו); 13 קובצי SHX הוחרגו מה-eTransmit — יש להעתיקם מהמשרד.
11. **`index.json`** של הספרייה לא היה זמין — מבנהו משוער.
12. **הסקר** אינו שומר גובה מרזב, מספר פאות, סוג מונה כ-enum מלא או צילום גג מכוון — S03 יעבוד על פאה מלבנית אחת עד שהסוקר מצייר ב-UI.
13. **מספור המפרט**: `16-execution-plan.md` ו-`17-local-setup.md` מפנים ל-"מפרט 15 — `15-cad-service.md`"; הקובץ הזה נכתב לפי ההזמנה כ-`14-cad-design-service-spec.md` — לתקן את ההפניות (או לשנות שם).
14. **`engine.sql`** (`engine.designs`): `mode IN ('lite','full','as_made')` מול `design.quick/design.full` כאן — למפות `quick→lite`; `layout_geojson` (EPSG:4326 + local) מול `RoofGeometry` (מסגרת מקומית + `affine_local_to_crs`) — להחליט על מבנה אחד (המלצה: לשמור את `RoofGeometry` כפי שהוא ב-`layout_geojson`, והתצוגה ב-UI ממירה); `owner_accepted_*` הוא שדה יחיד ברמת design ולא רשימה לכל check כפי ש-eplan (`owner_accepted[]`) והמפרט (§6.3) דורשים; `calc_reports.status IN ('pass','blocked','failed')` חסר `provisional`; `rules.key` בסגנון `'EPLAN-voc-cold'` מול `'eplan.<LIMIT_SPECS key>'` כאן — לאחד לפי מפתחות ה-`LIMIT_SPECS` (18) כדי שהמתאם `seed_from_rows()` יהיה מיפוי ישיר.
15. **שירות ההצעות (M2)** מריץ `services/cad` "pvlib/PVGIS בלבד" לפני M4 (מפרט 16, WP-M2-05/06) — `/yield` ו-`/strings/allocate` כאן מתוכננים כנקודות קצה עצמאיות בדיוק לשם כך; `design.quick` המלא (פריסה גרפית) נשאר M4.

---

## נספח א' — מיפוי ל-`platform/schema/job.schema.json`

| שדה job.schema | ערך ל-jobs של השירות |
|---|---|
| `kind` | `edit` |
| `loop` | `edit.design_quick` · `edit.design_full` · `edit.render` · `edit.bom` · `edit.yield` · `edit.geometry_extract` · `edit.dwg_bind` |
| `trustTier` | `L1` (אין פעולה כלפי חוץ) |
| `costTier` | 0 (render/bom), 1 (yield, geometry), 2 (design.full, vision gates) |
| `source` | `engine` |
| `payload` | `DesignJobRequest` |
| `result` | `DesignJobResponse` |
| `outbound` | `{channel: none, destinationClass: self_chat, requiresHumanPick: true}` — הודעת STATUS/RESULT/NEXT לברק בלבד |
