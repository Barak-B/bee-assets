# מפרט 15 — ביצוע, בדיקה, חיבור מונה, מסירה, ניטור ותחזוקה (S08–S12)

| | |
|---|---|
| גרסה | 0.1 — טיוטת מפרט (2026-10-10) |
| אבני דרך | M5 (ביצוע ולו"זים), M6 (בדיקה/מונה/מסירה), M7 (O&M + AI) לפי `00-master-plan.md` §16 |
| שלבים | S08 התקנה · S09 בדיקת בודק · S10 חיבור מונה חח"י · S11 הפעלה ומסירה · S12 ניטור ותחזוקה (`01-lifecycle-stages.json`) |
| מקורות | `00-master-plan.md` §1, §3, §11, §12, §16; `research/06-monitoring-om.md` (כולו); `research/01-iec-process.md` §2, §4, §7, §11; `research/02-regulation-tariffs.md` §5, §6; handoff bee-live/bee-build (23.09.2026) |
| נספחים | `templates/inspection-62446-record.schema.json` (סכמת רשומת בדיקה), `templates/handover-checklist.json` (צ'קליסט הפעלה/מסירה/הזרעת ניטור) |
| סימון | **לאימות** = טענה שלא אומתה מול מקור ראשוני; **[קוד קהילתי]** = שם endpoint/שדה שמקורו בקוד קהילתי (לא תיעוד רשמי); **[תקציר חיפוש]** = מקורו בתקציר בלבד. אין במסמך זה שמות endpoint שאינם מופיעים בדוח 06 |

---

## 0. תקציר

המפרט מגדיר את החצי השני של מחזור החיים: מהרגע שהרכש הסתיים ועד שהאתר "דולק" בניטור ומטופל בחוזה תחזוקה. העיקרון המנחה: **רשומת ה-commissioning היא ה-baseline של הניטור**. כל מה שנמדד בשטח (Voc/Isc/Riso למחרוזת, סריאלים, מפת מחרוזות, מונה חח"י) נשמר מובנה ברשומת הפרויקט, ולא רק ב-PDF, כך ש-S12 יכול להשוות אליו.

שישה מודולים ב-Fastify (`server/src/modules/`): `fieldwork` (S08), `inspections` (S09), `grid` (S10), `handover` (S11), `monitoring` (קיים ב-bee-live, מורחב), `service` (S12). כולם נתלים על `Project` ועל `project_events` (append-only), וכל פעולה אוטומטית היא job בלדג'ר הכוורת לפי `platform/schema/job.schema.json`. outbound ללקוח/בודק/טכנאי — תמיד `requiresHumanPick: true`.

---

## (a) ביצוע ההתקנה — S08

### a.1 ישויות

```
WorkOrder   {id, projectId, kind: install|rework|service, scheduledStart, scheduledEnd, crewId,
             status: planned|dispatched|in_progress|paused|done|cancelled, foremanUserId,
             siteAccessNotes, craneBooked, scaffoldBooked, safetyBriefingAt, calendarEventId}
Crew        {id, name, members[{userId, role: foreman|electrician|installer|helper, licenseType?}],
             vehicle, defaultRegion}
DailyReport {id, workOrderId, date, reportDocId (DSL instance), weather, crewPresent[], hoursWorked,
             progress{modulesMounted, stringsWired, inverterMounted, acDone, ...}, blockers[],
             photos[], signatures[], status: draft|submitted|approved}
Checklist   {id, projectId, templateKey, items[{itemId, status: pending|ok|na|fail, value?, evidence[], by, at}],
             completedAt, approvedBy}
ChangeOrder {id, projectId, reason, originatedFrom: field|customer|iec|engineering, lines[{productId, qty, unitPrice, source}],
             deltaAmount, status: draft|owner_approved|sent_to_customer|customer_signed|rejected,
             quoteVersionId (הגרסה החדשה שנוצרת), signatureId, documentId}
AsMadeDelta {id, projectId, designRev, element: string|inverter|cable|breaker|route|module_count|orientation,
             ref, planned, actual, reason, photoIds[], reportedBy, at, appliedToDesignRev?}
```

- `WorkOrder` נוצר מהלו"ז (M5, CPM) ומסונכרן ליומן Google "התקנות" (`extendedProperties.private.bee_event_id`).
- `assign_crew` הוא auto_task של S08: המנוע מציע צוות לפי זמינות ואזור; אדם מאשר.
- כניסה ל-S08 דורשת `S07.done` וגם `S05.done OR S05.not_required` (מהלו"ז המקורי). המנוע מציג "חוסרים" אם PO קריטי לא הגיע.

### a.2 דוח יומי — פורט ה-DSL של bee-build

מצב קיים (handoff): ב-`E:\bee-build` (ענף `merge/neri-phase1`, `8f63a3c`) יש DSL תבניות עם **9 בלוקים**, עץ **13 עלים**, **7 תבניות** סכמטיות שנבנו מדוגמאות (ברקאי, אלקו, אורם, PV, בודק, ליקויים, קתודי), עורך גנרי למובייל, Shell עם autosave/אופליין/חתימה/מצלמה, PDF ממותג ב-Rubik, ראוטים עם בעלות/סטטוס/תמונות/חתימות; `@bee/shared-schemas` חבילה בנויה (ייבוא תת-נתיב `@bee/shared-schemas/report-templates`, לא ה-barrel). הדוחות **אינם** בקו החי; נרי מחזיק `ReportForm`/`Survey` ב-bee-live. הפורט (M3 ב-handoff) נבלע ב-M5.

**החלטות פורט:**
1. `packages/shared-schemas/report-templates` עובר כפי שהוא ל-monorepo של bee-live (חבילה בנויה ל-`dist`, בדיקות `.mts`; לא לייבא `src/index.ts` ישירות — ראו "Failed Attempts" ב-handoff).
2. טבלת `reports` ב-bee-live מקבלת `project_id`, `work_order_id?`, `inspection_id?`, `service_ticket_id?` (nullable; backfill לא נדרש — דוחות ישנים נשארים ללא קישור).
3. איחוד `ReportForm`/`Survey` של נרי עם ה-DSL: ה-DSL הוא המקור; `Survey` נשאר ישות נפרדת (S02) ולא דוח.
4. ה-PDF: אותו layout Chromium+Rubik; `closeBrowserPool()` ב-`onClose` של Fastify (לקח מה-handoff).

**מיפוי 7 התבניות לשלבים** (שמות התבניות הם שמות הדוגמאות שמהן נבנו — **המיפוי לאימות מול `packages/shared-schemas/src/report-templates/**` לפני הפורט**):

| תבנית DSL קיימת | מקור הדוגמה (משוער) | שלב/שימוש במנוע | פעולה |
|---|---|---|---|
| `PV` | דוח מערכת PV (סיור/תחזוקה) | S08 דוח יומי (בסיס), S12 ביקור מונע | להרחיב: בלוק `progress` (מונים: מודולים/מחרוזות/ממיר/AC), בלוק `crew` |
| `בודק` | דוח בודק חשמל | **S09** — דוח בדיקה 62446-1 (ראו (b)) | לקשור לסכמת `TestRecord`; טבלת מחרוזות מוזנת מהרשומה |
| `ליקויים` | רשימת ליקויים | S08 (punch list), S09 (ליקויי בודק), S12 (ממצאי ביקור) | כל שורה ↔ `Defect` (ראו b.5) |
| `ברקאי` / `אלקו` / `אורם` | דוחות תחזוקה/סיור לפי לקוח ספציפי — **לאימות** | S12 `PeriodicInspection` / `ServiceTicket` | לאחד לתבנית `maintenance_visit` גנרית עם וריאנטים ללקוח |
| `קתודי` | הגנה קתודית — לא PV | מחוץ להיקף PV; נשאר לשירותי חשמל כלליים | ללא שינוי |

**תבניות חדשות נדרשות** (לא קיימות ב-7): `daily_report` (אם `PV` לא מתאים), `installation_checklist` (per roof/inverter, ראו a.3), `commissioning` (ראו d.1), `handover_signoff` (ראו d.4). כולן ב-DSL הקיים (9 בלוקים) — אם חסר בלוק "טבלת מדידות עם ולידציה מספרית", להוסיף בלוק עשירי `measurement_table` עם min/max/unit per column.

### a.3 צ'קליסט התקנה לפי סוג גג / משפחת ממיר

`ChecklistTemplate {key, appliesTo{roofType[], inverterFamily[], hasBattery?, hasOptimizers?}, items[]}`.
`ChecklistItem {itemId, name_he, required, evidence: photo|document|value|signature|none, valueSpec?{unit,min,max}, ruleRef?}`.

הצ'קליסט של פרויקט = איחוד הפריטים מכל התבניות ש-`appliesTo` שלהן מתקיים (`roofType` מה-Survey, `inverterFamily` מה-Design/BOM). פריט עם `ruleRef` (למשל R11, R12, R14, R19, R20) מקבל את הטקסט והסף מטבלת `rules` ולא מהתבנית.

| קבוצה | פריטים (תמצית) | ראיה | חל על |
|---|---|---|---|
| **בטיחות** | תדריך בטיחות חתום; קו חיים/מעקה; סגירת אזור עבודה | signature, photo | הכל |
| **קונסטרוקציה — רעפים** | ווי גג לפי תוכנית קונסטרוקטור (מרווח, עיגון לקורה); אטימה; מסילות; פרופילי חיבור | photo (לפחות 3: וו גג, אטימה, מסילה) | `roofType=tile` |
| **קונסטרוקציה — איסכורית/פח** | קלאמפ/בורג self-drill לפי יצרן; אטמי EPDM; ללא ניקוב מיותר | photo | `roofType=metal_sheet` |
| **קונסטרוקציה — בטון שטוח** | balast/חדירה לפי קונסטרוקטור; משקלים; הגנת יריעה; מרווחי שורות לפי תכנון צל | photo + value (משקל balast/מודול) | `roofType=flat_concrete` |
| **קונסטרוקציה — קרקע** | יסודות/עמודים לפי תוכנית; גובה תחתון; גידור | photo | `roofType=ground` |
| **מודולים** | כמות ודגם לפי BOM; סריאלים סרוקים (ברקוד); הידוק קלאמפים במומנט יצרן; מרווחי התפשטות | value (count), document (CSV סריאלים), photo | הכל |
| **DC — כללי** | כבל סולארי לפי חתך; סימון +/− ומספרי מחרוזת; תעלות/מגן UV; רדיוסי כיפוף; מחברים מאותו יצרן בשני הצדדים | photo per string | הכל |
| **DC — אופטימייזרים (SolarEdge; Huawei עם אופטימייזרים)** | SN אופטימייזר ↔ מיקום במפה; pairing בוצע; מתח מחרוזת 1 V/אופטימייזר לפני pairing | document (מפת layout), value | `inverterFamily=solaredge`, `hasOptimizers` |
| **DC — ממיר מחרוזות (Huawei/Sungrow/KStar/Solis/Growatt)** | Voc מחרוזת בטווח MPPT; מספר מחרוזות ל-MPPT לפי תכנון; polarity לפני חיבור | value per string (Voc), photo של מסך הממיר | string inverters |
| **DC — מיקרו (Enphase)** | כבל trunk, מספר מיקרו לענף, Envoy מחובר | photo | `inverterFamily=enphase` |
| **ממיר** | מיקום/אוורור/מרחקים לפי יצרן; הארקה 10 mm² (R14); מפסק/מנתק לפי מרחק (R12); שילוט | photo, ruleRef | הכל |
| **AC / לוח** | מפסק ראשי PV + שלט (R11); RCD סוג B אלא אם הצהרת 62109 (R13); מדידה עקיפה אם In>3×100A (R9); ארון מונה ייצור אם >15 kW (R8); לוח בתו תקן (R23) | photo, document (הצהרת ממיר) | הכל |
| **הארקה / SPD** | 10/16/10 mm² (R14); פס השוואת פוטנציאלים; SPD DC/AC; רציפות (מדידה ראשונית) | value (Ω), photo | הכל |
| **אגירה** | מפסק משולט, PCS ≤3 מ', לחצן חירום, מעבר ≥0.6 מ' (R20); ת"י 62619 (R22) | photo, document | `hasBattery` |
| **כבאות / שילוט** | שילוט DC/AC, ניתוק חירום, מנתקי DC (R19) | photo | הכל (ציבורי/עסקי: required) |
| **תקשורת** | ממיר מחובר לרשת (ETH/WiFi/LTE); IP/SIM רשומים; "נראה באפליקציית היצרן" | value, screenshot | הכל |
| **ניקיון ומסירה פיזית** | פינוי פסולת; גג נקי; תמונות "לפני/אחרי" | photo | הכל |

הפריט האחרון בכל צ'קליסט: `ready_for_inspection` — חתימת מנהל העבודה. זהו תנאי היציאה `checklist.installation.complete` של S08.

### a.4 פקודת שינוי (Change Order)

1. ממצא בשטח (דוח יומי → "חריגה") או בקשת לקוח → `ChangeOrder.draft` עם שורות מהקטלוג (אותו pricing engine של M1, `PricingRule` בתוקף).
2. **אישור בעלים** (ברק) — חובה לכל סכום; מעל סף `ApprovalThreshold` גם הסבר כתוב.
3. שליחה ללקוח דרך שער האמון (WhatsApp Cloud API תבנית "פקודת שינוי") + חתימה click-to-accept (OTP, sha256) — אותו flow של החוזה (M2).
4. בחתימה: נוצרת `QuoteVersion` חדשה (immutable) עם מסמך דלתא; BOM מתעדכן; אם נדרש רכש → PO (S07 "חוזר" כאירוע, לא כשינוי שלב).
5. `ChangeOrder` ללא חתימה לא נכנס לחשבון הסופי (d.5).

### a.5 As-made deltas → רוויזיית תכנון

- כל שינוי מול הסט המאושר (מספר מודולים בפאה, חלוקת מחרוזות, חתך כבל, תוואי, מיקום ממיר, אזימוט/שיפוע בפועל) נרשם כ-`AsMadeDelta` מהדוח היומי או מהצ'קליסט (עם תמונה).
- בסגירת S08: job `build_as_made_rev` אוסף את הדלתות, מייצר `Design` rev חדש בסטטוס `as_made_draft` (spec YAML עם השינויים), מריץ eplan במצב verify בלבד (M4), ומציג לברק STATUS/RESULT/NEXT. אישור → `as_made` rev → S10 `generate_as_made` (סט DWG/PDF עם "As-Made" בבלוק הכותרת).
- דלתא שמשנה **מחרוזת** (מספר מודולים/MPPT) מעדכנת גם את `StringMap` (ראו e.4) — זה מה שהבודק יראה בטופס.

---

## (b) בדיקת בודק — S09

### b.1 ישות Inspector

```
Inspector {id, personId, name, licenseNo, licenseType: 1|2|3, licenseValidUntil, phone, email,
           insurancePolicy?, ratePerInspection?, region[], calendarId?, isInternal: boolean, active}
```

**כלל בחירה R17 — סוג בודק לפי גודל המתקן: הספים לא אומתו.** שני דוחות המחקר מציגים ערכים שונים מהזיכרון:

| סוג בודק | דוח 01 §7 (ידע כללי) | דוח 02 §5 (זיכרון) | מקור מחייב |
|---|---|---|---|
| 1 | מ"נ עד ~3×250 A | מ"נ עד 3×80 A | תקנות החשמל (רשיונות) 1985 — **לאימות** |
| 2 | מ"נ עד ~3×630 A | מ"נ ללא הגבלה | **לאימות** |
| 3 | ללא הגבלה כולל מ"ג | כל מתח כולל מ"ג | **לאימות** |

יישום: טבלת `rules` מקבלת שלוש שורות `R17.type1_max_a`, `R17.type2_max_a`, `R17.type3_mv` במצב `unverified`. ה-auto_task `select_inspector_type_by_rule` מחשב `requiredLicenseType = min type שמכסה project.mainBreakerA (ו-MV אם חל)` ומציג **"לאימות"** בכרטיס עד ש-reviewer מאשר את הכלל. בחירת בודק עם `licenseType < requiredLicenseType` חסומה (`HUMAN_INPUT_REQUIRED` + override בעלים מתועד). אותה ולידציה (R16) חלה על חתימת הצהרת המתקין (b.7).

### b.2 הזמנה (booking)

- auto_task `book_inspector`: תנאי מקדים — `checklist.installation.complete`, `Design` rev מאושר (לפחות approved; as-made אם קיים), `StringMap` מלא.
- המנוע מציע 2–3 חלונות מיומן הבודק (אם `calendarId`) ומיומן "בדיקות" של BEE; הפנייה לבודק = outbound (`dispatch.draft`, `requiresHumanPick: true`).
- `Inspection {id, projectId, inspectorId, kind: initial|retest|periodic, scheduledAt, performedAt, status: planned|in_progress|report_draft|signed|failed|cancelled, parentInspectionId?, testRecordId, reportDocId, defectCount{open, closed}}`.
- יום לפני: תזכורת פנימית + רשימת ציוד מדידה (מגר, מצמד זרם DC, פירנומטר/מד קרינה, מד טמפ' IR) — Task לצוות.

### b.3 רשומת בדיקה IEC 62446-1 — קטגוריה 1 (חובה)

סכמה פורמלית: `templates/inspection-62446-record.schema.json`. תמצית:

```
TestRecord {
  id, inspectionId, projectId, standard: "IEC 62446-1:2016+A1:2018", category: 1|2,
  system {dcKwp, acKw, phases: 1|3, connectionA, inverters[{sn, model, mppts}], moduleModel, moduleCount},
  environment {irradianceWm2, irradianceMethod: pyranometer|reference_cell|app|none, ambientC, moduleTempC,
               moduleTempMethod: ir|contact|model, weather, measuredAt},
  instruments [{kind: megger|clamp|multimeter|irradiance|ir_camera|iv_tracer, model, sn, calibrationDue}],
  visual {items[{code, name_he, result: ok|fail|na, note, photoIds[]}]},      // DC, AC, שילוט, הגנות, ניתוקים, חיווט, הארקה, מבנה
  earthing {continuityTests[{from, to, ohm, limitOhm, result}], bondingOk},
  strings [{
    inverterSn, mpptIndex, stringIndex, label, modulesInSeries, expectedVoc, expectedIsc,  // מה-StringMap
    polarityOk, vocV, iscA (או operatingCurrentA + mode), measuredAt,
    riso {testVoltageV: 250|500|1000, method: "array_to_earth"|"pos_to_earth"|"neg_to_earth", megohm, limitMegohm, result},
    deviationVocPct, deviationIscPct, result: pass|fail|warn, note
  }],
  combinerBoxes [{ref, fusesOk, spdOk, labelsOk, isoMeasuredMegohm?, result}],
  inverters [{sn, functionalStartOk, antiIslandingTripOk, gridSettingsProfile, firmware, result}],
  acBoards [{ref, rcd{type: A|B|F, ratedMa, tripTimeMs, tripCurrentMa, result}, mainBreakerOk, labelsOk, result}],
  functional {switchgearOk, emergencyStopOk, monitoringCommOk, exportLimitVerified?},
  category2? {...},   // ראו b.4
  summary {overall: pass|pass_with_defects|fail, inspectorSignatureId, installerSignatureId?, signedAt}
}
```

כללי ולידציה (קוד, לא AI):
- `deviationVocPct = (vocV − expectedVoc(T_module)) / expectedVoc(T_module)`; `expectedVoc(T)` מחושב מ-`Product.tech` (Voc_STC, β_Voc) לפי `moduleTempC` — אותו חישוב של eplan. סף אזהרה/כשל: **פרמטר** (`rules: R62446.voc_tol_pct`, ברירת מחדל 5% אזהרה — **לאימות מול הטקסט**).
- `iscA` מושווה בין מחרוזות באותו ממיר/אוריינטציה ולערך צפוי מנורמל ל-`irradianceWm2`; סף — פרמטר (**לאימות**).
- `riso.limitMegohm` — **הערכים המדויקים של התקן לא אומתו** (דוח 06 §9). עד אימות: פרמטר `R62446.riso_min_megohm` לפי מתח המערכת, בסטטוס `unverified`; הדוח מציג "סף לפי פרמטר X (לאימות)".
- `riso.testVoltageV` חייב להיות ≥ מתח המערכת המרבי (Voc_cold) — 500 V למערכות < 500 V, 1000 V מעל (**לאימות**).
- RCD: `type` חייב להתאים ל-R13 (B אלא אם הצהרת 62109 מצורפת כ-Document).
- מחרוזת ב-`StringMap` ללא שורה ב-`strings[]` → הרשומה לא ניתנת לחתימה.

### b.4 קטגוריה 2 (אופציונלי — לפי גודל/לקוח/חוזה)

```
category2 {
  ivCurves [{inverterSn, mpptIndex, stringIndex, irradianceWm2, moduleTempC, vocV, iscA, vmpV, impA, pmaxW,
             pmaxStcW (מנורמל), fillFactor, curveFileId (CSV), deviationFromExpectedPct, result}],
  irThermography {loadPct, ambientC, windMs, images[{photoId, target: module|connector|combiner|inverter|board,
                   ref, maxTempC, deltaTC, finding: none|hotspot|bypass_diode|connector|other, severity}], result},
  wetRiso? [{stringRef, megohm, result}],
  blockingDiodes? [{ref, result}]
}
```
תנאי IR מקובל: עומס > ~60% הספק — **לאימות מול התקן**. ברירת מחדל: קטגוריה 2 חובה ב-`regulatory_track ∈ {commercial_100_630, mv_gt630}` ובחוזה Premium (h.1); אחרת אופציה בהצעה.

### b.5 ליקויים → משימות → בדיקה חוזרת

```
Defect {id, inspectionId, projectId, code, category: dc|ac|earthing|structure|labeling|documentation|comm|other,
        severity: critical|major|minor, blocksConnection: boolean, location, description, photoIds[],
        status: open|assigned|fixed|retest_pending|closed|waived, taskId, assigneeId, fixedAt, fixEvidencePhotoIds[],
        retestInspectionId?, waivedBy?, waiveReason?}
```
- auto_task `defects_to_tasks`: כל `Defect` → `Task` לצוות (WorkOrder `rework` אם יש יותר מ-N ליקויים או `critical`).
- `critical` או `blocksConnection` → S09 נשאר `blocked` (reason = defect ids). חזרה S09→S08 מתועדת כ-rollback event (מהכללים ב-`01-lifecycle-stages.json`).
- `fixed` דורש תמונת ראיה; `retest_pending` עד `Inspection(kind=retest)` שחוזר על הבדיקות הרלוונטיות בלבד (תת-קבוצה של `strings[]`/`acBoards[]`), ואז `closed`.
- `waived` רק ע"י owner עם סיבה — מופיע בדוח.
- תנאי יציאה S09: `inspection.report.signed` וגם `inspection.defects.open == 0` (waived נספר כסגור).

### b.6 דוח בדיקה — מיפוי לתבנית "בודק" ב-DSL

הדוח ה-PDF מופק מה-DSL (תבנית `בודק` קיימת), אבל **הנתונים מוזנים מ-`TestRecord`**, לא מוקלדים: הבודק ממלא בטופס מובייל שמחולל מהסכמה (bee-build מציע "עורך גנרי"), והתבנית רק מעצבת.

| שדה בדוח | מקור | בלוק DSL (משוער — **לאימות מול התבנית הקיימת**) |
|---|---|---|
| פרטי מתקן, כתובת, לקוח, מתכנן, מתקין, תאריכים, kWp/kVA, סוג חיבור | Project/Site/Design/`TestRecord.system` | header |
| פרטי בודק, רישיון, סוג | `Inspector` | header |
| תנאי סביבה ומכשור | `environment`, `instruments` | key-value |
| בחינה חזותית | `visual.items` | checklist |
| רציפות הארקה | `earthing` | table |
| טבלת מחרוזות: ממיר/MPPT/מחרוזת, N מודולים, polarity, Voc מדוד/צפוי/סטייה, Isc, Riso @ V | `strings[]` | table (measurement_table) |
| ממירים / לוחות / RCD / תפקוד | `inverters`, `acBoards`, `functional` | table + checklist |
| קטגוריה 2 (אם בוצע) | `category2` | table + photos |
| ליקויים | `Defect[]` | table (= תבנית `ליקויים`) |
| הצהרה וחתימות (בודק; מתקין נוכח) | `summary` | signature |

הדוח נשמר כ-`Document{kind: inspector_report_pdf, signed_by: {role: inspector, license}}`; הרשומה המובנית כ-`Document{kind: iec62446_tests, file: JSON}` (שני ה-kinds כבר מוגדרים ב-S09 בקובץ השלבים).

**לא אומת** אם מינהל החשמל/חח"י דורשים טופס לפי 62446-1 או "טופס בדיקת מתקן שקבע המנהל" (דוח 01 §7, V7). לכן ה-`Document.kind` `iec_inspection_form` (טופס המנהל, PDF form ממולא, חתום בודק פרטי — המזהה כפי שמוגדר ב-`templates/submission-templates.json` של מפרט 13) נשמר **בנפרד** מדוח 62446-1 — ייתכן ששניהם נדרשים. אותו טופס אחרי חתימת בודק חח"י = `iec_inspection_pass`; ליקויי חח"י = `iec_defect_list` (→ `Defect{origin: iec}`).

**יחס לטבלת `engine.test_results` (schema/engine.sql):** הסכמה ב-`templates/inspection-62446-record.schema.json` היא פורמט המסמך/החילוף (JSON אחד לכל בדיקה, מקונן לפי מחרוזת); `test_results` היא ההטלה השורתית לשאילתות ול-KPI. כלל שיטוח: כל `strings[i]` → שורות `kind ∈ {polarity, voc, isc, riso}` עם `scope = "string:{inverterSn}/M{mppt}/S{string}"`, `value_num`, `expected_num`, `pass`, `threshold_rule_id`, `temp_c`, `irradiance_wm2`; `earthing.continuityTests[]` → `kind=continuity`; `acBoards[].rcd` → `kind=rcd`; `category2.ivCurves[]` → `kind=iv_curve` עם `curve` jsonb; `irThermography.images[]` → `kind=ir` עם `photo_ids`. המקור הקנוני הוא ה-JSON; השורות נגזרות (job `flatten_test_record`).

### b.7 הצהרות מתקין / מתכנן

- `Document{kind: installer_declaration}` — חתום ע"י חשמלאי ברישיון; ולידציה R16: `licenseGrade` מול המפסק הראשי (מוסמך 3×80A / ראשי 3×250A / הנדסאי 3×630A / מהנדס — [תקציר], **לאימות**).
- `Document{kind: designer_declaration}` — חתום ע"י המתכנן (ברק).
- (המזהים `installer_declaration`/`designer_declaration` זהים לאלה שב-`templates/submission-templates.json`.)
- שתי ההצהרות נוצרות מתבנית DOCX→PDF (docxtemplater) עם נתוני הפרויקט, נחתמות ב-flow החתימה הפנימי (לא OTP ללקוח — חתימת עובד/בודק עם session) ונכנסות לחבילת S10. **הנוסח המחייב של ההצהרות לא אומת** (V6) — התבניות מתחילות מהנוסח שבמשרד.

---

## (c) חיבור מונה חח"י — S10

### c.1 מסירה ממפרט ההגשות

מפרט 13 (`13-submissions-regulation-spec.md` + `templates/submission-templates.json`, M3) מגדיר `Submission` עם `SubmissionStep[]`; הצעדים `insp.*` (`kind: iec_inspection`) שלו פועלים ב-S10 ומתחילים בשער `insp.01.gate_private_inspection` (= תנאי היציאה של S09 כאן: דוח חתום, 0 ליקויים, `flags.inspector_type` מ-R17). S10 צורך את הצעד **"הזמנת בדיקת מתקן PV"** (`digitalorders.iec.co.il` / אתר המעגל `/order_the_test` [מקור, דוח 01 §2 שלב 10]). מודול `grid` לא מממש הגשה — הוא **מכין את החבילה** (= `insp.02.build_pack` במפרט 13) ורושם את התוצאות:

`order_iec_inspection_pack` (auto_task) מרכיב `Document{kind: iec_final_pack}` ב-pypdf merge מתוך:

| רכיב | מקור | אומת כדרישה? |
|---|---|---|
| חד-קו חתום (as-made אם קיים, כולל הארקה) | Design rev / CAD svc | [מקור: תקציר] |
| טופס בדיקת מתקן (חתימת בודק פרטי; בודק חח"י חותם בסוף) | `iec_inspection_form` | [מקור] |
| דוח בודק 62446-1 | `inspector_report_pdf` | לאימות אם נדרש (V7) |
| הצהרת מתקין, הצהרת מתכנן | b.7 | [ידע כללי] — V6 |
| דפי נתונים ממיר + מודולים | Catalog `Product.datasheet` | [מקור: תקציר] |
| אישור גודל חיבור (תשובת מחלק) | Submission S05 | [מקור] |
| אישור קונסטרוקטור / פטור מהיתר / ביטוח | Documents S06–S07 | [ידע כללי] — V6 |

החבילה היא קובץ אחד עם bookmarks; אדם מעלה ב-digitalorders ורושם `externalRef` (מס' הזמנה) ואת הצעת החשבון. פורמטי קבצים ב-digitalorders **לא אומתו** (V5) — החבילה PDF בלבד.

### c.2 רשומת GridConnection

```
GridConnection {
  id, projectId, submissionId,
  inspectionOrder {orderNo, orderedAt, feeQuoteNo, feeAmount, feePaidAt, receiptDocId,
                   scheduledAt, performedAt, result: passed|defects|failed, iecInspectorName?, defects[] (→ Defect, origin=iec)},
  slaDueAt (7 י"ע מהתשלום — [תקציר], לאימות V1), connectionDueAt (30 י"ע — לאימות),
  meter {meterSerial, meterCode, contractNumber, bpNumber, meterKind: bidirectional|production|both,
         isElectronic, connectionSize{size, phase, representative: "3X25"}, installedAt, swappedFromSerial?},
  productionMeter? {serial, installedAt}   // >15 kW (R8), לפעמים מונה נפרד
  approvedKw, approvedExportKw?, track (= project.regulatory_track), distributor: iec|historic(name),
  operationApproval {approvedAt, documentId, approvedBy},   // "אישור הפעלה / הרמת מפסק"
  tariffRegistration {portalRequestNo, submittedAt, approvedAt, producerContractNo?, tariffAgorot?, documentId},
  operatingPermit? {required: boolean|null (לאימות V10), appliedAt, permitNo, issuedAt, documentId},
  activatedAt   // תאריך תחילת ה-baseline של הניטור
}
```

שמות השדות `meterSerial`, `meterCode`, `contractNumber`, `bpNumber`, `deviceNumber`, `deviceCode`, `isElectronic`, `connectionSize{size, phase, representativeConnectionSize}` תואמים את מבנה ה-API הלא-רשמי של חח"י **[קוד קהילתי: py-iec-api]** כדי שחיבור הנתונים ב-(d.6) יהיה ישיר. `contractNumber`/`bpNumber` נאספים כבר ב-S01 מחשבון החשמל (`request_electric_bill`); S10 רק מאמת.

### c.3 קליטת נתוני מונה

- מקור 1: טופס בדיקת חח"י החתום / מדבקת המונה — תמונה → Claude vision → הצעת ערכים → **אישור אדם** (סוכן "Receipt/status updater", master plan §14).
- מקור 2: אפליקציית/אזור אישי של הלקוח (אם ניתנה הסכמה, d.6) — `GET Device/{contract_id}` [קוד קהילתי] מחזיר `deviceNumber`, `deviceCode` → השוואה מול מה שנרשם ידנית; אי-התאמה = Task.
- ולידציה: `connectionSize` מול `approvedKw` (R7 `P/0.9 ≤ S_connection`).

### c.4 אישור הפעלה, רישום לאסדרה, היתר הפעלה

- `operationApproval` נרשם ממסמך חח"י (העלאה) — תנאי `grid.operation_approved`.
- `register_tariff_track_portal`: Task ידני עם צ'קליסט שדות מ"פורטל יצרנים" (מדריך 10-10-2023 [מקור]) — שדות הפורטל **לא מופו** (קלט 6 מברק ב-§19). המנוע מכין את הנתונים (kW, מונה, חוזה, מסלול, פרטי בנק?) ורושם `portalRequestNo`.
- `operatingPermit`: רק אם כלל `R.operating_permit_threshold_kw` (unverified, V10) מתקיים; טופס "בקשה למתן היתר להפעלת מתקן חשמלי פוטו-וולטאי" [מקור: hashmalnet] — PDF ממולא, הגשה ידנית, **לאימות** לאילו גדלים.
- תנאי יציאה S10 (מהקובץ): `grid.meter.installed`, `grid.operation_approved`, `grid.tariff_track_registered`. היתר הפעלה **אינו** חוסם מעבר ל-S11 אלא אם הכלל מסומן `required` — אחרת Task פתוח שעובר ל-S11.
- SLA: `slaDueAt` בימי עבודה מ-`business_calendar`; חריגה → שורת "תיקי חח"י תקועים" בדיווח הבוקר (M3).

---

## (d) הפעלה ומסירה — S11

### d.1 צ'קליסט commissioning

פריטים מלאים: `templates/handover-checklist.json` (stage=`commissioning`). קבוצות: (1) הפעלה ראשונה של הממיר עם פרופיל רשת ישראלי (הפרמטרים הטכניים של חח"י — V8, **לאימות**; עד אז "פרופיל יצרן לישראל" כפי שנמסר); (2) אימות ייצור בפועל מול ייצור צפוי לקרינה הרגעית; (3) ייצוא לרשת/zero-export לפי `approvedExportKw` (R10); (4) אגירה: טעינה/פריקה, EMS; (5) ניטור: האתר נראה בפורטל היצרן ומסונכרן ל-bee-live (e.5); (6) הדרכת לקוח (כיבוי חירום, אפליקציה, מה לעשות בהתראה).

הצ'קליסט ממולא בתבנית DSL `commissioning` (a.2) ונחתם ע"י מבצע ההפעלה; תוצאותיו המספריות (הספק רגעי, קרינה, ייצוא) נשמרות ב-`CommissioningRecord {projectId, performedAt, by, items[], snapshot{acPowerKw, irradianceWm2, expectedKw, gridExportKw, inverterStatus[]}}`.

### d.2 תיק מתקן (Handover Pack)

`merge_handover_pack` → `Document{kind: handover_pack_pdf}` ב-pypdf (bookmarks, attachments DXF). הרכב לפי מבנה IEC 62446-1 ופרקטיקה ישראלית (דוח 06 §5.1–5.2; **הרשימה המדויקת של סעיף התיעוד בתקן לא אומתה**):

| # | פרק | מקור |
|---|---|---|
| 1 | נתוני מערכת: בעלים/כתובת, מתכנן, מתקין, תאריכי התקנה/בדיקה/חיבור, kWp DC, kVA AC, סוג חיבור (1Φ/3Φ, A) | Project, GridConnection |
| 2 | חד-קו as-made (מערך, מחרוזות, combiner, מנתקי DC/AC, הגנות, מונים, הארקה/SPD) + תוכנית אתר | Design as_made rev |
| 3 | נתוני מחרוזות: דגם מודול, N למחרוזת, מחרוזות ל-MPPT, Voc/Isc/Vmp/Imp, אוריינטציה/שיפוע | StringMap |
| 4 | דפי נתונים: מודולים, ממירים, אופטימייזרים, מבנה, כבלים, הגנות, סוללה | Catalog |
| 5 | תכנון מכני: דוח קונסטרוקטור, עומסים | Documents S06 |
| 6 | O&M: הפעלה/כיבוי, חירום, תחזוקה מומלצת, **אחריויות**, אנשי קשר | תבנית + WarrantyRegistry |
| 7 | תוצאות בדיקה: דוח 62446-1, טופס בדיקה, רשימת ליקויים (סגורה), דוח commissioning | S09, d.1 |
| 8 | אישורי חח"י: תשובת מחלק, אישור הפעלה, נתוני מונה, רישום אסדרה | S05, S10 |
| 9 | רשימת ציוד + סריאלים (ממירים, אופטימייזרים, מונים, לוגר) | EquipmentInventory (e.2) |
| 10 | ניטור: מה הלקוח רואה (אפליקציית יצרן), פרטי גישה, מה BEE רואה, הסכמות | MonitoringLink |
| 11 | תמונות אתר + IR baseline (אם בוצע) | Photos |

הלקוח מקבל גם ערכה פיזית: תעודת בודק, אישור חח"י, כרטיסי אחריות (`warranty_cards`).

### d.3 רישום אחריויות

```
Warranty {id, projectId, siteId, scope: module_product|module_performance|inverter|optimizer|battery|structure|workmanship|other,
          productId?, serials[], provider: manufacturer|'B.E.E'|distributor, startsAt (= activatedAt אלא אם היצרן קובע אחרת),
          years, endsAt, termsDocId, registeredRef (מס' רישום אצל היצרן), reminderTaskId, claimContact, status: active|claimed|expired}
// ערכי scope זהים ל-CHECK ב-engine.warranties; לוגר/ראוטר נכנסים תחת other (הצעה: להוסיף 'logger' ל-enum)
```
- `register_warranties` יוצר שורות מה-BOM ומ-`Product.warranty` (מודולים 25/30 ביצועים + 12–25 מוצר, ממיר 12 SolarEdge / 10 Huawei, עבודה 1–5 — ברירות מחדל מהמסטר-פלאן, **לאימות לכל מק"ט**).
- Jobs תזכורת (pg-boss cron יומי): `warranty_due_60d`, `warranty_due_30d` → Task + שורת דיווח בוקר; `inverter` בפרט → הצעת "הארכת אחריות/החלפה" כליד S01.
- חיבור ל-Solis: `inverter/shelfTime` [קוד קהילתי] מחזיר אחריות — אפשר לאמת מול הרישום (רק Solis).

### d.4 חתימת לקוח

- `handover_signoff` (DSL): פריטי הצ'קליסט שהוצגו ללקוח, הדרכה בוצעה, מסמכים נמסרו, הערות; חתימה click-to-accept (OTP ל-WhatsApp/SMS, sha256 של ה-PDF, IP/UA) — אותו מנגנון של החוזה. החתימה נרשמת כ-`Signature` ומסמנת `handover.signed_by_customer`.
- הסתייגויות לקוח בחתימה → `Defect(origin=customer)` עם SLA תיקון; לא חוסמות מעבר ל-S12 אלא אם `blocksHandover`.

### d.5 חשבון סופי

- טריגר: `handover.signed_by_customer` וגם `grid.operation_approved` → job `issue_final_invoice`: סכום = יתרת `QuoteVersion` האחרונה (כולל `ChangeOrder` חתומות) פחות תשלומים שהתקבלו; הנפקה ב-Morning (OAuth2 `api.morning.co`; מסמך "חשבונית מס/עסקה" לפי מדיניות ברק) + קישור תשלום Grow/Cardcom. `requiresHumanPick: true` — ברק מאשר לפני הנפקה.
- תשלומים צמודי אישורי חח"י (מהצעת המחיר) נגזרים כבר ב-M2; S11 מנפיק את הפעימה האחרונה.
- תנאי יציאה S11: `invoice.final.issued` (לא "שולם"; גבייה = Task).

### d.6 הסכמת נתוני חח"י + tokens

**עובדות (כולן [קוד קהילתי: GuyKh/py-iec-api], API לא רשמי, עלול להשתנות):** base `https://iecapi.iec.co.il/api/`; headers `x-iec-idt: 1`, `x-iec-webview: 1`; אימות `Authentication/{id}/1/-1` עם **ת"ז + OTP (SMS/מייל דרך Okta)** → JWT (`id_token`) + refresh token; אין client-credentials לעסק. Endpoints: `GET customer`, `GET customer/contract/{bp_number}`, `GET Device/{contract_id}`, `GET Device/LastMeterReading/{contract}/{bp}`, `POST Consumption/RemoteReadingRange/{contract_id}` (resolution 1|2|3 = יומי/שבועי/חודשי; מחזיר `periodConsumptions[{interval, consumption, backStream, status}]`, `totalImport`, `totalExport`, `totalBackStreamForPeriod`, `taozList`), `POST Consumption/SendConsumptionReportToMail/{contract_id}` (Excel רבע-שעה לשנה — [תקציר], **לאימות**), חשבוניות `ElectricBillsDrawers/ElectricBills/{contract}/{bp}`, שיתוף חוזה `masa-mainportalapi.iec.co.il/api/connectionbetweencontactandcontract/createconnectionrequest` (**השערה** שמאפשר לנציג BEE לראות את החוזה — **לאימות בפורטל**). נתונים מתעדכנים באיחור 1–2 ימים.

**Flow מוצע (שתי חלופות, הלקוח בוחר):**

| | חלופה A — token בזהות הלקוח | חלופה B — שיתוף חוזה לאיש קשר BEE |
|---|---|---|
| מה הלקוח עושה | חותם הסכמה (מסמך `iec_data_consent`), מקבל OTP מחח"י לטלפון שלו ומקליד אותו בפורטל הלקוח של BEE (magic link) בזמן המסירה | מוסיף את נציג BEE כאיש קשר לחוזה בפורטל חח"י (לאימות שאפשרי) |
| מה BEE שומר | `IecCredential {projectId, bpNumber, contractNumber, refreshTokenEnc (vault/pgcrypto), idTokenExp, consentDocId, consentAt, revokedAt?, lastSyncAt, status}` — **אף פעם לא ת"ז ולא OTP** (מזעור, §15) | רק `contractNumber`/`bpNumber`; הגישה דרך ה-token של נציג BEE (זהות אחת לכל הלקוחות) |
| סיכונים | refresh פג/נדחה → Task "חידוש הסכמה" ללקוח; API לא רשמי נשבר → feature flag `IEC_DATA_SYNC`; שינוי ToS | תלוי בפיצ'ר שלא אומת; חשבון יחיד = single point of failure |
| שימוש | `reconcile_iec_monthly`: `backStream` חודשי מול ייצוא מחושב מהממיר (ייצור − צריכה עצמית כשיש מונה) → התראת `METER_MISMATCH` אם פער > 5% (g.2) | זהה |

ההסכמה היא מסמך חתום (OTP) עם מטרת השימוש, תקופה, זכות ביטול; הביטול מוחק את ה-token (job `revoke_iec_credential`). עד שה-API יאומת מול מסמכי המדיניות של חח"י — המודול **כבוי ב-prod** (`IEC_DATA_SYNC=off`) ונבדק ב-staging עם חוזה של ברק עצמו.

---

## (e) הזרעת MonitoringLink

### e.1 רשומת MonitoringLink (הגשר ל-bee-live)

```
MonitoringLink {
  id, projectId, siteId (Site של המנוע), liveSiteId (FK לטבלת האתרים הקיימת ב-bee-live — "to be mapped locally"),
  vendor: solaredge_v1|solaredge_v2|huawei_fusionsolar|sungrow_isolarcloud|solis|growatt|solarman|deye|goodwe_sems|saj|enphase|tigo|fronius|sma|modbus_logger,
  vendorSiteId,             // SolarEdge siteId · Huawei plantCode/stationCode · Sungrow ps_id (+ps_key) · Solis stationId · GoodWe powerStationId · Growatt plant_id · Enphase system_id · Tigo system_id  [קוד קהילתי]
  region,                   // Sungrow gateway eu|hk|com|au|in · Huawei prefix (intl/eu5) · Growatt host · GoodWe region · Deye eu1
  authMode: fleet_key|site_key|oauth|account_login|api_key_hmac|local_modbus,
  credentialRef,            // מזהה ב-vault, לא ערך (ראו f.4)
  sharingStatus: not_started|requested|customer_action_pending|shared|verified|revoked,
  sharingRequestedAt, sharedAt, sharedBy (מי אצל הלקוח מחזיק את חשבון הבעלים), ownerAccountHint (מייל של חשבון הלקוח אצל היצרן — לא סיסמה),
  expectedLatencyMin,       // SolarEdge 15 · Sungrow 5 · Huawei 5 (kiosk 30) · Deye 3–5 · Solis ~5 (לאימות) · IEC 1–2 ימים
  pollingProfile: default|dense|sparse,
  firstSyncAt?, firstSyncDeadline, verificationStatus: pending|ok|failed,
  baselineAt (= GridConnection.activatedAt), active, notes
}
```
אתר עם כמה יצרנים (ממיר + לוגר + אגירה) = כמה `MonitoringLink` לאותו `Site`.

### e.2 מלאי ציוד ותקשורת

`EquipmentInventory {projectId, items[{kind: inverter|optimizer|micro|meter|battery|logger|router|module, productId, sn, firmware?, commType: ETHERNET|RS485|WIFI|LTE|ZIGBEE, ip?, modbusAddr?, iccid?, position? (layout ref), warrantyId?}]}` — נאסף בצ'קליסט ההתקנה (סריקת ברקוד) ומאומת מול `getDevices` של היצרן אחרי ה-first sync (סריאל שלא מופיע = Task).

### e.3 נוהלי שיתוף לפי יצרן (מה הלקוח/הטכנאי עושה במסירה)

| יצרן | מה צריך לקרות כדי ש-BEE תראה את האתר | רמת אימות | אם לא קורה |
|---|---|---|---|
| **SolarEdge V1** | האתר נוצר תחת ה-account של BEE (מפתח Account) **או** בעל האתר יוצר מפתח Site ב-Admin → Site Access → API Access ומוסר אותו | רשמי (profile של ה-PDF) | `sharingStatus=customer_action_pending` + Task |
| **SolarEdge V2 Fleet Access** | האתר "owned or associated" ל-account של BEE (נוצר ע"י BEE במוניטורינג) | [קוד קהילתי] + עובד בפועל אצלנו | Site Access OAuth ("SolarEdge Connect", scopes `SITE_DATA DEVICE_DATA`, עד 24 חודשים) — הלקוח מאשר בפורטל הלקוח; `GET /sites` לא עובד עם OAuth token |
| **Huawei FusionSolar** | חשבון Northbound נוצר ע"י **BEE** (System → Company Management → Northbound Management → Create), מסמנים את המפעל + "Basic APIs" + Device Data לכל סוג ציוד; המפעל חייב להיות תחת חברת BEE (אחרת Plant Migration — המתקין המוסר צריך שם חברה+קוד) | [קוד קהילתי] + תיעוד Solytic | Task לטכנאי: לסמן את המפעל בחשבון ה-Northbound |
| **Sungrow iSolarCloud** | **בעל המפעל** (חשבון לקוח) → Plant → Share → "Add Sharing" → מייל חשבון BEE → Administrators; או OAuth שבו הלקוח בוחר מפעלים (`authorizedPlantIds`). "not in account list" = השיתוף לא הושלם (**השערה**, V14) | [תקציר חיפוש] + [קוד קהילתי] | זו **משימה ללקוח**, לא שגיאת API: ה-adapter ממפה את השגיאה ל-`sharingStatus=customer_action_pending` ופותח Task + הודעת WhatsApp (תבנית מאושרת) עם הוראות |
| **Solis** | המפעל "תחת החשבון" של ארגון BEE; מפתח API ברמת החשבון (service ticket → `apiManage`) | [קוד קהילתי] | Task לטכנאי |
| **Growatt** | token מ-Growatt (פנייה אליהם); המפעל תחת חשבון המתקין | [קוד קהילתי] | Task |
| **Solarman / Deye** | חשבון Business ב-pro.solarmanpv.com עם `orgId`; APP ID/Secret במייל מ-Solarman; Deye Cloud: developer.deyecloud.com | [תקציר חיפוש] | Task |
| **GoodWe SEMS / SAJ** | חשבון מתקין רואה תחנות תחתיו — אבל API לא רשמי, **סיכון גבוה** | [קוד קהילתי]/[תקציר] | ברירת מחדל: `modbus_logger` (מקומי) במקום ענן; הענן רק כ-best-effort |
| **KStar** | **אין API ענן** → לוגר Modbus (SunSpec 103+160) או לוגר Solarman 8899 (קושחה ישנה; TLS בחדשות חוסם) | דוח 06 §2.9 | חובה לוגר + LTE/VPN כשורת BOM (החלטה פתוחה 11 במסטר-פלאן) |
| **Enphase / Tigo / Fronius / SMA** | Partner/EI/Solar.web/ennexOS לפי הטבלה בדוח 06 §1 | מעורב | לא בעדיפות לישראל; Task ידני |

### e.4 מפת מחרוזות ו-baseline

```
StringMap {projectId, designRev, arrays[{arrayId, tiltDeg, azimuthDeg, moduleProductId, shadingNotes}],
           inverters[{sn, model, mppts[{index, strings[{label, modules, arrayId, optimizerSns?[]}]}]}]}
KpiBaseline {projectId, at, source: commissioning|inspection, perString[{inverterSn, mppt, string, vocV, iscA, risoMegohm, irradianceWm2, moduleTempC}],
             commissioningSnapshot (d.1), irImages?, expectedMonthlyKwh[12], prDesign, specificYieldDesign}
```
- `StringMap` נבנה מה-Design (eplan) ומתעדכן מ-`AsMadeDelta`; `KpiBaseline.perString` מועתק מ-`TestRecord.strings[]` (S09) ומ-`CommissioningRecord`.
- הבאות מהיצרן (`getDevices`) מאמתות שהסריאלים ב-`StringMap.inverters` קיימים.

### e.5 אימות סנכרון ראשון

Job `verify_first_sync` (pg-boss, נוצר בסגירת S11 לפני חתימה): מריץ `adapter.getOverview(vendorSiteId)` כל שעה עד `firstSyncDeadline = activatedAt + X` (פרמטר; ברירת מחדל **48 שעות**, **לאימות** מול הניסיון עם SolarEdge/Sungrow); הצלחה = נתוני אנרגיה > 0 ליום הראשון + `lastUpdateTime` בטווח `2×expectedLatency`. כישלון → `verificationStatus=failed` + Task "אתר לא מסנכרן" (סיבה: `commFailureReason` מהאדפטר — לדוגמה "not in account list" → `sharing`; 403 → `scope`; אין devices → `comm`). תנאי היציאה `monitoring.link.active` של S11 = `verificationStatus=ok`.

### e.6 תפוקה צפויה משירות ה-CAD

Job `compute_expected_yield` קורא ל-`services/cad` (Python): `pvlib.iotools.get_pvgis_hourly(lat, lon, surface_tilt, surface_azimuth, pvcalculation=True, peakpower, loss)` לכל `array` (עמודות `P`, `G(i)`, `T2m`), + `get_pvgis_horizon`; ממיר ל-`expectedMonthlyKwh[12]` ול-`expectedHourlyProfile` (cache ב-R2, מפתח = lat/lon/tilt/az/kWp/loss). PR תכנוני ו-`specificYieldDesign` מההצעה (S03) נשמרים לידו להשוואה. מגבלת קצב PVGIS **לא אומתה** → worker אחד, תור, cache.

---

## (f) ממשק אדפטר ניטור

### f.1 Interface משותף (TypeScript, `server/src/integrations/adapter.ts`)

```ts
export type Vendor = 'solaredge_v1' | 'solaredge_v2' | 'huawei_fusionsolar' | 'sungrow_isolarcloud' | 'solis'
  | 'growatt' | 'solarman' | 'deye' | 'goodwe_sems' | 'saj' | 'enphase' | 'tigo' | 'fronius' | 'sma' | 'modbus_logger';

export type Resolution = 'QUARTER_HOUR' | 'HOUR' | 'DAY' | 'MONTH' | 'YEAR';

export interface SiteRef { vendor: Vendor; vendorSiteId: string; region?: string; credentialRef: string; }

export interface SiteSummary { vendorSiteId: string; name: string; peakPowerKw?: number; installationDate?: string;
  timezone?: string; lat?: number; lon?: number; status?: 'active' | 'pending' | 'disabled' | 'unknown'; raw?: unknown; }

export interface Overview { at: string; lastUpdateTime?: string; currentPowerW?: number;
  energyTodayWh?: number; energyMonthWh?: number; energyLifetimeWh?: number;
  toGridWh?: number; fromGridWh?: number; selfConsumptionWh?: number; raw?: unknown; }

export interface EnergyPoint { ts: string; valueWh: number; }
export interface EnergySeries { resolution: Resolution; unit: 'WH'; points: EnergyPoint[]; }

export interface VendorAlert { vendorAlertId: string; openedAt: string; closedAt?: string; deviceSn?: string;
  vendorCode: string; vendorCategory?: string; vendorSeverity?: string; title?: string;
  normalized: { family: AlertFamily; severity: Severity }; raw?: unknown; }

export interface Device { sn: string; type: 'INVERTER' | 'OPTIMIZER' | 'MICRO' | 'METER' | 'BATTERY' | 'LOGGER' | 'SENSOR' | 'OTHER';
  manufacturer?: string; model?: string; firmware?: string; connectedTo?: string; active?: boolean; commType?: string; raw?: unknown; }

export interface TelemetryPoint { ts: string; acPowerW?: number; dcPowerW?: number; acVoltageV?: number[]; acCurrentA?: number[];
  dcVoltageV?: number; dcCurrentA?: number; tempC?: number; status?: string;
  mppt?: Array<{ index: number; voltageV?: number; currentA?: number; powerW?: number; }>;   // SunSpec 160 / Huawei pv1_u,pv1_i / Sungrow points
  isoKohm?: number; rippleControlState?: string; feedInLimitPct?: number; raw?: unknown; }

export interface Telemetry { deviceSn: string; resolution: Resolution; points: TelemetryPoint[]; }

export type AdapterErrorKind = 'rate_limit_minute' | 'rate_limit_monthly' | 'rate_limit_daily' | 'brownout' | 'auth' | 'scope'
  | 'not_shared' | 'not_found' | 'network' | 'parse' | 'unknown';
export class AdapterError extends Error { kind!: AdapterErrorKind; retryAfterSec?: number; vendorCode?: string; httpStatus?: number; }

export interface MonitoringAdapter {
  readonly vendor: Vendor;
  readonly capabilities: { listSites: boolean; alerts: boolean; devices: boolean; telemetry: boolean; mppt: boolean;
    minResolution: Resolution; bulk: boolean; control: boolean; };
  readonly cost: (op: keyof MonitoringAdapter, n?: number) => number;  // יחידות תקציב (קריאה/קרדיט) — ראו f.2
  listSites(cred: string, page?: number): Promise<SiteSummary[]>;             // SolarEdge V2: רק Fleet Access
  getOverview(site: SiteRef): Promise<Overview>;
  getEnergy(site: SiteRef, from: string, to: string, resolution: Resolution): Promise<EnergySeries>;
  getAlerts(site: SiteRef, onlyOpen?: boolean): Promise<VendorAlert[]>;
  getDevices(site: SiteRef): Promise<Device[]>;
  getTelemetry(site: SiteRef, deviceSn: string, from: string, to: string, resolution: Resolution): Promise<Telemetry>;
  classifyError(e: unknown): AdapterError;                                    // מרחיב את classifySeResponse הקיים
  mapSharingError?(e: AdapterError): 'customer_action_pending' | null;        // Sungrow "not in account list"
}
```

מיפוי ליישומים קיימים: `solaredge.ts` (V1; `classifySeResponse`, `seV1BrownoutActive`) ו-`solaredge-v2.ts` (ledger, `planV2Cadence`, parsers עם שדות `GUESSED`) עוטפים את הממשק בלי לשנות התנהגות; `getEnergy` ב-V2 = `GET /sites/{id}/energy?resolution=&unit=WH` [קוד קהילתי]; `getAlerts` = `/sites/{id}/alerts?only-open=true` [קוד קהילתי]; Sungrow API-key: `getPowerStationList`/`getDeviceList`/`getDeviceRealTimeData`/`getDevicePointMinuteDataList` [קוד קהילתי]; Huawei: `/thirdData/stations`, `getStationRealKpi`, `getKpiStationDay/Month`, `getDevList`, `getDevRealKpi`, `getAlarmList` [קוד קהילתי]. **שדות V2 בסטטוס `GUESSED` נשארים כך עד ה-probe** (`scripts/solaredge-v2-probe.mjs --key-from-db`, דדליין 01–03.11.2026 מה-handoff).

### f.2 מתזמן מכסות (quota scheduler)

טבלת `vendor_quota` (נתונים, לא קוד) + מודול `quota.ts` שכל קריאת אדפטר עוברת דרכו:

| vendor | יחידת תקציב | חלון | מגבלה (ידועה) | אימות | אסטרטגיה |
|---|---|---|---|---|---|
| solaredge_v1 | קריאה | יום (IL) לכל token; יום לכל siteId/IP; 3 במקביל | 300 / 300 / 3; bulk נספר פעם אחת לכל אתר בתוכו | profile של ה-PDF הרשמי | bulk `/sites/list` + overview מרובה-אתרים; לא לספור קריאות שנכשלו ב-503 (באג שתוקן); 429 = מגבלה → breaker (f.3) |
| solaredge_v2 | credit (1/קריאה [קוד קהילתי]) | חודש (tier) + קריאות/דקה | מספרי ה-tiers **לא אומתו** (V13); ~1,860 קרדיטים/חודש/אתר בפרופיל HA | [קוד קהילתי] | ledger קיים; `planV2Cadence` מתכנן לפי יתרה; 429 עם `x-ratelimit-remaining-minute`≠0 ⇒ **חודשי** (עצור עד 1 בחודש / שדרוג tier), אחרת ⇒ דקתי (`Retry-After`) |
| huawei_fusionsolar | קריאה | דקה **לכל interface** | ~1/דקה/endpoint (failCode 407); session יחיד לחשבון | [קוד קהילתי] + תיעוד רשמי חסום | קריאות מרובות-תחנות (`stationCodes:"a,b,c"`); 63 ש' בין קריאות לאותו endpoint; 2 חשבונות (prod/dev) |
| sungrow_isolarcloud | קריאה | לא פורסם; נתונים כל 5 דק' | — | **לאימות** | polling 5–15 דק' לאתר; `ps_id_list` מרובה |
| solis | קריאה | 5 שניות לכל IP | 3 | [קוד קהילתי] | תור גלובלי יחיד עם `minIntervalMs=1700` |
| solarman | קריאה | 10 ש' / דקה (שליטה) | 300 / 50 | [תקציר חיפוש] | token חודשיים |
| growatt | קריאה | — | error 10012 "frequently access"; ~2 ש' בין קריאות | [תקציר חיפוש] | מרווח 2 ש' |
| goodwe_sems | קריאה | — | 429 / `GY0429` → cooldown 60 ש' ×2 עד 300 | [קוד קהילתי] | backoff אקספוננציאלי |
| enphase | hit | דקה + חודש לפי plan | לפי טבלה בדוח 06 §1 | api-evangelist | לא רלוונטי כרגע |
| modbus_logger | — | מקומי | — | — | polling 1 דק' דרך VPN; לא עובר במתזמן ענן |

עקרונות:
1. **תקציב לפני קריאה**: `quota.reserve(vendor, cred, cost)` — אם אין, הקריאה נדחית לתור (לא נכשלת). שימוש ב-pg-boss עם `singletonKey` לכל (vendor, credentialRef).
2. **עדיפויות**: `first_sync` (e.5) > `alerts` > `overview` של אתרים בחוזה Premium > overview רגיל > `devices`/`energy` היסטורי. מימוש: טבלת `poll_plan` שמחושבת פעם ביום לכל אתר (cadence לפי tier/latency/יתרת תקציב) — הרחבה של `planV2Cadence` לכל הספקים.
3. **ספירה אמיתית**: נספרות רק קריאות שהגיעו לשרת היצרן (2xx/4xx), לא 503/network (הלקח מה-handoff). יום IL (`Asia/Jerusalem`) לאיפוס היומי של V1 (כבר קיים ב-`countCall()`).
4. **תצפית**: `/status/quota` (Tailscale-only כמו `/status/*`) + שורת "תקציב ניטור" בדיווח הבוקר (יתרת קרדיטים V2, % מכסת V1, breaker-ים פתוחים).

### f.3 Circuit breakers

הרחבת ה-breaker הקיים (503/brownout ב-`solaredge.ts`, gating ב-`background-sync.ts`):

| טריגר | מצב | משך | התנהגות |
|---|---|---|---|
| 503 / network (קיים) | `brownout` | כפי שמיושם (`seV1BrownoutActive`) | ללא שינוי |
| 429 דקתי (`Retry-After` / בלי `x-ratelimit-remaining-minute`) | `rate_limit_minute` | `Retry-After` או 60 ש' | עצירת הספק (לא האתר), תור ממשיך אחרי |
| 429 יומי (V1) | `rate_limit_daily` | עד חצות IL | polling V1 מושעה; fallback: V2 אם מופעל / scraper (דגל קיים) |
| 429 חודשי (V2, `x-ratelimit-remaining-minute`≠0) | `rate_limit_monthly` | עד תחילת החודש | polling V2 מושעה; fallback V1 (bulk); התראת ops "קרדיטים נגמרו" + דיווח בוקר |
| Huawei failCode 407 | `rate_limit_minute` | 60 ש' לאותו interface | per-endpoint breaker |
| Huawei failCode 305 / Sungrow token פג / Solis 408 (שעון) | `auth` | מיידי | login מחדש פעם אחת; כישלון שני → breaker 15 דק' + התראת ops |
| Sungrow "not in account list" / 403 scope ב-V2 | **לא breaker** | — | שגיאה **ברמת אתר**: `sharingStatus`/Task (e.3), האתר מוסר מתור ה-polling עד שינוי סטטוס |

מצב ה-breaker נשמר ב-DB (לא בזיכרון התהליך) כדי לשרוד restart ו-deploy; canary (`canary.sh`) מקבל שורה `breakers=…` ליד `failing=stale-sites`.

### f.4 אחסון credentials

- טבלת `integration_credentials {id, vendor, label, kind: api_key|oauth_refresh|account_login|hmac_pair|modbus, encPayload (pgcrypto, מפתח ב-env כמו `apiKeyV2`), scope: account|site, siteId?, createdBy, rotatedAt, expiresAt?, status}`. `MonitoringLink.credentialRef` מצביע לכאן; אין ערכים בטבלאות אחרות או בלוגים.
- הזנה רק דרך סקריפט stdin בשרת (כמו `set-solaredge-v2-key.ts`) או מסך admin עם `requiresUserInteraction`; staging מקבל credentials מנוקים (`refresh-staging-db.sh` כבר עושה זאת).
- OAuth (SolarEdge Site Access, Sungrow OAuth): refresh אוטומטי ב-job; Sungrow מבקש אישור מחדש בכל פקיעה (אין silent re-auth [קוד קהילתי]) → Task ללקוח.
- `n8n_reader` ללא גישה לטבלה (RLS).

### f.5 טבלת הערות לפי יצרן (רמות אימות מדוח 06)

| יצרן | סטטוס API | אימות | הערה קריטית לתכנון |
|---|---|---|---|
| SolarEdge V1 | רשמי legacy | profile של PDF רשמי | 300/יום חוסם 184 אתרים בלי bulk; SolarEdge דוחפת ל-V2 |
| SolarEdge V2 | רשמי self-serve | [קוד קהילתי] (ha_int_solaredge, monitoring-v2-api-demo); אצלנו עובד | tiers/מחירים לא אומתו; רזולוציה 15 דק'; `X-Account-Key` ישן? — לאימות |
| Huawei Northbound | רשמי | [קוד קהילתי] (HomeAssistant-FusionSolar) | `getStationList` הוצא משימוש → `/thirdData/stations`; מגבלות לכל interface — תיעוד חסום |
| Sungrow OpenAPI | רשמי, אישור אפליקציה ידני | [קוד קהילתי] (pysolarcloud, sungrow-api-client) | gateway לישראל לא אומת; "not in account list" = השערה; תגובות בסינית |
| Solis | רשמי (PDF) | [קוד קהילתי] (soliscloud_api) | 3/5 ש'/IP — חובה תור גלובלי |
| Growatt V1 | רשמי | [קוד קהילתי] | אזור ישראל לא אומת |
| Solarman / Deye | רשמי לפי בקשה | [תקציר חיפוש] (PDF 2019) | paths לא אומתו בקוד |
| GoodWe SEMS+ | **לא רשמי** | [קוד קהילתי] ("partial, evidence-based") | סיכון גבוה → Modbus/UDP מקומי |
| SAJ | חצי-רשמי (NDA) | [תקציר] | לא לבנות עליו |
| KStar | **אין ענן** | דוח 06 §2.9 | Modbus RTU V3.5 / לוגר |
| Enphase v4 / Tigo v3 / Fronius / SMA | רשמיים | מעורב | לא בעדיפות |
| SunSpec Modbus | תקן | models repo רשמי | מודל 160 = string/MPPT; SolarEdge TCP 1502 — **לא אומת** |
| חח"י (py-iec-api) | **לא רשמי** | [קוד קהילתי] | זהות הלקוח בלבד; 1–2 ימי איחור |

---

## (g) KPI והתראות

### g.1 הגדרות (IEC 61724-1:2021 — נוסחאות ידועות; הטקסט הרשמי לא היה נגיש)

| KPI | נוסחה | קלטים | חלון |
|---|---|---|---|
| Specific yield | `Y_f = E_AC / P_STC` [kWh/kWp] | `getEnergy`, `StringMap` (kWp) | יום/חודש/שנה |
| Reference yield | `Y_r = H_POA / G_STC` (G_STC = 1 kW/m²) | H_POA מ-PVGIS/SARAH3 (lag ימים) או מ-ERA5; אין פירנומטר באתרים | יום/חודש |
| PR | `PR = Y_f / Y_r` | שניהם | חודש (יומי רועש) |
| PR מתוקן טמפ' | מכנה × `[1 + γ·(T_cell − 25)]`; `T_cell = pvlib.temperature.faiman(poa, temp_air, wind, u0=25, u1=6.84)` (כויל בנגב) | γ מ-`Product.tech`, T2m/רוח מ-PVGIS/ERA5 | חודש |
| EPI | `EPI = E_actual / E_expected` | `expectedHourlyProfile` (e.6) מסוכם לחלון, או `expectedMonthlyKwh` | יום (מול ERA5/SARAH3 בלאג) / חודש (PVGIS ממוצע) |
| Availability (זמן) | `A_t = (שעות אור − downtime) / שעות אור` | `lastUpdateTime`, power series, sun elevation | חודש |
| Availability (אנרגיה) | `A_e = 1 − E_lost / E_expected` | EPI + downtime | חודש |
| Capacity factor | `CF = E / (P_AC × 8760)` | `getEnergy`, P_AC | שנה |
| Peer ratio | `Y_f(site) / median(Y_f(peers ≤ 20 km, same tilt class))` | 184 אתרים — אקלים אחיד יחסית | יום (הסיגנל הזול והחזק) |
| תפעוליים | MTTA, MTTR, % false-positive, downtime לאתר/יצרן, soiling (ירידת Y_f מאז ניקוי אחרון), degradation (Y_f שנתי מנורמל) | alerts/tickets | חודש/שנה |

טבלת `site_kpi_daily {siteId, date, eAcWh, hPoa?, yf, yr?, pr?, prTempCorr?, epi?, peerRatio?, availT, dataQuality}` + `site_kpi_monthly`. `dataQuality` מ-pvanalytics-style checks (gaps, stuck values, clipping, time shift) — מימוש TS מינימלי או קריאה ל-`services/cad`.

### g.2 טקסונומיית התראות

| family | severity | מקור/כלל | dedupe key | escalation |
|---|---|---|---|---|
| `COMM_LOSS` ("אתר חשוך") | critical אם > 24 ש' בשעות אור, major אחרת | אין נתונים > `2×expectedLatency` בשעות אור; V2 `activationStatus`/`lastUpdateTime`; Huawei `failCode`≠0 | site+family | 0 ש' ops; 24 ש' → ticket; 72 ש' → לקוח (תבנית) |
| `ZERO_PRODUCTION` | critical | `P < 2% P_STC` כש-sun elevation > 15° למשך > 60 דק', מנורמל לעננות דרך peers | site+family+day | כמו COMM_LOSS |
| `INVERTER_FAULT` | לפי מיפוי קוד יצרן (critical/major/minor) | V2 `/alerts` (`category`, `impact`, `component.serialNumber`), Huawei `getAlarmList`, Solis `alarmList`, Solarman `alertList` [כולם קוד קהילתי/תקציר] | site+deviceSn+vendorCode | critical → ticket מיידי |
| `UNDERPERFORMANCE` | major | EPI יומי < 0.8 ל-3 ימים או חודשי < 0.9; peer ratio < 0.85 ל-3 ימים | site+family+month | ticket אחרי אישור אנושי |
| `STRING_IMBALANCE` | minor→major | מחרוזת/MPPT נמוך > 15% מהממוצע באותו ממיר בהספק > 30%; מקור: SunSpec 160, Huawei `pv1_u/pv1_i`, Sungrow MPPT points, SolarEdge optimizers | site+sn+mppt | 7 ימים רצופים → ticket |
| `ISOLATION_LOW` | critical | Sungrow "Insulation impedance to ground", קודי Riso של Huawei/SolarEdge; סף לפי יצרן | site+sn | ticket מיידי (בטיחות) |
| `CURTAILMENT` | info | Sungrow "Ripple control state", feed-in limitation points, SolarEdge power-control | site+day | לא נספר כ-underperformance; רק דוח |
| `METER_MISMATCH` | major | `backStream` חח"י חודשי מול ייצוא מחושב: פער > 5% | site+month | Task לבדיקת מונה/חיווט/חיוב |
| `WARRANTY_DUE` / `INSPECTION_DUE` | info→minor | 60/30 יום לפני פקיעת אחריות; `PeriodicInspection` לפי h.2 | site+warrantyId | שורת בוקר → ליד/Task |
| `SHARING_PENDING` | major | `sharingStatus=customer_action_pending` > 7 ימים | site | לקוח (תבנית) |
| `QUOTA_EXHAUSTED` (ops) | major | breaker חודשי/יומי פתוח | vendor | ops בלבד |

**Dedupe**: `alerts.dedupe_key` ייחודי בין `opened_at` ל-`closed_at`; חזרה של אותו key מעדכנת `last_seen_at` ו-`occurrences`, לא פותחת רשומה. **Acknowledge** חובה (היום: 33 critical פתוחות, 0 acknowledged — המצב שהמנוע בא לפתור): התראה ללא ack אחרי `ackSlaHours` (לפי severity) עולה לרמת ההסלמה הבאה. **Suppression**: חלונות "שקט" (`quiet_windows`: ניקוי/עבודות/חג) ו-`CURTAILMENT` פעיל משתיקים `UNDERPERFORMANCE`/`ZERO_PRODUCTION`.

ההתראות הקיימות ב-bee-live (NO_COMMUNICATION, stale-sites, lost-stations) ממופות ל-`COMM_LOSS` (i.2) ללא שינוי לוגיקה — רק הוספת `family`, `severity`, `dedupe_key`.

### g.3 יצירת tickets

`alerts_to_tickets` (auto_task של S12): התראה `critical`, או `major` שלא נסגרה תוך `autoTicketHours` (פרמטר לפי tier: Premium 4 ש', Standard 24 ש', Basic — רק לאחר אישור אנושי) → `ServiceTicket` (h.3) עם ה-alert כ-`origin`. אותו site+family עם ticket פתוח → ההתראה מצורפת ל-ticket הקיים.

### g.4 שורות דיווח הבוקר (הרחבת `morning-report.sh`/`.ps1`, 07:00, self-chat)

1. אתרים חשוכים (COMM_LOSS פתוחות) — מספר, ותיקים > 3 ימים בשם.
2. התראות critical ללא ack + מי אחראי.
3. Tickets פתוחים לפי סטטוס; tickets ללא טכנאי (M4b — תשובה להודעה משבצת).
4. אתרים ב-`SHARING_PENDING` / `verify_first_sync` שנכשלו.
5. תקציב ניטור: V1 % יומי, V2 קרדיטים נותרים/תחזית לסוף חודש, breaker-ים פתוחים.
6. EPI/peer: 5 האתרים הנמוכים אתמול (אם `dataQuality` תקין).
7. אחריות/בדיקה תקופתית ב-30 הימים הקרובים.
8. חוזי תחזוקה לחידוש ב-60 יום; חשבוניות תחזוקה שלא שולמו.
(שורות 1–3 כבר קיימות חלקית; 4–8 חדשות. הפלט נשאר טקסט WhatsApp ל-self-chat דרך הגשר, עד המעבר ל-Cloud API.)

---

## (h) תחזוקה ושירות — S12

### h.1 MaintenanceContract

```
MaintenanceContract {id, customerId, siteIds[], tier: basic|standard|premium|regulatory_only, startAt, endAt, autoRenew, renewalNoticeDays: 60,
                     priceAnnual, currency, indexation?, billingCycle: annual|semi|quarterly, morningCustomerId, status: draft|active|expired|cancelled,
                     sla {responseHoursCritical, responseHoursMajor, availabilityGuaranteePct?, prFloor?, compensationRule?},
                     includes {cleaningsPerYear, preventiveVisitsPerYear, irThermography: boolean, ivSampling: boolean, inspectorFiveYear: boolean, monthlyReport: boolean},
                     quietWindows[], contacts[{role, name, phone, channel}], documentId (חוזה חתום)}
```

תוכן ה-tiers (פרקטיקה ענפית, דוח 06 §6.3 — **לתמחר לפי עלויות BEE; אין נתוני מחיר ישראליים לחוזי O&M מלאים**):

| | Basic (ניטור) | Standard (תחזוקה שנתית) | Premium (מסחרי) |
|---|---|---|---|
| ניטור מרחוק + התראות | ✓ | ✓ | ✓ |
| דוח חודשי ללקוח (EPI, Y_f, זמינות) | ✓ | ✓ | ✓ |
| ביקור מונע שנתי (62446-1 קט' 1 חלקי: חזותי, הידוק, Riso, Voc, הגנות/SPD, מסננים/מאווררים) | — | ✓ ×1 | ✓ ×1 |
| ניקוי | בתשלום | ×1–2 | ×3–4 |
| IR תרמי שנתי + I-V לדגימת מחרוזות | — | — | ✓ |
| זמן תגובה | best effort | 2–3 ימי עבודה | 24 ש' לקריטי (אתר חשוך) |
| ערבות availability / PR-floor עם פיצוי | — | — | אופציה (למשל 97%) |
| ביקור תקלה | בתשלום | כלול X/שנה | כלול |
| ניהול בדיקת בודק 5-שנתית | תוספת | תוספת | ✓ |
| benchmark מחיר | ≈ €0.2/kWp/שנה ניטור בלבד (Solytic) | ניקוי 6–8 ₪/kW מסחרי, מינימום 400–600 ₪ לקריאה [תקצירים] | — |

### h.2 PeriodicInspection

```
PeriodicInspection {id, siteId, contractId?, kind: preventive|cleaning|ir_thermography|iv_sampling|inspector_5y|insurer|custom,
                    intervalMonths, nextDueAt, lastDoneAt, windowDays, assignedCrewId?, workOrderId?, reportDocId?, status}
```
מרווחים כ-**פרמטרים** בטבלת `rules`/`service_params` (לא קבועים בקוד):

| kind | ברירת מחדל | מקור | אימות |
|---|---|---|---|
| `inspector_5y` | 60 חודשים מדוח הבודק האחרון | מדריך shoresh.org.il ("לפחות אחת לחמש שנים… ביטול ההיתר") | **לאימות** — V20; מקור רגולטורי לא נמצא |
| `preventive` | 12 חודשים | פרקטיקה | לאימות מול חוזה |
| `cleaning` | לפי tier/אזור אבק: 3–12 חודשים | תקצירי מחירי ניקוי | לאימות |
| `ir_thermography` | 12 חודשים (Premium) | פרקטיקה; דרישות מבטחים **לא אומתו** | לאימות |
| `insurer` | לפי פוליסה | — | לאימות |

Job יומי `periodic_inspection_schedule`: `nextDueAt − windowDays` → WorkOrder מוצע + שיבוץ בלו"ז החוצה-פרויקטים (M5); הביקור מתועד בתבנית `maintenance_visit` (a.2) והממצאים → `Defect(origin=periodic)` → tickets.

### h.3 ServiceTicket — מחזור חיים

```
ServiceTicket {id, siteId, customerId, contractId?, origin: alert|customer|periodic|internal|iec, alertIds[], severity,
               status: new|triaged|assigned|scheduled|en_route|on_site|waiting_parts|waiting_customer|resolved|closed|cancelled,
               technicianId?, workOrderId?, scheduledAt, responseDueAt (SLA מהחוזה), resolvedAt, reportDocId?,
               resolution {cause, action, partsUsed[], warrantyClaimId?, billable: boolean, invoiceId?}, timeline[]}
```

1. **פתיחה**: מ-alert (g.3), מפניית לקוח (WhatsApp נכנס דרך Hermes/Alfred → `collect.wa` → טיוטה לאישור), מביקור תקופתי, או ידנית.
2. **Triage** (אדם/סוכן read-only): סיווג, `severity`, האם remote-fix (למשל reset ממיר דרך `paramSetting`/מודל 123 — **רק עם אישור**), האם בחוזה/בתשלום.
3. **שיבוץ טכנאי דרך תשובת WhatsApp (M4b)**: דיווח הבוקר/התראה כוללת שורה `#T-123 שם-אתר — תקלה`; תשובה `T-123 → דני` (או מספר מתוך רשימה) ב-self-chat מתפרשת ע"י ה-poller (`prod-alert.ps1`/Hermes נכנס) ל-`assign(ticketId, technician)` → `assigned` + WorkOrder + אירוע ביומן הטכנאי. הפירוש = `collect.wa` job עם ולידציה (ticket קיים, טכנאי ברשימה); אי-ודאות → שאלה חוזרת, לא ניחוש. הודעה לטכנאי = outbound (`requiresHumanPick` — כאן ה-pick הוא התשובה עצמה).
4. **שטח**: תבנית DSL `maintenance_visit`/`ליקויים` בטלפון (אופליין), תמונות, חתימת לקוח; `resolution` מובנה.
5. **סגירה**: ההתראה המקורית חייבת להיסגר (אחרת ticket חוזר ל-`resolved` ולא `closed`); אם `billable` → h.5; אם `warrantyClaimId` → h.4; KPI: MTTA/MTTR נרשמים מה-timeline.

### h.4 חלקים ותביעות אחריות

`WarrantyClaim {id, warrantyId, ticketId, productId, sn, failureDescription, evidencePhotoIds[], submittedAt, providerRef, status: draft|submitted|approved|rejected|replaced|credited, replacementSn?, creditAmount?}` — תהליך מול היצרן/יבואן ידני (מייל מ-Gmail עם תבנית), המערכת עוקבת; החלפת ממיר מעדכנת `EquipmentInventory`, `MonitoringLink` (סריאל חדש אצל היצרן) ו-`StringMap`.

### h.5 חיוב דרך מודול החשבוניות

- חוזה: job `contract_billing` לפי `billingCycle` → Morning (חשבונית עסקה → תשלום → חשבונית מס-קבלה עם מספר הקצאה, הכול אצל הספק) — `requiresHumanPick`.
- ticket `billable`: שורות מהקטלוג (עבודה לפי שעה/קריאה, חלקים, מנוף) → הצעת חיוב לאישור ברק → חשבונית.
- חידוש: `renewalNoticeDays` לפני `endAt` → הודעת חידוש (תבנית) + הצעה חדשה (QuoteVersion מתבנית חוזה); `autoRenew` רק אם כתוב בחוזה.

---

## (i) הערות מיגרציה — חיבור bee-live הקיים בלי לשבור prod

### i.1 עקרונות
1. **אין שינוי בטבלאות הקיימות שה-sync/alerts כותבים אליהן** — רק עמודות nullable חדשות וטבלאות גשר. השמות המדויקים של טבלאות הלקוחות/אתרים/התראות ב-bee-live **לא ידועים במסמך זה** ("to be mapped locally" — למפות מ-`server/src/` ומה-migrations לפני כתיבת ה-migration).
2. **Feature flags** (env, כמו `BEE_BACKGROUND_WORKERS`): `ENGINE_PROJECTS` (מודולי המנוע), `ENGINE_ALERT_TAXONOMY` (family/severity/dedupe), `ENGINE_QUOTA` (המתזמן החדש במקום הלוגיקה הישירה), `ENGINE_TICKETS`, `IEC_DATA_SYNC`. ברירת מחדל ב-prod: הכול off; staging (`bee-lab`, DB = גיבוי prod) on.
3. כל מיגרציה: הפוכה (down), נבדקת על `refresh-staging-db.sh`, ואז deploy עם ה-gate והרולבק הקיימים (`deploy.sh`/`rollback.sh`).

### i.2 מיפוי ישויות

| קיים ב-bee-live (שם לאימות מקומית) | ישות במנוע | איך מחברים |
|---|---|---|
| טבלת לקוחות (184) | `Customer` | עמודה `engine_customer_id` nullable על הטבלה הקיימת **או** טבלת גשר `customer_link {live_customer_id, customer_id}`; מומלץ גשר (אפס שינוי בסכמה הקיימת) |
| טבלת אתרים/תחנות (siteId של SolarEdge, Sungrow ps_id, apiKey) | `Site` + `MonitoringLink` | `MonitoringLink.liveSiteId` → האתר הקיים; `vendor`/`vendorSiteId`/`credentialRef` מועתקים; הסנכרון ממשיך לעבוד מול הטבלה הישנה |
| `apiKeyV2` מוצפן (ברמת חשבון) | `integration_credentials{kind: api_key, scope: account}` | שורה אחת, `credentialRef` לכל link של solaredge_v2 |
| מפתחות V1 לאתר (אם יש) | `integration_credentials{scope: site}` | שורה לכל מפתח |
| alerts (NO_COMMUNICATION, lost-stations, critical/acknowledged) | `alerts` + עמודות `family`, `severity`, `dedupe_key`, `acked_by`, `acked_at`, `ticket_id` | migration מוסיפה עמודות nullable; backfill: `NO_COMMUNICATION`→`COMM_LOSS/critical`; dedupe_key = `site:family` לרשומות פתוחות |
| canary `stale-sites` | `COMM_LOSS` + `/status/quota` | ללא שינוי בקנרי; שורה נוספת |
| morning-report | g.4 | הסקריפט קורא endpoint פנימי חדש (`/status/morning`, Tailscale-only) במקום SQL ישיר — כששורות 4–8 מוכנות |
| reports (bee-build, אחרי פורט) | `DailyReport`/`Inspection`/`ServiceTicket` | FK nullable (a.2) |

### i.3 תוכנית backfill ל-184 אתרים

1. **שלב 0 (staging)**: סקריפט `backfill-engine.ts --dry-run` מדפיס לכל אתר קיים: Customer מוצע (לפי שם/טלפון), Site (כתובת/קואורדינטות אם יש), `MonitoringLink{vendor, vendorSiteId}` וסטטוס `sharingStatus` מוסק (אתר שמסנכרן = `verified`; "not in account list" = `customer_action_pending`; 6 האתרים החשוכים מה-handoff = `verified` עם `COMM_LOSS` פתוח).
2. **שלב 1**: יצירת `Customer`/`Site`/`Project{stage: S12, status: open, regulatory_track: unknown}` לכל אתר — **פרויקט "היסטורי"** בלי S01–S11 (דגל `legacy: true`); אין מסמכים, אין GridConnection (שדות ריקים → Task "להשלים נתוני מונה" רק אם ייכנס לחוזה תחזוקה).
3. **שלב 2**: `KpiBaseline` חלקי: kWp מ-`peakPower` של היצרן (V2 `/sites/{id}` [קוד קהילתי]), `expectedMonthlyKwh` מ-PVGIS לפי קואורדינטות + שיפוע/אזימוט **ברירת מחדל** (לא ידועים ברוב האתרים → `dataQuality: assumed_orientation`; peer ratio הוא ה-KPI הראשי עד שיימדד).
4. **שלב 3**: ייבוא Monday (M0) מקשר פרויקטים פעילים ללקוחות שכבר נוצרו (מפתח: טלפון/שם) — ידני לאימות כפילויות.
5. **שלב 4**: הפעלת `ENGINE_ALERT_TAXONOMY` ב-prod אחרי שבוע ב-staging; השוואת מספר ההתראות היומי ישן מול חדש (חייב להיות זהה ± dedupe).
6. **שלב 5**: `ENGINE_QUOTA` — קודם במצב "shadow" (רושם מה היה מחליט, לא חוסם), ואז enforce; מדד הצלחה: 0 קריאות 429 בשבוע ו-0 ירידה בכיסוי האתרים.
7. אתרים ללא קואורדינטות/כתובת → Task לכל אתר (184 → צפוי עשרות), בעדיפות ללקוחות עם חוזה.

### i.4 התאמה ל-`schema/engine.sql` ולמפרט 13 (נכתבו במקביל — לאחד לפני קידוד)

| במפרט זה | ב-`engine.sql` / מפרט 13 | פעולה |
|---|---|---|
| `MonitoringLink.liveSiteId` | `monitoring_links.bee_live_site_id` + `bee_live_integration_id` | לאמץ את שמות ה-SQL |
| `sharingStatus: not_started\|requested\|customer_action_pending\|shared\|verified\|revoked` | `engine.sharing_status` (ברירת מחדל `not_requested`; כולל `requested`, `denied`) | **אי-התאמה** — להחליט על enum אחד; מומלץ להוסיף `customer_action_pending` (Sungrow "not in account list") ו-`verified` (אחרי first sync) ל-SQL |
| `MonitoringLink.verificationStatus` + `firstSyncAt` | `monitoring_links.status` (`monitoring_link_status`, ברירת מחדל `pending`) + `first_sync_at` | לאמץ `status` |
| `EquipmentInventory`, `StringMap`, `KpiBaseline` (ישויות) | `monitoring_links.equipment/string_map/arrays/expected_kwh_month/pr_design` (jsonb) + `handover_packs.equipment_inventory/string_map` | jsonb מספיק ל-MVP; `StringMap` נשמר פעם אחת (ב-`monitoring_links`) ו-`handover_packs` מצביע אליו, לא מעתיק |
| `GridConnection.inspectionOrder{…}`, `meter{…}`, `operationApproval{…}`, `tariffRegistration{…}`, `operatingPermit{…}` (מקונן) | `grid_connections` שטוח: `iec_inspection_at/result`, `meter_*`, `operation_approved_at`, `tariff_track_ref/registered_at`, `operating_permit_ref/at`, `export_limit_kw` | השטוח מספיק; פרטי ההזמנה/אגרה/SLA חיים ב-`SubmissionStep` של מפרט 13 (`insp.*`), לא ב-`grid_connections` |
| `Inspector` ישות + `licenseType 1\|2\|3` | `inspections.inspector_type 'type1'\|'type2'\|'type3'`, `inspector_user_id`, `inspector_license` (אין טבלת inspectors) | להוסיף טבלת `inspectors` (או `app_users` עם role=inspector + שדות רישיון) כדי שיהיה יומן/תוקף רישיון |
| `TestRecord` JSON מקונן | `test_results` שורתי | ראו b.6 — JSON קנוני, שורות נגזרות |
| `Defect.status` כולל `retest_pending`, `waived`, `blocksConnection`, `origin` | `defects.status` (`defect_status`), `verified_at/by` | להרחיב את ה-enum או למפות `retest_pending→open+task`, `waived→closed+note` |
| `ServiceTicket.status` (new…closed, 11 מצבים) | `service_tickets.status` = `task_status` (todo/done/cancelled…) | ל-MVP `task_status`; המצבים המפורטים כ-`timeline` jsonb |
| `MaintenanceContract.includes/sla` | `maintenance_contracts.terms` jsonb | זהה — לשים את המבנה מ-h.1 בתוך `terms` |
| Document kinds: `iec_inspection_form`, `iec_inspection_pass`, `iec_defect_list`, `installer_declaration`, `designer_declaration`, `operation_approval`, `as_made_set`, `tariff_registration_request`, `producer_contract`, `operating_permit` | זהים במפרט 13 | מאומץ כאן |
| `01-lifecycle-stages.json` S10 documents: `iec_final_pack`, `as_made_set`; S09: `inspector_report_pdf`, `iec62446_tests` | מפרט 13 משתמש ב-`document:iec_final_pack` | תואם |

### i.5 מה לא נוגעים בו
- לוגיקת `background-sync.ts` (gating brownout, בחירת v1/v2, scraper fallback) עד שהמתזמן החדש מוכח ב-staging; האדפטרים רק עוטפים.
- parsers של V2 עם `GUESSED` — מתוקנים רק אחרי ה-probe עם המפתח האמיתי (צעד 1–2 ב-handoff), לא במסגרת מפרט זה.
- `/status/*` נשאר Tailscale-only; endpoints חדשים נכנסים תחת אותו prefix.

---

## נספח: Jobs חדשים (pg-boss) לפי שלב

| job | שלב | טריגר | outbound |
|---|---|---|---|
| `assign_crew`, `sync_calendar`, `open_checklist`, `collect_photos`, `build_as_made_rev` | S08 | כניסה/סגירת שלב | — |
| `select_inspector_type_by_rule`, `book_inspector`, `generate_test_report`, `defects_to_tasks`, `schedule_retest` | S09 | אירועים | בודק (pick) |
| `fill_final_forms`, `generate_as_made`, `order_iec_inspection_pack`, `schedule_iec_inspection`, `record_meter`, `register_tariff_track_portal`, `operating_permit_if_required`, `iec_sla_watch` | S10 | אירועים/cron | — (הגשה ידנית) |
| `commissioning_checklist`, `merge_handover_pack`, `register_warranties`, `create_monitoring_link`, `verify_first_sync`, `collect_iec_data_consent`, `compute_expected_yield`, `issue_final_invoice` | S11 | אירועים | לקוח (pick) |
| `poll_plan_daily`, `poll_site`, `kpi_daily`, `kpi_monthly`, `reconcile_iec_monthly`, `alerts_to_tickets`, `escalate_unacked`, `periodic_inspection_schedule`, `warranty_due`, `contract_renewal_reminder`, `contract_billing`, `morning_report_rows` | S12 | cron | self-chat / לקוח (pick) |
